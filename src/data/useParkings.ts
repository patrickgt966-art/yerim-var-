import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isClosedNow } from '@/lib/openNow';
import { useNow } from '@/lib/useNow';
import { useAppleParkings, withApple } from './appleParkings';
import { deviceCache } from './cache';
import { visibleFree } from './freshness';
import { distanceMeters, walkMinutes, type LatLng } from './geo';
import { isNearPier } from './places';
import { loadParkings } from './repository';
import { withStatic } from './staticParkings';
import type { Parking, ParkingResult } from './types';

export const PARKINGS_QUERY_KEY = ['parkings'] as const;

export const parkingsQuery = queryOptions({
  queryKey: PARKINGS_QUERY_KEY,
  // No `signal`: TanStack cancels a query whose signal was read when its last
  // screen unmounts, which would throw away a ~15 s download. Let it finish
  // so the result is cached for the next screen.
  queryFn: () => loadParkings(),
  staleTime: 60_000,
  // Refetch only while the app is in the foreground (see focusManager in _layout).
  refetchInterval: 120_000,
  refetchIntervalInBackground: false,
  // loadParkings retries and falls back itself, so the query never fails.
  retry: false,
  // Keep the last result for the whole session so screens never wait twice.
  gcTime: Infinity,
});

/**
 * Shown until the first download (or a saved result) arrives: no live
 * records, only the bundled car parks are added by `addStatic`. It carries no
 * fallbackReason, so nothing claims the download failed.
 */
export const STATIC_ONLY_PLACEHOLDER: ParkingResult = {
  parkings: [],
  source: 'static-only',
  fetchedAt: new Date(0).toISOString(),
};

// One merge per result object, shared by every screen that observes the query.
const merged = new WeakMap<ParkingResult, ParkingResult>();

/**
 * Adds bundled OpenStreetMap/İzelman car parks to real data. Sample data is
 * never displayed when the bundled car parks exist: they replace it, marked
 * 'static-only' (the fallbackReason is kept), so no fake counts or pins show.
 */
export function addStatic(result: ParkingResult): ParkingResult {
  const hit = merged.get(result);
  if (hit) return hit;
  let out: ParkingResult;
  if (result.source === 'mock') {
    const statics = withStatic([]);
    out = statics.length > 0 ? { ...result, source: 'static-only', parkings: statics } : result;
  } else {
    out = { ...result, parkings: withStatic(result.parkings) };
  }
  merged.set(result, out);
  return out;
}

export function useParkings() {
  return useQuery({
    ...parkingsQuery,
    select: addStatic,
    placeholderData: STATIC_ONLY_PLACEHOLDER,
  });
}

/**
 * Shows the last saved result right away on launch while the first download
 * runs. It keeps its original fetchedAt, so the 15 minute rule still hides
 * old counts, and it is marked stale so the download is not skipped.
 */
export async function primeParkingsFromCache(client: QueryClient) {
  // Primed data has no observer yet; keep it until the results screen opens.
  client.setQueryDefaults(PARKINGS_QUERY_KEY, { gcTime: Infinity });
  const cached = await deviceCache.load();
  if (!cached || client.getQueryData(PARKINGS_QUERY_KEY)) return;
  client.setQueryData(PARKINGS_QUERY_KEY, cached, { updatedAt: 0 });
}

/**
 * Starts the slow (~15 s) download at launch instead of when the results
 * screen opens, so it usually finishes while the user is still typing.
 * Saved data is shown first; the download replaces it when it arrives.
 */
export async function warmUpParkings(client: QueryClient) {
  await primeParkingsFromCache(client);
  await client.prefetchQuery(parkingsQuery);
}

export const MAX_STATIC_RESULTS = 60;

export type RankedParking = Parking & {
  distance: number;
  walk: number;
  nearPier: boolean;
};

