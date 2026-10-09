import type { TFunction } from 'i18next';

import raw from '../../data/food-izmir.json';
import { getFreshness } from './freshness';
import { distanceMeters, type LatLng } from './geo';
import { fold } from './search';
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

export type FoodCategory = 'breakfast' | 'meat' | 'fish' | 'cafe' | 'meyhane' | 'fast' | 'dessert';

export const FOOD_CATEGORIES: FoodCategory[] = [
  'breakfast',
  'meat',
  'fish',
  'cafe',
  'meyhane',
  'fast',
  'dessert',
];

type CategoryRule = {
  kinds?: string[];
  cuisines?: string[];
  names?: string[];
  /** Folded name parts that rule the name keywords out (raw çiğ köfte is not meat). */
  notNames?: string[];
};

/** True if `kw` starts a word in the folded name ("Nimet" must not match "et"). */
function hasWordStart(name: string, kw: string): boolean {
  let i = name.indexOf(kw);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(name[i - 1]!)) return true;
    i = name.indexOf(kw, i + 1);
  }
  return false;
}

// Name keywords are folded (see search.ts) and only used to FILTER; they are
// never shown as a fact about the place.
const CATEGORY_RULES: Record<FoodCategory, CategoryRule> = {
  breakfast: { cuisines: ['breakfast'], names: ['kahvalt'] },
  meat: {
    cuisines: ['steak_house', 'kebab', 'grill', 'barbecue', 'meat', 'meatball'],
    names: ['kebap', 'kebab', 'kofte', 'ocakbasi', 'et lokantasi', 'steak', 'mangal'],
    notNames: ['cig kofte', 'cigkofte'],
  },
  fish: { cuisines: ['seafood', 'fish'], names: ['balik', 'alabalik'] },
  cafe: { kinds: ['cafe'], cuisines: ['coffee_shop'] },
  meyhane: { kinds: ['bar', 'pub', 'biergarten'], cuisines: ['meyhane'], names: ['meyhane'] },
  fast: {
    kinds: ['fast_food'],
    cuisines: ['burger', 'pizza', 'chicken', 'sandwich', 'doner'],
    names: ['doner', 'burger', 'pizza'],
  },
  dessert: {
    kinds: ['ice_cream'],
    cuisines: ['dessert', 'ice_cream', 'cake', 'pastry'],
    names: ['tatli', 'pastane', 'dondurma', 'baklava'],
  },
};

export function matchesCategory(r: Restaurant, cat: FoodCategory): boolean {
  const rule = CATEGORY_RULES[cat];
  if (rule.kinds?.includes(r.kind)) return true;
  if (rule.cuisines && r.cuisines.some((c) => rule.cuisines!.includes(c))) return true;
  if (rule.names) {
    const name = fold(r.name);
    if (rule.notNames?.some((k) => name.includes(k))) return false;
    if (rule.names.some((k) => hasWordStart(name, k))) return true;
  }
  return false;
}

/** First matching category, used for the card icon. */
export function categoryOf(r: Restaurant): FoodCategory | null {
  return FOOD_CATEGORIES.find((cat) => matchesCategory(r, cat)) ?? null;
}

/** How many of the optional OSM fields the place has filled in. */
export function infoScore(r: Restaurant): number {
  return [
    r.cuisines.length > 0,
    !!r.phone,
    !!r.openingHours,
    !!r.website,
    !!r.address,
    !!r.instagram,
  ].filter(Boolean).length;
}

export function nearbyParkingCount(
  r: LatLng,
  parkings: Parking[],
  radius = NEAREST_PARKING_RADIUS_M,
): number {
  let n = 0;
  for (const p of parkings) if (distanceMeters(r, p) <= radius) n++;
  return n;
}

export type RestaurantSort = 'parkEase' | 'distance';

export type RestaurantRow = {
  r: NearbyRestaurant;
  parking: ReturnType<typeof parkingSummary>;
  nearbyCount: number;
};

/** 0 best: fresh free spots; then unknown; then fresh zero; then no car park near. */
function parkClass(p: RestaurantRow['parking']): number {
  if (!p) return 3;
  if (p.free != null) return p.free > 0 ? 0 : 2;
  return 1;
}

export function rankRestaurants(rows: RestaurantRow[], sort: RestaurantSort): RestaurantRow[] {
  const out = [...rows];
  if (sort === 'distance') return out.sort((a, b) => a.r.distanceM - b.r.distanceM);
  return out.sort((a, b) => {
    const ca = parkClass(a.parking);
    const cb = parkClass(b.parking);
    if (ca !== cb) return ca - cb;
    // 100 m buckets so info richness decides between similar car park distances.
    const ba = a.parking ? Math.floor(a.parking.distanceM / 100) : 0;
    const bb = b.parking ? Math.floor(b.parking.distanceM / 100) : 0;
    if (ba !== bb) return ba - bb;
    const ia = infoScore(a.r);
    const ib = infoScore(b.r);
    if (ia !== ib) return ib - ia;
    return a.r.distanceM - b.r.distanceM;
  });
}

const CATEGORY_WORDS: Record<FoodCategory, string[]> = {
  breakfast: ['kahvalti'],
  meat: ['kebap', 'kebab', 'et', 'izgara', 'kofte', 'mangal', 'steak', 'ocakbasi'],
  fish: ['balik', 'balikci', 'deniz urunleri'],
  cafe: ['kafe', 'kahve', 'cafe'],
  meyhane: ['meyhane', 'bar', 'pub'],
  fast: ['burger', 'pizza', 'fast food', 'doner'],
  dessert: ['tatli', 'dondurma', 'pastane', 'baklava'],
};

/** The category a search text names outright ("balık", "kahvaltı"), or null. */
export function categoryForQuery(q: string): FoodCategory | null {
  const f = fold(q.trim());
  if (!f) return null;
  return FOOD_CATEGORIES.find((cat) => CATEGORY_WORDS[cat].includes(f)) ?? null;
}

/** Per-row parking data computed in a single pass over the car parks. */
export function parkingInfo(
  restaurant: LatLng,
  parkings: Parking[],
  now: Date = new Date(),
): { parking: ReturnType<typeof parkingSummary>; nearbyCount: number } {
  let count = 0;
  let best: Parking | null = null;
  let bestD = Infinity;
  for (const p of parkings) {
    const d = distanceMeters(restaurant, p);
    if (d <= NEAREST_PARKING_RADIUS_M) {
      count++;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  if (!best) return { parking: null, nearbyCount: 0 };
  return { parking: parkingSummary(restaurant, [best], now), nearbyCount: count };
}
