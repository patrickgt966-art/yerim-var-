import type { LatLng } from './geo';
import { IZMIR_CENTER } from './places';

export type City = {
  id: string;
  name: string;
  /** Only cities with a working data source can be selected. */
  available: boolean;
  center: LatLng;
};

export const DEFAULT_CITY = 'izmir';

export const CITIES: City[] = [
  { id: 'izmir', name: 'İzmir', available: true, center: IZMIR_CENTER },
  { id: 'istanbul', name: 'İstanbul', available: false, center: { lat: 41.0082, lng: 28.9784 } },
  { id: 'ankara', name: 'Ankara', available: false, center: { lat: 39.9334, lng: 32.8597 } },
  { id: 'antalya', name: 'Antalya', available: false, center: { lat: 36.8969, lng: 30.7133 } },
  { id: 'bursa', name: 'Bursa', available: false, center: { lat: 40.1885, lng: 29.061 } },
];

/** True only for a known city that is open for use. */
export const isAvailableCity = (id: unknown): id is string =>
  typeof id === 'string' && CITIES.some((c) => c.id === id && c.available);

export const cityById = (id: string): City =>
  CITIES.find((c) => c.id === id) ?? CITIES.find((c) => c.id === DEFAULT_CITY)!;
