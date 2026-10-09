import raw from '../../data/places.json';
import { distanceMeters, type LatLng } from './geo';

export type Place = { id: string; name: string; district: string; icon: string } & LatLng;

export const POPULAR_PLACES = raw.popular as Place[];
export const PIERS = raw.piers as ({ name: string } & LatLng)[];

export const IZMIR_CENTER: LatLng = { lat: 38.4237, lng: 27.1428 };

export function isNearPier(p: LatLng, maxMeters = 400): boolean {
  return PIERS.some((pier) => distanceMeters(p, pier) <= maxMeters);
}

/**
 * Rough İzmir province box, also within 120 km of the centre (keeps out open
 * sea); a location outside is not a useful search centre.
 */
export function isInIzmirArea(p: LatLng): boolean {
  return (
    p.lat >= 37.8 &&
    p.lat <= 39.4 &&
    p.lng >= 26.2 &&
    p.lng <= 28.5 &&
    distanceMeters(p, IZMIR_CENTER) < 120_000
  );
}
