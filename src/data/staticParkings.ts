import i18n from 'i18next';

import raw from '../../data/parkings-static.json';
import { distanceMeters } from './geo';
import type { Parking, StaticSource } from './types';

/**
 * Car parks without occupancy data, bundled with the app: the İzelman
 * inventory and OpenStreetMap, refreshed by scripts/fetch-sources.mjs. They
 * widen coverage to the whole province; their free-space count always reads
 * "Doluluk bilgisi yok".
 */
type StaticRecord = {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  capacity: number | null;
  isPaid: boolean | null;
  isIndoor: boolean | null;
  nonstop: boolean | null;
  openingHoursText: string | null;
  operator: string | null;
  address: string | null;
  access: 'customers' | 'subscribers' | null;
  source: StaticSource;
};

type StaticFile = { generatedAt: string; parkings: StaticRecord[] };

/** A static record this close to a live one is the same car park. */
export const DUPLICATE_RADIUS_M = 80;

function displayName(r: StaticRecord): string {
  if (r.name) return r.name;
  if (r.operator) return i18n.t('parking.operatorParking', { operator: r.operator });
  return i18n.t('parking.unnamed');
}

export function toParking(r: StaticRecord, generatedAt: string): Parking {
  return {
    id: r.id,
    name: displayName(r),
    lat: r.lat,
    lng: r.lng,
    capacity: r.capacity,
    free: null,
    isIndoor: r.isIndoor,
    isOpen: null,
    isPaid: r.isPaid,
    nonstop: r.nonstop,
    openingHours: null,
    openingHoursText: r.openingHoursText,
    operator: r.operator,
    access: r.access,
    address: r.address,
    source: r.source,
    updatedAt: null,
    fetchedAt: generatedAt,
    occupancyKind: 'estimated',
  };
}

let cache: Parking[] | null = null;

/** Converted lazily so i18n is ready and startup stays fast. */
export function staticParkings(): Parking[] {
  if (!cache) {
    const file = raw as StaticFile;
    cache = file.parkings.map((r) => toParking(r, file.generatedAt));
  }
  return cache;
}

/** Live records first; static ones are added unless they duplicate a live one. */
export function withStatic(live: Parking[], statics: Parking[] = staticParkings()): Parking[] {
  const extra = statics.filter(
    (s) => !live.some((l) => distanceMeters(l, s) <= DUPLICATE_RADIUS_M),
  );
  return [...live, ...extra];
}
