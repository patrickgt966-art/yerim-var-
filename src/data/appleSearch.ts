import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { YerimMapKit, type ApplePlaceResult } from '../../modules/yerim-mapkit';
import { appleSearchAvailable } from './appleParkings';
import { activeCity, isInCityArea } from './cities';
import { distanceMeters, type LatLng } from './geo';
import { fold, type SearchHit } from './search';

/** Bias region: the whole province, centred on the active city, so no user position is sent. */
const REGION_RADIUS_M = 60_000;
export const APPLE_MIN_CHARS = 3;
const MIN_CHARS = APPLE_MIN_CHARS;
const DEBOUNCE_MS = 400;

/**
 * Apple results as search hits. The region only biases Apple's search, so a same-named place in
 * another province can come back: hits outside the active city's area are left out, as they would
 * be shown and used as a search point in the wrong city.
 */
export function toAppleHits(rows: ApplePlaceResult[]): SearchHit[] {
  const out: SearchHit[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    if (!isInCityArea({ lat: r.latitude, lng: r.longitude })) continue;
    out.push({
      name,
      kind: 'apple',
      lat: r.latitude,
      lng: r.longitude,
      subtitle: r.address.trim() || undefined,
    });
  }
  return out;
}

/** Local hits first; Apple hits only when they are not the same place. */
export function mergeHits(local: SearchHit[], apple: SearchHit[], limit = 8): SearchHit[] {
  const out = [...local];
  for (const a of apple) {
    if (out.length >= limit) break;
    const dup = out.some((h) => fold(h.name) === fold(a.name) && distanceMeters(h, a) <= 300);
    if (!dup) out.push(a);
  }
  return out;
}

/** Apple Maps free-text search; throws when Apple fails (offline, throttled). */
export async function fetchApplePlaces(query: string, center: LatLng): Promise<SearchHit[]> {
  const q = query.trim();
  if (!YerimMapKit || q.length < MIN_CHARS) return [];
  const rows = await YerimMapKit.searchPlacesAsync(q, center.lat, center.lng, REGION_RADIUS_M);
  return toAppleHits(rows);
}

/** Apple Maps free-text search ("Sevil 2 İş Hanı"); empty where unavailable. */
export async function searchApplePlaces(
  query: string,
  center: LatLng = activeCity().center,
): Promise<SearchHit[]> {
  try {
    return await fetchApplePlaces(query, center);
  } catch {
    // Offline or throttled: local suggestions and the geocoder still work.
    return [];
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Apple suggestions for the search box, debounced so typing stays cheap.
 * `forQuery` is the folded text the results belong to: callers must ignore
 * them unless it matches what is in the box now.
 */
export function useAppleSuggestions(query: string) {
  const q = useDebounced(query.trim(), DEBOUNCE_MS);
  const result = useQuery({
    queryKey: ['apple-places', activeCity().id, fold(q)],
    // A failure stays an error, not a cached empty list: the same text asks Apple again.
    queryFn: () => fetchApplePlaces(q, activeCity().center),
    enabled: appleSearchAvailable && q.length >= MIN_CHARS,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  return { ...result, forQuery: fold(q) };
}
