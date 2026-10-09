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

export const MAP_RESTAURANT_RADIUS_M = 1500;
export const MAP_RESTAURANT_LIMIT = 150;

/** Restaurants to draw on the map: bounded so the marker count stays small. */
export function restaurantsForMap(
  center: LatLng,
  list: Restaurant[] = allRestaurants(),
): NearbyRestaurant[] {
  return restaurantsNear(center, MAP_RESTAURANT_RADIUS_M, MAP_RESTAURANT_LIMIT, list);
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

export type FoodCategory =
  'breakfast' | 'soup' | 'meat' | 'lokanta' | 'fish' | 'cafe' | 'meyhane' | 'fast' | 'dessert';

export const FOOD_CATEGORIES: FoodCategory[] = [
  'breakfast',
  'soup',
  'meat',
  'lokanta',
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
  breakfast: {
    cuisines: ['breakfast'],
    names: [
      'kahvalt',
      'borek',
      'pogaca',
      'simit',
      'gozleme',
      'menemenci',
      'boyoz',
      'gevrek',
      'kumru',
    ],
  },
  soup: { cuisines: ['soup'], names: ['corba', 'iskembe', 'kelle paca', 'paca'] },
  meat: {
    cuisines: ['steak_house', 'kebab', 'grill', 'barbecue', 'meat', 'meatball'],
    names: [
      'kebap',
      'kebab',
      'kofte',
      'ocakbasi',
      'et lokantasi',
      'steak',
      'mangal',
      'izgara',
      'kasap',
      'ciger',
      'kokorec',
      'tantuni',
    ],
    notNames: ['cig kofte', 'cigkofte'],
  },
  // Lokanta has no cuisine tag of its own: it is the plain restaurant that fits
  // no other category (see matchesCategory) plus the names below.
  lokanta: {
    names: ['lokanta', 'ev yemek', 'pilav', 'esnaf', 'sofrasi', 'mutfagi'],
  },
  fish: { cuisines: ['seafood', 'fish'], names: ['balik', 'alabalik', 'midye'] },
  cafe: { kinds: ['cafe'], cuisines: ['coffee_shop'] },
  meyhane: { kinds: ['bar', 'pub', 'biergarten'], cuisines: ['meyhane'], names: ['meyhane'] },
  fast: {
    kinds: ['fast_food'],
    cuisines: ['burger', 'pizza', 'chicken', 'sandwich', 'doner'],
    names: ['doner', 'burger', 'pizza', 'pide', 'lahmacun', 'cig kofte', 'cigkofte'],
  },
  dessert: {
    kinds: ['ice_cream'],
    cuisines: ['dessert', 'ice_cream', 'cake', 'pastry'],
    names: ['tatli', 'pastane', 'dondurma', 'baklava', 'kunefe'],
  },
};

/** Categories the name alone points to ("Bülent Börek" → breakfast). */
function nameCategories(r: Restaurant): FoodCategory[] {
  const name = fold(r.name);
  return FOOD_CATEGORIES.filter((cat) => {
    const rule = CATEGORY_RULES[cat];
    if (!rule.names || rule.notNames?.some((k) => name.includes(k))) return false;
    return rule.names.some((k) => hasWordStart(name, k));
  });
}

/** Folded name parts of places that are not a meal stop (shown only under "Tümü" or Meyhane). */
const NOT_FOOD_NAMES = [
  'nargile',
  'hookah',
  'club',
  'market',
  'sarkuteri',
  'otel',
  'hotel',
  'pansiyon',
  'bakkal',
  'tekel',
];

function isExcluded(r: Restaurant): boolean {
  const name = fold(r.name);
  return NOT_FOOD_NAMES.some((k) => hasWordStart(name, k));
}

/** Whole-word "bar"/"pub" ("Barbaros" is not a bar), prefixes for the longer words. */
const PUB_WORDS = ['gastropub', 'cocktail', 'kokteyl', 'meyhane', 'birahane'];

/** The name says pub/bar/cocktail: such a place is Meyhane & Bar only, whatever its cuisine tag. */
function isPubName(r: Restaurant): boolean {
  const tokens = fold(r.name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some(
    (w) =>
      w === 'pub' ||
      // "Espresso Bar" is a café, so a bare "bar" only counts for non-café kinds.
      (w === 'bar' && r.kind !== 'cafe') ||
      PUB_WORDS.some((p) => w.startsWith(p)),
  );
}

const COFFEE_NAMES = ['coffee', 'kahve', 'cafe', 'kafe'];
const SWEET_NAMES = ['tatli', 'dondurma', 'pastane'];

function matchesRule(r: Restaurant, cat: Exclude<FoodCategory, 'lokanta'>): boolean {
  const rule = CATEGORY_RULES[cat];
  const name = fold(r.name);
  // A coffee shop / café is not a dessert place, unless it says tatlı/dondurma/pastane.
  if (
    cat === 'dessert' &&
    r.kind === 'cafe' &&
    COFFEE_NAMES.some((k) => name.includes(k)) &&
    !SWEET_NAMES.some((k) => name.includes(k))
  )
    return false;
  if (rule.cuisines && r.cuisines.some((c) => rule.cuisines!.includes(c))) return true;
  const byName = nameCategories(r);
  if (byName.includes(cat)) return true;
  return byName.length === 0 && !!rule.kinds?.includes(r.kind);
}

/**
 * OSM cuisine tags win; then what the name says ("X Köfte" → meat); the broad
 * OSM kind (fast_food, cafe…) counts only when the name points nowhere else,
 * so a börek shop tagged fast_food is breakfast, not burgers.
 * Pubs/bars (by name) belong to Meyhane only; hotels, markets, hookah and
 * club places belong to no family category.
 */
const LOKANTA_CUISINES = ['turkish', 'regional', 'homestyle', 'local'];

export function matchesCategory(r: Restaurant, cat: FoodCategory): boolean {
  if (cat === 'meyhane') return isPubName(r) || matchesRule(r, 'meyhane');
  if (isPubName(r) || isExcluded(r)) return false;
  if (cat !== 'lokanta') return matchesRule(r, cat);
  // Lokanta: named like one, or a plain sit-down place that fits nothing else.
  if (nameCategories(r).includes('lokanta')) return true;
  if (r.kind !== 'restaurant' && r.kind !== 'food_court') return false;
  // Only untagged or Turkish home-style places: an Italian or sushi tag is not a lokanta.
  if (r.cuisines.some((c) => !LOKANTA_CUISINES.includes(c))) return false;
  return !FOOD_CATEGORIES.some((k) => k !== 'lokanta' && matchesCategory(r, k));
}

/** Best category for the card icon: cuisine tag, then name, then kind. */
export function categoryOf(r: Restaurant): FoodCategory | null {
  if (isPubName(r)) return 'meyhane';
  if (isExcluded(r)) return null;
  // The place's own first cuisine tag decides ("Ada balık": fish before breakfast).
  for (const c of r.cuisines) {
    const cat = FOOD_CATEGORIES.find((k) => CATEGORY_RULES[k].cuisines?.includes(c));
    if (cat && matchesCategory(r, cat)) return cat;
  }
  const byName = nameCategories(r).find((k) => matchesCategory(r, k));
  return byName ?? FOOD_CATEGORIES.find((cat) => matchesCategory(r, cat)) ?? null;
}

/** Search rings for a category: widen until enough places turn up. */
export const CATEGORY_RADII_M = [1000, 3000, 6000];
const CATEGORY_MIN_RESULTS = 5;

/**
 * Places of one category around `target`, widening 1 → 3 → 6 km until at
 * least a handful turn up. Never falls back to other categories.
 */
export function restaurantsInCategory(
  target: LatLng,
  cat: FoodCategory,
  list?: Restaurant[],
): { items: NearbyRestaurant[]; radiusM: number } {
  let items: NearbyRestaurant[] = [];
  let radiusM = CATEGORY_RADII_M[0]!;
  for (const r of CATEGORY_RADII_M) {
    radiusM = r;
    items = restaurantsNear(target, r, 5000, list).filter((x) => matchesCategory(x, cat));
    if (items.length >= CATEGORY_MIN_RESULTS) break;
  }
  return { items, radiusM };
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

/**
 * Score penalty per park class (m-equivalent): fresh free spots, then unknown,
 * then fresh zero, then no car park within 500 m (counted as 500 m away).
 */
const PARK_CLASS_PENALTY = [0, 500, 1000, 1000];
const NO_PARK_DISTANCE_M = NEAREST_PARKING_RADIUS_M;
/** The walk to the restaurant counts half as much as the walk from the car park. */
const RESTAURANT_DISTANCE_WEIGHT = 0.5;
/** Street stands (midye, kokoreç) sink below sit-down places in fish and meat. */
const STAND_PENALTY_M = 600;

/** A fast_food place, or a midye/kokoreç stand that is not also a fish restaurant. */
function isStand(r: Restaurant): boolean {
  if (r.kind === 'fast_food') return true;
  const name = fold(r.name);
  return (name.includes('midye') || name.includes('kokorec')) && !name.includes('balik');
}

/** 0 best: fresh free spots; then unknown; then fresh zero; then no car park near. */
function parkClass(p: RestaurantRow['parking']): number {
  if (!p) return 3;
  if (p.free != null) return p.free > 0 ? 0 : 2;
  return 1;
}

/**
 * Lower is better. Park class, car park distance and restaurant distance all
 * count, so a far restaurant only wins with a clearly better park class
 * (fresh free beats unknown) and never just because its car park is close.
 */
function parkEaseScore(row: RestaurantRow, cat?: FoodCategory): number {
  const { r, parking } = row;
  let score =
    PARK_CLASS_PENALTY[parkClass(parking)]! +
    (parking ? parking.distanceM : NO_PARK_DISTANCE_M) +
    RESTAURANT_DISTANCE_WEIGHT * r.distanceM;
  if ((cat === 'fish' || cat === 'meat') && isStand(r)) score += STAND_PENALTY_M;
  return score;
}

export function rankRestaurants(
  rows: RestaurantRow[],
  sort: RestaurantSort,
  cat?: FoodCategory,
): RestaurantRow[] {
  const out = [...rows];
  if (sort === 'distance') return out.sort((a, b) => a.r.distanceM - b.r.distanceM);
  const score = new Map(out.map((row) => [row, parkEaseScore(row, cat)]));
  return out.sort((a, b) => {
    // 100 m buckets so info richness decides between similar scores.
    const ba = Math.floor(score.get(a)! / 100);
    const bb = Math.floor(score.get(b)! / 100);
    if (ba !== bb) return ba - bb;
    const ia = infoScore(a.r);
    const ib = infoScore(b.r);
    if (ia !== ib) return ib - ia;
    return a.r.distanceM - b.r.distanceM;
  });
}

const CATEGORY_WORDS: Record<FoodCategory, string[]> = {
  breakfast: [
    'kahvalti',
    'borek',
    'pogaca',
    'simit',
    'gozleme',
    'boyoz',
    'gevrek',
    'kumru',
    'menemen',
    'serpme kahvalti',
    'kahvalti salonu',
    'brunch',
    'breakfast',
  ],
  soup: ['corba', 'iskembe', 'kelle paca', 'paca', 'soup'],
  meat: [
    'kebap',
    'kebab',
    'et',
    'izgara',
    'kofte',
    'mangal',
    'steak',
    'ocakbasi',
    'kokorec',
    'tantuni',
    'meat',
    'grill',
  ],
  lokanta: [
    'lokanta',
    'ev yemegi',
    'ev yemekleri',
    'esnaf lokantasi',
    'restoran',
    'lokantasi',
    'ogle yemegi',
  ],
  fish: ['balik', 'balikci', 'deniz urunleri', 'midye', 'fish', 'seafood'],
  cafe: ['kafe', 'kahve', 'cafe', 'coffee'],
  meyhane: ['meyhane', 'bar', 'pub', 'meze'],
  // Çiğ köfte is not meat (see CATEGORY_RULES.meat.notNames).
  fast: [
    'burger',
    'pizza',
    'fast food',
    'doner',
    'hizli yemek',
    'cigkofte',
    'cig kofte',
    'lahmacun',
    'pide',
    'tost',
    'durum',
  ],
  dessert: ['tatli', 'dondurma', 'pastane', 'baklava', 'dessert'],
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

/** "1,8 km" from 1 km up, otherwise "650 m". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
