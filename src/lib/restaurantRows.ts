import { gridIndex, near, type LatLng } from '@/data/geo';
import {
  NEAREST_PARKING_RADIUS_M,
  parkingInfo,
  type NearbyRestaurant,
  type RestaurantRow,
} from '@/data/restaurants';
import type { Parking } from '@/data/types';

/** Rows lie within a few km of the target; only car parks near that circle can matter. */
const MARGIN_M = 600;
const CELL_M = 300;

/**
 * Rows with their nearest car park. Scanning every car park for every row is
 * slow (about 3 ms per row), so car parks are first cut down to the circle
 * around the target and then looked up through a grid.
 */
export function buildRestaurantRows(
  shown: NearbyRestaurant[],
  parkings: Parking[],
  target: LatLng | null,
  now: Date = new Date(),
): RestaurantRow[] {
  if (shown.length === 0) return [];
  let candidates = parkings;
  if (target) {
    const reach = Math.max(...shown.map((r) => r.distanceM)) + NEAREST_PARKING_RADIUS_M + MARGIN_M;
    // Cheap bounding box first, exact distance is checked by `near` later.
    const dLat = reach / 111_320;
    const dLng = dLat / Math.max(0.1, Math.cos((target.lat * Math.PI) / 180));
    candidates = parkings.filter(
      (p) => Math.abs(p.lat - target.lat) <= dLat && Math.abs(p.lng - target.lng) <= dLng,
    );
  }
  const index = gridIndex(candidates, CELL_M);
  return shown.map((r) => ({
    r,
    ...parkingInfo(r, near(index, r, NEAREST_PARKING_RADIUS_M), now),
  }));
}
