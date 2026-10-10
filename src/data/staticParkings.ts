import { t } from 'i18next';

import raw from '../../data/parkings-static.json';
import { gridIndex, near } from './geo';
import { cleanName } from './names';
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
  /** Nearest named place within 400 m, for unnamed car parks. */
  near?: string | null;
  /** OSM capacity:disabled, when tagged. */
  disabledCapacity?: number;
  /** OSM wheelchair tag, when tagged. */
  wheelchair?: 'yes' | 'limited' | 'no';
};

type StaticFile = { generatedAt: string; parkings: StaticRecord[] };

/** A static record this close to a live one is the same car park. */
export const DUPLICATE_RADIUS_M = 80;

/** OSM sometimes stores the word itself as the name; that is no name. */
function ownName(r: StaticRecord): string | null {
  const n = r.name ? cleanName(r.name) : '';
  return n && n.toLocaleLowerCase('tr') !== 'otopark' ? n : null;
}

function displayName(r: StaticRecord): string {
  const own = ownName(r);
  if (own) return own;
  if (r.operator) return t('parking.operatorParking', { operator: r.operator });
  if (r.near) return t('parking.nearby', { place: cleanName(r.near) });
  return t('parking.unnamed');
}

export function toParking(r: StaticRecord, generatedAt: string): Parking {
  return {
    id: r.id,
    name: displayName(r),
    genericName: !ownName(r),
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
    ...(typeof r.disabledCapacity === 'number' ? { disabledCapacity: r.disabledCapacity } : {}),
    ...(r.wheelchair ? { wheelchair: r.wheelchair } : {}),
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
  if (live.length === 0) return [...statics];
  // Grid lookup instead of live × static distance checks.
  const index = gridIndex(live, DUPLICATE_RADIUS_M);
  const extra = statics.filter((s) => near(index, s, DUPLICATE_RADIUS_M).length === 0);
  return [...live, ...extra];
}
