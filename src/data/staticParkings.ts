import i18next, { t } from 'i18next';

import { activeCity } from './cities';
import { staticParkingsFile } from './cityData';
import { distanceMeters, gridIndex, near } from './geo';
import { cleanName } from './names';
import { isHeavyVehicleName } from './tariffs';
import type { Parking, StaticSource } from './types';

/**
 * Car parks without occupancy data, bundled with the app: the İzelman
 * inventory and OpenStreetMap, refreshed by scripts/fetch-sources.mjs. They
 * widen coverage to the whole province; their free-space count always reads
 * "Doluluk bilgisi yok".
 */
export type StaticRecord = {
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

// Keyed by city id and language: switching city must never serve another city's car parks, and
// the generic names ("Otopark · X yakını") are built in the language active at that time.
const caches = new Map<string, Parking[]>();

/**
 * Converted lazily so i18n is ready and startup stays fast. Empty for a placeholder file. Bus,
 * truck and minibus parks ("Tır Parkı", "Otobüs Otoparkı") are left out: the app is for cars.
 */
export function staticParkings(): Parking[] {
  const id = activeCity().id;
  const key = `${id}|${i18next.language ?? ''}`;
  let list = caches.get(key);
  if (!list) {
    const file = staticParkingsFile(id);
    const generatedAt = file.generatedAt ?? new Date(0).toISOString();
    list = (file.parkings ?? [])
      .filter((r) => !isHeavyVehicleName(r.name))
      .map((r) => toParking(r, generatedAt));
    caches.set(key, list);
  }
  return list;
}

/** Name words without the generic ones, for "is this the same car park?". */
const NAME_FILLER = new Set(['otopark', 'otoparkı', 'otoparki', 'katlı', 'yol', 'kenarı', 'açık']);
function nameKey(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !NAME_FILLER.has(w))
    .sort()
    .join(' ');
}

/**
 * Live records first; static ones are added unless they duplicate a live one. Within
 * DUPLICATE_RADIUS_M a static record is the live one's twin when it is the static record
 * nearest to it, carries the same name, or has no name of its own. A differently named car
 * park next door (another street segment, a garage beside a kerb) stays.
 */
export function withStatic(live: Parking[], statics: Parking[] = staticParkings()): Parking[] {
  if (live.length === 0) return [...statics];
  // Grid lookups instead of live × static distance checks.
  const liveIndex = gridIndex(live, DUPLICATE_RADIUS_M);
  const staticIndex = gridIndex(statics, DUPLICATE_RADIUS_M);
  const twins = new Set<Parking>();
  for (const l of live) {
    const close = near(staticIndex, l, DUPLICATE_RADIUS_M);
    // Its namesake when there is one, else the nearest record.
    const key = nameKey(l.name);
    let best: Parking | null = close.find((s) => nameKey(s.name) === key) ?? null;
    let bestM = Infinity;
    if (!best) {
      for (const s of close) {
        const m = distanceMeters(l, s);
        if (m < bestM) {
          best = s;
          bestM = m;
        }
      }
    }
    if (best) twins.add(best);
  }
  const extra = statics.filter((s) => {
    const close = near(liveIndex, s, DUPLICATE_RADIUS_M);
    if (close.length === 0) return true;
    if (twins.has(s) || s.genericName) return false;
    const key = nameKey(s.name);
    return !close.some((l) => nameKey(l.name) === key);
  });
  return [...live, ...extra];
}
