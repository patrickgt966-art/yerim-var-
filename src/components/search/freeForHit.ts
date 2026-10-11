import { distanceMeters } from '@/data/geo';
import { visibleFree } from '@/data/freshness';
import type { SearchHit } from '@/data/search';
import type { Parking } from '@/data/types';

/** A place hit and a car park closer than this are the same car park. */
export const SAME_PARKING_METERS = 60;

/**
 * Free-space count for a car park search hit, or null when it is not a car park or
 * no known car park with a fresh count sits at the same spot.
 */
export function freeForHit(
  hit: Pick<SearchHit, 'kind' | 'lat' | 'lng'>,
  parkings: Parking[],
  now: Date = new Date(),
): number | null {
  if (hit.kind !== 'parking') return null;
  let free: number | null = null;
  let bestD = SAME_PARKING_METERS;
  for (const p of parkings) {
    const d = distanceMeters(hit, p);
    const f = d <= bestD ? visibleFree(p, now) : null;
    if (f != null) {
      free = f;
      bestD = d;
    }
  }
  return free;
}