/** Parkings sorted by distance to a target, limited to a radius. */
export function rankByDistance(
  list: Parking[],
  target: LatLng,
  radiusMeters = 1500,
): RankedParking[] {
  const sorted = list
    .map((p) => ({ p, distance: distanceMeters(target, p) }))
    .filter((x) => x.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
  // Dense areas have hundreds of static car parks; keep the list and map
  // light, but never drop one that has occupancy data.
  let statics = 0;
  const out: RankedParking[] = [];
  for (const { p, distance } of sorted) {
    const isStatic = p.source === 'osm' || p.source === 'izelman' || p.source === 'apple';
    if (isStatic && ++statics > MAX_STATIC_RESULTS) continue;
    out.push({ ...p, distance, walk: walkMinutes(target, p), nearPier: isNearPier(p) });
  }
  return out;
}

/** Within this extra distance a car park with data beats one without. */
export const LIVE_PREFERENCE_METERS = 400;

const STATIC_SOURCES = new Set(['osm', 'izelman', 'apple']);

type Openable = Partial<Pick<Parking, 'isOpen' | 'nonstop' | 'openingHours' | 'openingHoursText'>>;

/**
 * Static car parks (OSM, İzelman, Apple) carry no occupancy. If the nearest
 * open entry is one, move car parks from a live source that lie within
 * LIVE_PREFERENCE_METERS of it ahead of all static ones. Closed car parks
 * (see openState) are never promoted and end up after open/unknown ones.
 * Input must already be sorted by distance; relative order inside each group
 * is kept.
 */
export function preferLive<T extends { source: string; distance: number } & Openable>(
  ranked: T[],
  now: Date = new Date(),
): T[] {
  const closed = new Set(ranked.filter((p) => isClosedNow(p, now)));
  const open = closed.size === 0 ? ranked : ranked.filter((p) => !closed.has(p));
  const first = open[0];
  let head: T[] = open;
  if (first && STATIC_SOURCES.has(first.source)) {
    const limit = first.distance + LIVE_PREFERENCE_METERS;
    const promoted = open.filter((p) => !STATIC_SOURCES.has(p.source) && p.distance <= limit);
    if (promoted.length > 0) head = [...promoted, ...open.filter((p) => !promoted.includes(p))];
  }
  if (head === ranked) return ranked;
  return closed.size === 0 ? head : [...head, ...ranked.filter((p) => closed.has(p))];
}

/**
 * "Hemen bul": moves the first open car park with a visible free space to the
 * top, but only when it lies within LIVE_PREFERENCE_METERS of the nearest open
 * one. Returns the list unchanged otherwise.
 */
export function promoteFree<T extends Parking & { distance: number }>(
  list: T[],
  now: Date = new Date(),
): T[] {
  const open = list.filter((p) => !isClosedNow(p, now));
  const nearest = open.reduce((m, p) => Math.min(m, p.distance), Infinity);
  const i = list.findIndex(
    (p) =>
      !isClosedNow(p, now) &&
      (visibleFree(p, now) ?? 0) > 0 &&
      p.distance <= nearest + LIVE_PREFERENCE_METERS,
  );
  return i > 0 ? [list[i]!, ...list.filter((_, j) => j !== i)] : list;
}

/** Radii tried in turn when the area is empty (metres). */
export const WIDEN_RADII_METERS = [5000, 10_000];

export function useRanked(target: LatLng | null, radiusMeters?: number) {
  const q = useParkings();
  // Apple Maps car parks around the target, where the native module exists.
  const apple = useAppleParkings(target);
  // Re-rank every minute so open/closed state follows the clock.
  const minute = Math.floor(useNow(60_000) / 60_000);
  const { ranked, widenedKm } = useMemo(() => {
    if (!q.data || !target) return { ranked: [] as RankedParking[], widenedKm: null };
    // Never mix real Apple results into sample data.
    const list =
      q.data.source === 'mock' ? q.data.parkings : withApple(q.data.parkings, apple.data ?? []);
    const now = new Date(minute * 60_000);
    let found = rankByDistance(list, target, radiusMeters);
    let km: number | null = null;
    // Province towns (Özdere, Dalyan…) have no car park within the default radius.
    // Only the default radius widens; callers that pass a radius (restaurant page) keep it.
    for (const r of radiusMeters === undefined ? WIDEN_RADII_METERS : []) {
      if (found.length > 0) continue;
      found = rankByDistance(list, target, r);
      km = r / 1000;
    }
    return { ranked: preferLive(found, now), widenedKm: found.length > 0 ? km : null };
  }, [q.data, apple.data, target, radiusMeters, minute]);
  /** `widenedKm`: 5 or 10 when the list only appeared after widening the search, else null. */
  return { ...q, ranked, widenedKm };
}
