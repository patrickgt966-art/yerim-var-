import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { deviceCache } from './cache';
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

/** Adds bundled OpenStreetMap car parks to real data (never to sample data). */
function addStatic(result: ParkingResult): ParkingResult {
  if (result.source === 'mock') return result;
  return { ...result, parkings: withStatic(result.parkings) };
}

export function useParkings() {
  return useQuery({ ...parkingsQuery, select: addStatic });
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
    const isStatic = p.source === 'osm' || p.source === 'izelman';
    if (isStatic && ++statics > MAX_STATIC_RESULTS) continue;
    out.push({ ...p, distance, walk: walkMinutes(target, p), nearPier: isNearPier(p) });
  }
  return out;
}

export function useRanked(target: LatLng | null, radiusMeters?: number) {
  const q = useParkings();
  const ranked = useMemo(
    () => (q.data && target ? rankByDistance(q.data.parkings, target, radiusMeters) : []),
    [q.data, target, radiusMeters],
  );
  return { ...q, ranked };
}
