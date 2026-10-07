import { useQuery, type QueryClient } from '@tanstack/react-query';

import { YerimMapKit, type ApplePlace } from '../../modules/yerim-mapkit';
import { distanceMeters, type LatLng } from './geo';
import type { Parking } from './types';

/** An Apple result this close to a known car park is the same one. */
export const APPLE_DUPLICATE_M = 60;
const RADIUS_M = 1500;

/** True only in builds that include the native module (not in Expo Go). */
export const appleSearchAvailable = YerimMapKit != null;

export function fromApple(r: ApplePlace, fetchedAt: string): Parking | null {
  const name = r.name.trim();
  if (!name || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
  return {
    // Apple gives no stable id; coordinates to ~1 m identify the place.
    id: `apple-${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}`,
    name,
    lat: r.latitude,
    lng: r.longitude,
    capacity: null,
    free: null,
    isIndoor: null,
    isOpen: null,
    isPaid: null,
    nonstop: null,
    openingHours: null,
    address: r.address.trim() || null,
    source: 'apple',
    updatedAt: null,
    fetchedAt,
    occupancyKind: 'estimated',
  };
}

/** Adds Apple results that are not already known (live or bundled). */
export function withApple(known: Parking[], apple: Parking[]): Parking[] {
  const extra = apple.filter((a) => !known.some((k) => distanceMeters(k, a) <= APPLE_DUPLICATE_M));
  return [...known, ...extra];
}

async function searchApple(target: LatLng): Promise<Parking[]> {
  if (!YerimMapKit) return [];
  const at = new Date().toISOString();
  const rows = await YerimMapKit.searchParkingAsync(target.lat, target.lng, RADIUS_M);
  return rows.map((r) => fromApple(r, at)).filter((p): p is Parking => p != null);
}

/**
 * Apple Maps car parks around a target. Disabled (empty) where the native
 * module is missing. Rounded to ~100 m so nearby searches share a result and
 * stay well inside Apple's request limits; kept in memory only.
 */
export function useAppleParkings(target: LatLng | null) {
  const key = target ? [target.lat.toFixed(3), target.lng.toFixed(3)] : null;
  return useQuery({
    queryKey: ['apple-parkings', key],
    queryFn: () => searchApple(target!),
    enabled: appleSearchAvailable && target != null,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** Detail screen lookup: Apple results live only in the query cache. */
export function findAppleParking(client: QueryClient, id: string): Parking | undefined {
  if (!id.startsWith('apple-')) return undefined;
  for (const [, list] of client.getQueriesData<Parking[]>({ queryKey: ['apple-parkings'] })) {
    const hit = list?.find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}
