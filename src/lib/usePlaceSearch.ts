import { useDeferredValue, useMemo } from 'react';

import {
  APPLE_MIN_CHARS,
  mergeHits,
  searchApplePlaces,
  useAppleSuggestions,
} from '@/data/appleSearch';
import type { LatLng } from '@/data/geo';
import { fold, searchPlaces, type SearchHit } from '@/data/search';

import { geocode } from './location';

/** A stuck address lookup must not leave the busy flags set. */
export const GEOCODE_TIMEOUT_MS = 8000;

/**
 * Suggestions for a place search box: bundled İzmir places first, then Apple
 * Maps results (native builds). `localQuery` lets the caller search only part
 * of the text locally (e.g. the place part of "Bornova balık").
 */
export function usePlaceSearch(query: string, localQuery?: (q: string) => string) {
  // Typing stays responsive: the local search lags one render behind the text box.
  const deferredQuery = useDeferredValue(query);
  const settled = deferredQuery === query;
  const local = useMemo(
    () => searchPlaces(localQuery ? localQuery(deferredQuery) : deferredQuery),
    [localQuery, deferredQuery],
  );
  const apple = useAppleSuggestions(query);
  // Apple results are debounced: use them only for exactly the text in the box.
  const appleCurrent =
    apple.forQuery === fold(query.trim()) && query.trim().length >= APPLE_MIN_CHARS;
  const hits = useMemo(
    () => mergeHits(local, appleCurrent ? (apple.data ?? []) : []),
    [local, appleCurrent, apple.data],
  );
  return { hits, settled, deferredQuery };
}

/** Submit fallback when no suggestion matched: Apple search, then the geocoder. */
export async function resolvePlace(
  q: string,
): Promise<{ hit: SearchHit | null; point: LatLng | null }> {
  const [fromApple] = await searchApplePlaces(q);
  if (fromApple) return { hit: fromApple, point: fromApple };
  return { hit: null, point: await geocode(q, GEOCODE_TIMEOUT_MS) };
}
