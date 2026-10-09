import type { TFunction } from 'i18next';

import raw from '../../data/food-izmir.json';
import { getFreshness } from './freshness';
import { distanceMeters, type LatLng } from './geo';
import type { Parking } from './types';

/**
 * Restaurants, cafés and bars from OpenStreetMap, bundled with the app and
 * refreshed by scripts/fetch-sources.mjs. The value is the parking next to
 * them; we hold no ratings, prices or photos and never show any.
 */
type FoodRecord = {
  id: string;
  n: string;
  a: number;
  o: number;
  k: string;
  c?: string[];
  h?: string;
  p?: string;
  w?: string;
  ig?: string;
  ad?: string;
  out?: boolean;
  wc?: boolean;
  res?: boolean;
};

type FoodFile = { generatedAt: string; items: FoodRecord[] };

export type RestaurantKind =
  'restaurant' | 'cafe' | 'fast_food' | 'bar' | 'pub' | 'biergarten' | 'food_court' | 'ice_cream';

export type Restaurant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  cuisines: string[];
  /** Raw OSM opening_hours text. */
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  outdoorSeating: boolean | null;
  wheelchair: boolean | null;
  reservation: boolean | null;
};

export type NearbyRestaurant = Restaurant & { distanceM: number };

export function toRestaurant(r: FoodRecord): Restaurant {
  return {
    id: r.id,
    name: r.n,
    lat: r.a,
    lng: r.o,
    kind: r.k,
    cuisines: r.c ?? [],
    openingHours: r.h ?? null,
    phone: r.p ?? null,
    website: r.w ?? null,
    instagram: r.ig ?? null,
    address: r.ad ?? null,
    outdoorSeating: r.out ?? null,
    wheelchair: r.wc ?? null,
    reservation: r.res ?? null,
  };
}

let cache: Restaurant[] | null = null;
let byId: Map<string, Restaurant> | null = null;

export function allRestaurants(): Restaurant[] {
  if (!cache) cache = (raw as FoodFile).items.map(toRestaurant);
  return cache;
}

export function getRestaurant(id: string): Restaurant | null {
  if (!byId) byId = new Map(allRestaurants().map((r) => [r.id, r]));
  return byId.get(id) ?? null;
}

/** Nearest first, within radiusM metres of the target. */
export function restaurantsNear(
  target: LatLng,
  radiusM = 1000,
  limit = 60,
  list: Restaurant[] = allRestaurants(),
): NearbyRestaurant[] {
  const out: NearbyRestaurant[] = [];
  for (const r of list) {
    const distanceM = distanceMeters(target, r);
    if (distanceM <= radiusM) out.push({ ...r, distanceM });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

/** OSM amenity value to the i18n key under `food.kinds`. */
const KIND_KEYS: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  fast_food: 'fast_food',
  bar: 'bar',
  pub: 'pub',
  biergarten: 'biergarten',
  food_court: 'food_court',
  ice_cream: 'ice_cream',
};

/** OSM cuisine code to the i18n key under `food.cuisines`; others are left out. */
const CUISINE_KEYS: Record<string, string> = {
  coffee_shop: 'coffee_shop',
  coffee: 'coffee_shop',
  kahve: 'coffee_shop',
  turkish: 'turkish',
  burger: 'burger',
  pizza: 'pizza',
  kebab: 'kebab',
  doner: 'kebab',
  chicken: 'chicken',
  sandwich: 'sandwich',
  seafood: 'seafood',
  regional: 'regional',
  local: 'regional',
  fish: 'fish',
  breakfast: 'breakfast',
  dessert: 'dessert',
  cake: 'dessert',
  pastry: 'dessert',
  italian: 'italian',
  pasta: 'pasta',
  tea: 'tea',
  çay: 'tea',
  steak_house: 'steak_house',
  meyhane: 'meyhane',
  ice_cream: 'ice_cream',
  asian: 'asian',
  sushi: 'sushi',
  japanese: 'japanese',
  chinese: 'chinese',
  homestyle: 'homestyle',
  cig_kofte: 'cig_kofte',
  çiğköfte: 'cig_kofte',
  donut: 'donut',
  bagel: 'bagel',
  pide: 'pide',
  lahmacun: 'lahmacun',
  barbecue: 'grill',
  grill: 'grill',
  soup: 'soup',
  waffle: 'waffle',
  pancake: 'waffle',
  mediterranean: 'mediterranean',
};

export function kindLabel(kind: string, t: TFunction): string | null {
  const key = KIND_KEYS[kind];
  return key ? t(`food.kinds.${key}`) : null;
}

/** Turkish labels for known cuisine codes; unknown codes are dropped, duplicates merged. */
export function cuisineLabels(codes: string[], t: TFunction): string[] {
  const keys = new Set<string>();
  for (const code of codes) {
    const key = CUISINE_KEYS[code];
    if (key) keys.add(key);
  }
  return [...keys].map((k) => t(`food.cuisines.${k}`));
}

/** Kind filter groups on the list screen. */
export type KindGroup = 'restaurant' | 'cafe' | 'fast_food' | 'bar';

export function kindGroup(kind: string): KindGroup | null {
  switch (kind) {
    case 'restaurant':
    case 'food_court':
      return 'restaurant';
    case 'cafe':
    case 'ice_cream':
      return 'cafe';
    case 'fast_food':
      return 'fast_food';
    case 'bar':
    case 'pub':
    case 'biergarten':
      return 'bar';
    default:
      return null;
  }
}

export const NEAREST_PARKING_RADIUS_M = 500;

/** Nearest car park within 500 m of the restaurant, or null. */
export function nearestParking(
  restaurant: LatLng,
  parkings: Parking[],
): { parking: Parking; distanceM: number } | null {
  let best: { parking: Parking; distanceM: number } | null = null;
  for (const parking of parkings) {
    const distanceM = distanceMeters(restaurant, parking);
    if (distanceM <= NEAREST_PARKING_RADIUS_M && (!best || distanceM < best.distanceM))
      best = { parking, distanceM };
  }
  return best;
}

/**
 * Nearest car park for a list row. The free count follows the app's rules:
 * only for fresh real data, with the time it was fetched; never for sample
 * (mock) data, stale data or static records.
 */
export function parkingSummary(
  restaurant: LatLng,
  parkings: Parking[],
  now: Date = new Date(),
): { distanceM: number; free: number | null; at: Date | null } | null {
  const np = nearestParking(restaurant, parkings);
  if (!np) return null;
  const f = getFreshness(np.parking, now);
  const fresh = (f.kind === 'live' || f.kind === 'updated') && np.parking.free != null;
  return {
    distanceM: Math.round(np.distanceM),
    free: fresh ? np.parking.free : null,
    at: fresh ? f.at : null,
  };
}

/** First dialable number; OSM may hold several separated by ";" "," or "/". */
export function telUrl(phone: string): string | null {
  for (const part of phone.split(/[;,/]/)) {
    const trimmed = part.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7) return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
  }
  return null;
}
