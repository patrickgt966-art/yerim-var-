import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { distanceMeters, walkMinutes, type LatLng } from './geo';
import { isNearPier } from './places';
import { loadParkings } from './repository';
import type { Parking } from './types';

export const PARKINGS_QUERY_KEY = ['parkings'] as const;

export function useParkings() {
  return useQuery({
    queryKey: PARKINGS_QUERY_KEY,
    queryFn: ({ signal }) => loadParkings(undefined, undefined, signal),
    staleTime: 60_000,
    // Refetch only while the app is in the foreground (see focusManager in _layout).
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export type RankedParking = Parking & {
  distance: number;
  walk: number;
  nearPier: boolean;
};

/** Parkings sorted by distance to a target, limited to a radius. */
export function rankByDistance(list: Parking[], target: LatLng, radiusMeters = 1500): RankedParking[] {
  return list
    .map((p) => ({
      ...p,
      distance: distanceMeters(target, p),
      walk: walkMinutes(target, p),
      nearPier: isNearPier(p),
    }))
    .filter((p) => p.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
}

export function useRanked(target: LatLng | null, radiusMeters?: number) {
  const q = useParkings();
  const ranked = useMemo(
    () => (q.data && target ? rankByDistance(q.data.parkings, target, radiusMeters) : []),
    [q.data, target, radiusMeters],
  );
  return { ...q, ranked };
}
