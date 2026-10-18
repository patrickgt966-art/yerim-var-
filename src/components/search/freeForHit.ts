import { distanceMeters } from '@/data/geo';
import { visibleFree } from '@/data/freshness';
import type { SearchHit } from '@/data/search';
import type { Parking } from '@/data/types';
import { isStatic } from '@/lib/staticInfo';

/** A place hit and a car park closer than this are the same car park. */
export const SAME_PARKING_METERS = 60;

/**
 * Free-space count for a car park search hit, or null when it is not a car park or the car park
 * at that spot has no count we may show. The hit's car park is the nearest one within
 * SAME_PARKING_METERS that reports counts (a static OSM / İzelman / Apple duplicate of it is
 * skipped); a stale count of that car park is hidden, never replaced by a neighbour's.
 */
export function freeForHit(
  hit: Pick<SearchHit, 'kind' | 'lat' | 'lng'>,
  parkings: Parking[],
  now: Date = new Date(),
): number | null {
  const match = parkingForHit(hit, parkings);
  return match ? visibleFree(match, now) : null;
}

/** The car park a car park search hit stands for (see freeForHit), or null. */
export function parkingForHit(
  hit: Pick<SearchHit, 'kind' | 'lat' | 'lng'>,
  parkings: Parking[],
): Parking | null {
  if (hit.kind !== 'parking') return null;
  let match: Parking | null = null;
  let bestD = SAME_PARKING_METERS;
  for (const p of parkings) {
    if (isStatic(p)) continue;
    const d = distanceMeters(hit, p);
    if (d <= bestD) {
      match = p;
      bestD = d;
    }
  }
  return match;
}
