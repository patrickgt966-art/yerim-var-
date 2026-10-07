import raw from '../../data/places.json';
import { distanceMeters, type LatLng } from './geo';

export type Place = { id: string; name: string; district: string; icon: string } & LatLng;

export const POPULAR_PLACES = raw.popular as Place[];
export const PIERS = raw.piers as ({ name: string } & LatLng)[];

export const IZMIR_CENTER: LatLng = { lat: 38.4237, lng: 27.1428 };

export function isNearPier(p: LatLng, maxMeters = 400): boolean {
  return PIERS.some((pier) => distanceMeters(p, pier) <= maxMeters);
}
