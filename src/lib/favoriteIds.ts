import { distanceMeters } from '@/data/geo';
import { fold } from '@/data/search';
import type { Parking } from '@/data/types';

type FavoriteRef = { id: string; name: string; lat: number; lng: number };

const MATCH_RADIUS_M = 40;

/**
 * Finds the car park a saved favorite points at. İzelman ids used to depend on the CKAN row
 * order and shifted when the city republished the dataset, so an old `izelman-*` id that is
 * gone is matched by name and position instead. Other ids are never migrated.
 */
export function resolveFavoriteParking<
  P extends Pick<Parking, 'id' | 'name' | 'lat' | 'lng' | 'source'>,
>(fav: FavoriteRef, parkings: readonly P[]): P | null {
  const exact = parkings.find((p) => p.id === fav.id);
  if (exact) return exact;
  if (!fav.id.startsWith('izelman-')) return null;
  const name = fold(fav.name);
  let best: P | null = null;
  let bestM = Infinity;
  for (const p of parkings) {
    if (p.source !== 'izelman' || fold(p.name) !== name) continue;
    const m = distanceMeters(fav, p);
    if (m <= MATCH_RADIUS_M && m < bestM) {
      best = p;
      bestM = m;
    }
  }
  return best;
}
