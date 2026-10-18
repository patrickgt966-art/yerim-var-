import i18next, { type TFunction } from 'i18next';

import { activeCity } from './cities';
import { foodFile, foodOvertureFile } from './cityData';
import { getFreshness } from './freshness';
import { BREAD_MODIFIER_WORDS, FOOD_LEXICON, MODIFIERS } from './foodLexicon';
import { distanceMeters, type LatLng } from './geo';
import { cleanName } from './names';
import { fold } from './search';
import type { Parking } from './types';
import { hiddenPlaceIds } from '@/store/reports';

/**
 * Restaurants, cafés and bars from OpenStreetMap, bundled with the app and
 * refreshed by scripts/fetch-sources.mjs. The value is the parking next to
 * them; we hold no ratings, prices or photos and never show any.
 */
export type FoodRecord = {
  id: string;
  n: string;
  a: number;
  o: number;
  k: string;
  c?: string[];
  /** Diet codes: "vegan" serves only that, "vegan_options" offers it (OSM diet:*, Overture category). */
  dt?: string[];
  h?: string;
  p?: string;
  w?: string;
  ig?: string;
  ad?: string;
  out?: boolean;
  wc?: boolean;
  res?: boolean;
  v?: number;
};

export type RestaurantKind =
  | 'restaurant'
  | 'cafe'
  | 'fast_food'
  | 'bar'
  | 'pub'
  | 'biergarten'
  | 'food_court'
  | 'ice_cream'
  | 'bakery'
  | 'pastry'
  | 'confectionery';

export type Restaurant = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  cuisines: string[];
  /** Diet codes from the data ("vegetarian", "vegan_options", ...); empty when none is known. */
  diets: string[];
  /** Raw OSM opening_hours text. */
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  outdoorSeating: boolean | null;
  wheelchair: boolean | null;
  reservation: boolean | null;
  /** Where the record comes from, by id prefix ('ov-' is Overture Maps). */
  source: 'osm' | 'overture';
  /** OSM only. Overture records may be stale (manual audit: ~1 in 4 closed or moved), so they are never shown as verified. */
  verified: boolean;
};

export type NearbyRestaurant = Restaurant & { distanceM: number };

export function toRestaurant(r: FoodRecord): Restaurant {
  const source = r.id.startsWith('ov-') ? 'overture' : 'osm';
  return {
    id: r.id,
    name: cleanName(r.n),
    lat: r.a,
    lng: r.o,
    kind: r.k,
    cuisines: r.c ?? [],
    diets: r.dt ?? [],
    openingHours: r.h ?? null,
    phone: r.p ?? null,
    website: r.w ?? null,
    instagram: r.ig ?? null,
    address: r.ad ?? null,
    outdoorSeating: r.out ?? null,
    wheelchair: r.wc ?? null,
    reservation: r.res ?? null,
    source,
    verified: source === 'osm',
  };
}

// Both keyed by city id: switching city must never serve another city's restaurants.
const caches = new Map<string, Restaurant[]>();
const byIds = new Map<string, Map<string, Restaurant>>();

const visible = new Map<string, { hidden: ReadonlySet<string>; list: Restaurant[] }>();

/** Every restaurant of the active city, hidden ones included. */
function cityRestaurants(id: string): Restaurant[] {
  let list = caches.get(id);
  if (!list) {
    list = [
      ...(foodFile(id).items ?? []).map(toRestaurant),
      ...(foodOvertureFile(id).items ?? []).map(toRestaurant),
    ];
    caches.set(id, list);
  }
  return list;
}

/**
 * The active city's restaurants; empty while its data files are placeholders. Places reported
 * closed (by this device, or by enough people) are left out.
 */
export function allRestaurants(): Restaurant[] {
  const id = activeCity().id;
  const list = cityRestaurants(id);
  const hidden = hiddenPlaceIds();
  if (hidden.size === 0) return list;
  const v = visible.get(id);
  if (v && v.hidden === hidden) return v.list;
  const out = list.filter((r) => !hidden.has(r.id));
  visible.set(id, { hidden, list: out });
  return out;
}

/** A restaurant by id, hidden or not: a favorite or a shared link still opens. */
export function getRestaurant(id: string): Restaurant | null {
  const city = activeCity().id;
  let map = byIds.get(city);
  if (!map) {
    map = new Map(cityRestaurants(city).map((r) => [r.id, r]));
    byIds.set(city, map);
  }
  return map.get(id) ?? null;
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
  bakery: 'bakery',
  pastry: 'pastry',
  confectionery: 'confectionery',
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
  mexican: 'mexican',
  'tex-mex': 'mexican',
  indian: 'indian',
  thai: 'thai',
  korean: 'korean',
  vietnamese: 'vietnamese',
  french: 'french',
  greek: 'greek',
  lebanese: 'lebanese',
  georgian: 'georgian',
  russian: 'russian',
  spanish: 'spanish',
  tapas: 'spanish',
  middle_eastern: 'middle_eastern',
  arab: 'middle_eastern',
  ramen: 'ramen',
  poke: 'poke',
};

export function kindLabel(kind: string, t: TFunction): string | null {
  const key = KIND_KEYS[kind];
  return key ? t(`food.kinds.${key}`) : null;
}

const DIET_KEYS = new Set([
  'vegetarian',
  'vegan',
  'pescetarian',
  'gluten_free',
  'vegetarian_options',
  'vegan_options',
  'pescetarian_options',
  'gluten_free_options',
]);

/** Turkish labels for the diet codes in our data ("Vegan", "Vejetaryen seçenek var"). */
export function dietLabels(codes: string[], t: TFunction): string[] {
  return codes.filter((c) => DIET_KEYS.has(c)).map((c) => t(`food.diets.${c}`));
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
  | 'breakfast'
  | 'soup'
  | 'meat'
  | 'lokanta'
  | 'fish'
  | 'cafe'
  | 'meyhane'
  | 'fast'
  | 'world'
  | 'dessert';

export const FOOD_CATEGORIES: FoodCategory[] = [
  'breakfast',
  'soup',
  'meat',
  'lokanta',
  'fish',
  'cafe',
  'meyhane',
  'fast',
  'world',
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
export function hasWordStart(name: string, kw: string): boolean {
  let i = name.indexOf(kw);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(name[i - 1]!)) return true;
    i = name.indexOf(kw, i + 1);
  }
  return false;
}

/** What may follow a keyword inside one name word: seller, compound and possessive endings ("kebapçım", "dönerevi", "birahanesi", "baklavacıbaşı", "burgerhouse"). */
const WORD_TAIL =
  /^(?:c[iu](?:basi|zade|oglu)?)?(?:evi|hane|house|matik|zade|basi|co)?(?:l[iu])?(?:l[ae]r)?(?:[iu]?m|[iu]?n[iu]z|s?[iu]|[iu]n|s)?$/;

/** True when `kw` starts a word of the folded name and the rest of that word is only an ending (see WORD_TAIL). */
export function hasWordForm(name: string, kw: string): boolean {
  let i = name.indexOf(kw);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(name[i - 1]!)) {
      const rest = /^[a-z0-9]*/.exec(name.slice(i + kw.length))![0];
      if (WORD_TAIL.test(rest)) return true;
    }
    i = name.indexOf(kw, i + 1);
  }
  return false;
}

// Name keywords are folded (see search.ts) and only used to FILTER; they are
// never shown as a fact about the place.
const CATEGORY_RULES: Record<FoodCategory, CategoryRule> = {
  breakfast: {
    kinds: ['bakery'],
    cuisines: ['breakfast', 'bagel', 'bread', 'bakery', 'fırın', 'firin'],
    names: [
      'kahvalti',
      'borek',
      'borekcilik',
      'pogaca',
      'simit',
      'gozleme',
      'menemenci',
      'boyoz',
      'gevrek',
      'kumru',
      'bakery',
      'boulangerie',
    ],
  },
  soup: { cuisines: ['soup'], names: ['corba', 'iskembe', 'kelle paca', 'paca'] },
  meat: {
    cuisines: ['steak_house', 'kebab', 'grill', 'barbecue', 'meat', 'meatball', 'köfte', 'kofte'],
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
    // "Kore Mutfağı" is a world-cuisine place, not a home-style lokanta.
    notNames: [
      'asya mutfagi',
      'kore mutfagi',
      'hint mutfagi',
      'cin mutfagi',
      'meksika mutfagi',
      'italyan mutfagi',
      'japon mutfagi',
    ],
  },
  fish: { cuisines: ['seafood', 'fish', 'fish_and_chips'], names: ['balik', 'alabalik', 'midye'] },
  // Juice bars are often mapped as a plain restaurant ("Energy Vitamin"): the name makes them a café.
  cafe: {
    kinds: ['cafe'],
    cuisines: ['coffee_shop'],
    names: ['vitamin', 'meyve suyu', 'smoothie', 'juice', 'taze sikma'],
    // "Vitamin Pide ve Kebap" is not a juice bar.
    notNames: [
      'kebap',
      'kebab',
      'pide',
      'pizza',
      'burger',
      'doner',
      'lokanta',
      'kofte',
      'lahmacun',
    ],
  },
  meyhane: { kinds: ['bar', 'pub', 'biergarten'], cuisines: ['meyhane'], names: ['meyhane'] },
  fast: {
    kinds: ['fast_food'],
    cuisines: [
      'burger',
      'pizza',
      'chicken',
      'sandwich',
      'doner',
      'tost',
      'toast',
      'shawarma',
      'lahmacun',
      'pide',
      'hot_dog',
      'wrap',
      'kumpir',
      'cig_kofte',
      'çiğköfte',
    ],
    names: ['doner', 'burger', 'pizza', 'pide', 'lahmacun', 'cig kofte', 'cigkofte'],
  },
  world: {
    cuisines: [
      'japanese',
      'sushi',
      'chinese',
      'asian',
      'italian',
      'pasta',
      'mexican',
      'tex-mex',
      'indian',
      'thai',
      'korean',
      'vietnamese',
      'ramen',
      'noodle',
      'french',
      'greek',
      'lebanese',
      'arab',
      'middle_eastern',
      'georgian',
      'russian',
      'spanish',
      'tapas',
      'poke',
      'hawaiian',
      'dim_sum',
      'wok',
      'fusion',
      'international',
      'peruvian',
      'latin_american',
      // Not Turkish home cooking either: "Akdeniz mutfağı" places, and cuisines from abroad.
      'mediterranean',
      'american',
      'european',
      'german',
      'british',
      'portuguese',
      'balkan',
      'moroccan',
      'persian',
      'iranian',
      'afghan',
      'uzbek',
      'kazak',
      'tatar',
      'turkmen',
      'indonesian',
      'malaysian',
      'oriental',
      'african',
      'brazilian',
      'argentinian',
    ],
    names: [
      'sushi',
      'ramen',
      'noodle',
      'wok',
      'taco',
      'burrito',
      'trattoria',
      'osteria',
      'ristorante',
      'italyan',
      'japon',
      'meksika',
      'uzak dogu',
      'uzakdogu',
      'asya mutfagi',
      'asian',
      'dumpling',
      'gyoza',
      'poke',
      'falafel',
      'hinkali',
      'hacapuri',
      'dim sum',
      'thai',
      'kore mutfagi',
      'hint mutfagi',
      'cin lokantasi',
      'cin mutfagi',
    ],
  },
  dessert: {
    kinds: ['ice_cream', 'pastry', 'confectionery'],
    cuisines: ['dessert', 'ice_cream', 'cake', 'pastry', 'donut', 'waffle', 'pancake', 'crepe'],
    names: ['tatli', 'pastane', 'patisserie', 'dondurma', 'baklava', 'kunefe'],
  },
};

/** Categories the name alone points to ("Bülent Börek" → breakfast). */
function nameCategories(r: Restaurant): readonly FoodCategory[] {
  return nameFacts(r.name).cats;
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
  return nameFacts(r.name).excluded;
}

/** Whole-word "bar"/"pub" ("Barbaros" is not a bar), prefixes for the longer words. */
const PUB_WORDS = ['gastropub', 'cocktail', 'kokteyl', 'meyhane', 'birahane'];

/** The name says pub/bar/cocktail: such a place is Meyhane & Bar only, whatever its cuisine tag. */
function isPubName(r: Restaurant): boolean {
  const f = nameFacts(r.name);
  // "Espresso Bar" is a café, so a bare "bar" only counts for non-café kinds.
  return f.pub || (f.bar && r.kind !== 'cafe');
}

/** What a name alone says, worked out once per name: the category filters ask it many times. */
type NameFacts = {
  folded: string;
  cats: readonly FoodCategory[];
  excluded: boolean;
  /** A pub / cocktail / meyhane word. */
  pub: boolean;
  /** A bare "bar" word. */
  bar: boolean;
};

const nameFactsCache = new Map<string, NameFacts>();
const NAME_FACTS_MAX = 200_000;

function nameFacts(name: string): NameFacts {
  let f = nameFactsCache.get(name);
  if (f) return f;
  const folded = fold(name);
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);
  f = {
    folded,
    cats: FOOD_CATEGORIES.filter((cat) => {
      const rule = CATEGORY_RULES[cat];
      if (!rule.names || rule.notNames?.some((k) => folded.includes(k))) return false;
      return rule.names.some((k) => hasWordForm(folded, k));
    }),
    excluded: NOT_FOOD_NAMES.some((k) => hasWordStart(folded, k)),
    pub: tokens.some((w) => w === 'pub' || PUB_WORDS.some((p) => w.startsWith(p))),
    bar: tokens.includes('bar'),
  };
  if (nameFactsCache.size >= NAME_FACTS_MAX) nameFactsCache.clear();
  nameFactsCache.set(name, f);
  return f;
}

const COFFEE_NAMES = ['coffee', 'kahve', 'cafe', 'kafe'];
const SWEET_NAMES = [
  'tatli',
  'dondurma',
  'pastane',
  'patisserie',
  'patiserie',
  'baklava',
  'kunefe',
];

function matchesRule(r: Restaurant, cat: Exclude<FoodCategory, 'lokanta'>): boolean {
  const rule = CATEGORY_RULES[cat];
  const name = nameFacts(r.name).folded;
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
const LOKANTA_CUISINES = [
  'turkish',
  'regional',
  'homestyle',
  'local',
  'ev_yemekleri',
  'home_cooking',
  'mantı',
  'manti',
  'çi_börek',
  'pilav',
];

/** Cuisine tags that belong to a category other than lokanta. */
const OTHER_CUISINES = new Set(
  Object.values(CATEGORY_RULES).flatMap((rule) => rule.cuisines ?? []),
);

export function matchesCategory(r: Restaurant, cat: FoodCategory): boolean {
  if (cat === 'meyhane') return isPubName(r) || matchesRule(r, 'meyhane');
  if (isPubName(r) || isExcluded(r)) return false;
  if (cat !== 'lokanta') return matchesRule(r, cat);
  // Lokanta: named like one, or a plain sit-down place that fits nothing else.
  if (nameCategories(r).includes('lokanta')) return true;
  if (r.kind !== 'restaurant' && r.kind !== 'food_court') return false;
  // A tag of another category (Italian, sushi) is not a lokanta; a tag we do not know yet
  // ("kımız", "mushrooms") does not keep a sit-down place out of every category.
  if (r.cuisines.some((c) => !LOKANTA_CUISINES.includes(c) && OTHER_CUISINES.has(c))) return false;
  return !FOOD_CATEGORIES.some((k) => k !== 'lokanta' && matchesCategory(r, k));
}

/** Best category for the card icon: cuisine tag, then name, then kind. */
export function categoryOf(r: Restaurant): FoodCategory | null {
  if (isPubName(r)) return 'meyhane';
  if (isExcluded(r)) return null;
  // The place's own first cuisine tag decides ("Ada balık": fish before breakfast).
  const byName = nameCategories(r).find((k) => matchesCategory(r, k));
  for (const c of r.cuisines) {
    const cat = FOOD_CATEGORIES.find((k) => CATEGORY_RULES[k].cuisines?.includes(c));
    // A cuisine tag is weaker than a name that says what is served ("Milos Balık" tagged greek).
    if (cat === 'world' && byName && byName !== 'world') return byName;
    if (cat && matchesCategory(r, cat)) return cat;
  }
  return byName ?? FOOD_CATEGORIES.find((cat) => matchesCategory(r, cat)) ?? null;
}

/** Search rings for a category: widen until enough places turn up. */
export const CATEGORY_RADII_M = [1000, 3000, 6000];
/** Wider rings for when the user asks to search a larger area. */
export const WIDE_RADII_M = [6000, 15000];
const CATEGORY_MIN_RESULTS = 5;

/**
 * Places of one category around `target`, widening 1 → 3 → 6 km until at
 * least a handful turn up. Never falls back to other categories.
 */
export function restaurantsInCategory(
  target: LatLng,
  cat: FoodCategory,
  list?: Restaurant[],
  radii: readonly number[] = CATEGORY_RADII_M,
): { items: NearbyRestaurant[]; radiusM: number } {
  let items: NearbyRestaurant[] = [];
  let radiusM = radii[0]!;
  for (const r of radii) {
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
/**
 * Street stands (midye, kokoreç) sink below sit-down places in fish, meat,
 * lokanta and the unfiltered "Tümü" list (not in fast, breakfast, cafe, etc.).
 */
const STAND_PENALTY_M = 600;
/**
 * A place that only loosely fits the chosen meyhane or lokanta category (a
 * cocktail bar, an untagged fallback restaurant) sorts after a real match at a
 * similar distance (m-equivalent).
 */
const WEAK_MATCH_PENALTY_M = 400;
/** An Overture row sorts after OSM rows at the same score (m-equivalent). */
const UNVERIFIED_PENALTY_M = 250;

/** A fast_food place, or a midye/kokoreç stand that is not also a fish restaurant. */
function isStand(r: Restaurant): boolean {
  if (r.kind === 'fast_food') return true;
  const name = fold(r.name);
  return (name.includes('midye') || name.includes('kokorec')) && !name.includes('balik');
}

/** True when `r` only loosely fits the meyhane or lokanta category. */
function isWeakMatch(r: Restaurant, cat: FoodCategory): boolean {
  if (cat === 'meyhane') {
    return !(fold(r.name).includes('meyhane') || r.cuisines.includes('meyhane'));
  }
  if (cat === 'lokanta') {
    return !(
      nameCategories(r).includes('lokanta') || r.cuisines.some((c) => LOKANTA_CUISINES.includes(c))
    );
  }
  return false;
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
  if ((cat === undefined || cat === 'fish' || cat === 'meat' || cat === 'lokanta') && isStand(r)) {
    score += STAND_PENALTY_M;
  }
  if (cat && isWeakMatch(r, cat)) score += WEAK_MATCH_PENALTY_M;
  if (!r.verified) score += UNVERIFIED_PENALTY_M;
  return score;
}

export function rankRestaurants(
  rows: RestaurantRow[],
  sort: RestaurantSort,
  cat?: FoodCategory,
): RestaurantRow[] {
  const out = [...rows];
  if (sort === 'distance') {
    const eff = (row: RestaurantRow) =>
      row.r.distanceM + (row.r.verified ? 0 : UNVERIFIED_PENALTY_M);
    return out.sort((a, b) => eff(a) - eff(b));
  }
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

/** Rows whose nearest car park is known and within `maxM` metres. */
export function withParkingWithin<T extends { parking: { distanceM: number } | null | undefined }>(
  rows: T[],
  maxM: number,
): T[] {
  return rows.filter((row) => !!row.parking && row.parking.distanceM <= maxM);
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
    'su boregi',
    'kol boregi',
    'sigara boregi',
    'acma',
    'katmer',
    'kuymak',
    'sucuklu yumurta',
    'omlet',
    'pisi',
    'bazlama',
    'mihlama',
    'cilbir',
    'sahanda yumurta',
    'kaymak bal',
    'kahvalti tabagi',
    'pankek',
    'pancake',
    'muhlama',
    'sembusek',
    'kaygana',
    'misir ekmegi',
    'trabzon ekmegi',
  ],
  soup: [
    'corba',
    'iskembe',
    'kelle paca',
    'paca',
    'soup',
    'mercimek',
    'mercimek corba',
    'ezogelin',
    'ezogelin corba',
    'domates corba',
    'tarhana',
    'tarhana corba',
    'tavuk corba',
    'yayla corba',
    'beyran',
    'iskembe corba',
    'kelle',
    'sogus',
    'sehriye corba',
    'mantar corba',
    'dugun corbasi',
    'yuvarlama',
    'lebeniye',
  ],
  meat: [
    'kebap',
    'protein',
    'proteinli',
    'yuksek protein',
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
    'pirzola',
    'kuzu',
    'antrikot',
    'biftek',
    'sis',
    'sis kebap',
    'kanat',
    'ciger',
    'kasap',
    'et lokantasi',
    'tandir',
    'kuzu tandir',
    'kavurma',
    'iskender',
    'beyti',
    'adana',
    'urfa',
    'doner kebap',
    'adana kebap',
    'urfa kebap',
    'testi kebap',
    'testi kebabi',
    'patlican kebabi',
    'kagit kebabi',
    'cop sis',
    'ali nazik',
    'izmir kofte',
    'kasap kofte',
    'akcaabat kofte',
    'inegol kofte',
    'kofte ekmek',
    'kuru kofte',
    'piyaz',
    'tava ciger',
    'arnavut ciger',
    'arnavut cigeri',
    'sakatat',
    'bonfile',
    'kuzu incik',
    'kusbasi',
    'sac kavurma',
    'et kavurma',
    'kuzu sis',
    'tavuk sis',
    'ciger sis',
    'kaburga',
    'izgara kofte',
    'sucuk izgara',
    'karisik izgara',
    'cokertme',
    'orman kebabi',
    'kebap cesitleri',
    'tavuk',
    'cag kebabi',
    'cag kebap',
    'tokat kebabi',
    'bursa kebabi',
    'buryan',
    'kuyu kebabi',
    'halep isi',
    'firin kebabi',
    'kuzu pirzola',
    'pastirma',
    'sucuk',
    'mumbar',
    'sirdan',
    'tepsi kebabi',
    'simit kebabi',
    'sogan kebabi',
    'keme kebabi',
    'hashas kebabi',
    'ciger kebabi',
    'salgam',
    'isot',
  ],
  lokanta: [
    'lokanta',
    'ev yemegi',
    'ev yemekleri',
    'esnaf lokantasi',
    'restoran',
    'lokantasi',
    'ogle yemegi',
    'manti',
    'kuru fasulye',
    'pilav',
    'sulu yemek',
    'tavuk pilav',
    'taze fasulye',
    'nohut',
    'etli nohut',
    'barbunya',
    'nohutlu pilav',
    'pilav ustu',
    'dolma',
    'sarma',
    'karniyarik',
    'imam bayildi',
    'guvec',
    'tas kebabi',
    'mucver',
    'hunkar begendi',
    'kuzu guvec',
    'mercimek koftesi',
    'icli kofte',
    'kisir',
    'yaprak sarma',
    'etli yaprak sarma',
    'lahana sarmasi',
    'zeytinyagli',
    'enginar',
    'borulce',
    'kabak cicegi',
    'keskek',
    'hingel',
    'tavuk sote',
    'et sote',
    'sebzeli',
    'turlu',
    'kapama',
    'perde pilavi',
    'bulgur pilavi',
    'eksili kofte',
    'sulu kofte',
    'eriste',
    'cevizli eriste',
    'bamya',
    'radika',
    'tirit',
    'yaglama',
    'yanic',
    'sevketi bostan',
    'bulgur koftesi',
  ],
  fish: [
    'balik',
    'balikci',
    'deniz urunleri',
    'midye',
    'fish',
    'seafood',
    'levrek',
    'cipura',
    'hamsi',
    'kalamar',
    'karides',
    'balik ekmek',
    'ahtapot',
    'midye dolma',
    'lufer',
    'barbun',
    'istavrit',
    'sardalya',
    'uskumru',
    'palamut',
    'somon',
    'alabalik',
    'kalkan',
    'mezgit',
    'cupra',
    'cinekop',
    'kefal',
    'balik corbasi',
    'balik bugulama',
    'midye tava',
    'karides guvec',
    'deniz mahsulleri',
    'hamsi koftesi',
  ],
  cafe: [
    'kafe',
    'kahve',
    'cafe',
    'coffee',
    'cay',
    'cay bahcesi',
    'kahvehane',
    'filtre kahve',
    'turk kahvesi',
    'espresso',
    'latte',
    'bubble tea',
    'cappuccino',
    'americano',
    'mocha',
    'frappe',
    'cold brew',
    'matcha',
    'sicak cikolata',
    'salep',
    'boza',
    'smoothie',
    'milkshake',
    'limonata',
    'dibek kahvesi',
    'menengic kahvesi',
    'mirra',
    'kusburnu',
  ],
  meyhane: [
    'meyhane',
    'bar',
    'pub',
    'meze',
    'raki',
    'raki balik',
    'bira',
    'coban salata',
    'gavurdagi salatasi',
    'patlican salatasi',
    'rus salatasi',
    'acili ezme',
    'ezme',
    'haydari',
    'muhammara',
    'babagannus',
    'cacik',
    'fava',
    'saksuka',
    'topik',
    'lakerda',
    'ciroz',
  ],
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
    'hamburger',
    'tavuk doner',
    'kumpir',
    'sandvic',
    'wrap',
    'kiymali pide',
    'kusbasili pide',
    'kasarli pide',
    'etli ekmek',
    'etli pide',
    'patso',
    'sosisli',
    'ayvalik tostu',
    'cig borek',
    'tavuk burger',
    'nugget',
    'patates kizartmasi',
    'hot dog',
    'et doner',
    'yaprak doner',
    'cantik',
  ],
  world: [
    'dunya mutfagi',
    'world',
    'world cuisine',
    'uzak dogu',
    'uzakdogu',
    'asya',
    'asya mutfagi',
    'japon mutfagi',
    'cin mutfagi',
    'italyan mutfagi',
    'hint mutfagi',
    'meksika mutfagi',
    'kore mutfagi',
    'tay mutfagi',
    'asian',
    'japon',
    'japanese',
    'cin',
    'cin yemegi',
    'chinese',
    'italyan',
    'italian',
    'meksika',
    'mexican',
    'hint',
    'indian',
    'tay',
    'thai',
    'kore',
    'korean',
    'vietnam',
    'fransiz',
    'french',
    'yunan',
    'greek',
    'lubnan',
    'arap',
    'gurcu',
    'rus',
    'ispanyol',
    'tapas',
    'fusion',
    'sushi',
    'susi',
    'sashimi',
    'maki',
    'california roll',
    'nigiri',
    'ramen',
    'udon',
    'soba',
    'tempura',
    'gyoza',
    'katsu',
    'teriyaki',
    'yakitori',
    'miso corba',
    'onigiri',
    'bento',
    'edamame',
    'noodle',
    'wok',
    'dim sum',
    'dumpling',
    'pekin ordegi',
    'cin boregi',
    'spring roll',
    'kung pao',
    'tatli eksi',
    'kizarmis pilav',
    'bao',
    'pad thai',
    'tom yum',
    'yesil kori',
    'pho',
    'kimchi',
    'bibimbap',
    'kore barbeku',
    'tteokbokki',
    'kori',
    'curry',
    'tikka masala',
    'butter chicken',
    'naan',
    'biryani',
    'samosa',
    'tandoori',
    'makarna',
    'spagetti',
    'spaghetti',
    'lazanya',
    'lasagna',
    'risotto',
    'ravioli',
    'gnocchi',
    'fettuccine',
    'carbonara',
    'penne',
    'bolonez',
    'pesto',
    'bruschetta',
    'carpaccio',
    'taco',
    'burrito',
    'burrito bowl',
    'quesadilla',
    'kesadilya',
    'nachos',
    'fajita',
    'enchilada',
    'guacamole',
    'falafel',
    'humus',
    'shawarma',
    'savurma',
    'tabule',
    'fattoush',
    'mutabbel',
    'kibbeh',
    'hinkali',
    'hacapuri',
    'pelmeni',
    'borsch',
    'paella',
    'poke',
    'poke bowl',
    'fondue',
  ],
  dessert: [
    'tatli',
    'dondurma',
    'pastane',
    'baklava',
    'dessert',
    'kunefe',
    'sutlac',
    'profiterol',
    'waffle',
    'kazandibi',
    'krep',
    'tiramisu',
    'cheesecake',
    'san sebastian',
    'trilece',
    'lokma',
    'tulumba',
    'revani',
    'sekerpare',
    'kadayif',
    'supangle',
    'donut',
    'macaron',
    'kemalpasa tatlisi',
    'asure',
    'gullac',
    'keskul',
    'tavuk gogsu',
    'irmik helvasi',
    'helva',
    'pismaniye',
    'ekler',
    'pasta',
    'kurabiye',
    'cikolata',
    'magnolia',
    'sufle',
    'brownie',
    'cupcake',
    'lokum',
    'kestane sekeri',
    'churros',
    'muhallebi',
    'su muhallebisi',
    'hosmerim',
    'kabak tatlisi',
    'ayva tatlisi',
    'cevizli sucuk',
    'laz boregi',
    'kerebic',
    'sambali',
    'sillik',
    'bomba',
    'pestil',
  ],
};

/** Turkish case/occupation suffixes, longest first, for single-word stemming. */
const QUERY_SUFFIXES = [
  'ndaki',
  'ndeki',
  'larda',
  'lerde',
  'daki',
  'deki',
  'taki',
  'teki',
  'lari',
  'leri',
  'lar',
  'ler',
  'dan',
  'den',
  'tan',
  'ten',
  'da',
  'de',
  'ta',
  'te',
  'ya',
  'ye',
  'yi',
  'yu',
  'si',
  'su',
  'ci',
  'cu',
];

/** The category listing the folded word or phrase; the food lexicon fills in what the lists miss. */
function exactCategory(f: string, lexicon = true): FoodCategory | null {
  return (
    FOOD_CATEGORIES.find((cat) => CATEGORY_WORDS[cat].includes(f)) ??
    (lexicon ? (FOOD_LEXICON.get(f) ?? null) : null)
  );
}

/** The word minus one trailing suffix (stem of at least 3 chars, or 2 if it is a category word), or null. */
function stripSuffix(w: string): string | null {
  const suf = QUERY_SUFFIXES.find(
    (s) =>
      w.endsWith(s) &&
      (w.length - s.length >= 3 ||
        (w.length - s.length === 2 && exactCategory(w.slice(0, 2)) !== null)),
  );
  return suf ? w.slice(0, w.length - suf.length) : null;
}

/**
 * The category of "X yemeği" / "X yemekleri" / "-lı yemek" ("sebze yemeği", "etli yemek"): the one
 * X names, an -lı word by the noun it comes from ("etli" -> "et"). A bare "X yemek" is the verb
 * ("pide yemek istiyorum"), so only the -lı form counts. Null when X names no category.
 */
function mealPhraseCategory(parts: string[], lexicon: boolean): FoodCategory | null {
  const meal = parts[parts.length - 1];
  const prefix = parts.slice(0, -1);
  if (parts.length < 2 || parts.length > 4 || !meal) return null;
  const last = prefix[prefix.length - 1] ?? '';
  const adjective = /l[iu]$/.test(last) && last.length >= 4;
  if (!(meal === 'yemegi' || meal === 'yemekleri' || (meal === 'yemek' && adjective))) return null;
  const direct = categoryForQuery(prefix.join(' '), true, lexicon);
  if (direct) return direct;
  return adjective && prefix.length === 1
    ? categoryForQuery(last.slice(0, -2), false, lexicon)
    : null;
}

/**
 * The category a search text names outright ("balık", "kahvaltı"), or null.
 * `headNoun` also reads a 2-3 word phrase by the dish it ends with; `lexicon` false
 * leaves out the Turkish food lexicon (only the category lists answer).
 */
export function categoryForQuery(q: string, headNoun = false, lexicon = true): FoodCategory | null {
  const f = fold(q.trim());
  if (!f) return null;
  const ex = (w: string) => exactCategory(w, lexicon);
  const exact = ex(f);
  if (exact) return exact;
  if (f.includes(' ')) {
    const parts = f.split(' ');
    // "sebze yemeği", "et yemeği", "etli yemek": the generic meal word says nothing, the word before it names the category.
    const meal = mealPhraseCategory(parts, lexicon);
    if (meal) return meal;
    // "tavuk pilavcı": a two-word phrase whose last word carries one suffix.
    if (parts.length === 2) {
      const [first, last] = parts;
      const stem = first !== undefined && last !== undefined ? stripSuffix(last) : null;
      const c = stem ? ex(`${first} ${stem}`) : null;
      if (c) return c;
    }
    return headNoun && parts.length <= 3 ? categoryByHeadNoun(parts, lexicon) : null;
  }
  if (headNoun && f in HEAD_ONLY_CATEGORY) return HEAD_ONLY_CATEGORY[f] ?? null;
  // "köfteci", "köftecide": try the stem with one, then two suffixes removed.
  const one = stripSuffix(f);
  if (!one) return null;
  const c1 = ex(one);
  if (c1) return c1;
  const two = stripSuffix(one);
  return two ? ex(two) : null;
}

/** True for a dish modifier ("cevizli", "kiremitte") or any word that names a food category. */
export function isFoodWord(folded: string): boolean {
  return MODIFIERS.has(folded) || categoryForQuery(folded) !== null;
}

/** Words that name a kind of place, not a dish: never the head noun of a dish phrase ("taze balık"). */
const PLACE_KIND_WORDS = new Set([
  'et',
  'balik',
  'balikci',
  'kahvalti',
  'lokanta',
  'restoran',
  'kafe',
  'cafe',
  'kahve',
  'coffee',
  'kahvehane',
  'meyhane',
  'bar',
  'pub',
  'pastane',
  'meat',
  'grill',
  'fish',
  'soup',
  'seafood',
  'breakfast',
  'brunch',
  'dessert',
  'world',
  'asian',
  'fusion',
]);

/** Cooking words after a main ingredient ("hamsi tava", "kuzu kapama"): the ingredient names the dish. */
export const COOKING_WORDS = new Set([
  'tava',
  'izgara',
  'kapama',
  'bugulama',
  'guvec',
  'dolma',
  'kizartma',
]);

/** Words that are a category only as the head of a dish phrase ("rus salatası"); alone they stay out of categoryForQuery. */
const HEAD_ONLY_CATEGORY: Record<string, FoodCategory> = { salata: 'meyhane' };

/** The head-noun endings that mark a compound with the word before it ("kebabı", "tatlısı", "böreği"). */
const COMPOUND_ENDINGS = ['si', 'su', 'i', 'u'];

/** The last letter of a stem as it softens before a vowel ("simit" -> "simid", "kitap" -> "kitab", "çiçek" -> "çiçeğ"). */
const SOFTENED: Record<string, string> = { g: 'k', d: 't', b: 'p' };

/** True when `word` is `stem` plus a compound ending, also with the stem's last letter softened ("simidi"). */
function hasCompoundEnding(word: string, stem: string): boolean {
  return COMPOUND_ENDINGS.some((e) => {
    if (!word.endsWith(e)) return false;
    const base = word.slice(0, word.length - e.length);
    const hard = SOFTENED[base.slice(-1)];
    return base === stem || (hard !== undefined && base.slice(0, -1) + hard === stem);
  });
}

/**
 * The category of a 2- or 3-word phrase read by its head noun at the end:
 * "tepsi kebabı", "kabak tatlısı" (compound ending), "sucuklu pide" (-lı modifier),
 * "kumru sandviç" (the rest is a food word), "hamsi tava" (cooking word after a dish word),
 * "cevizli baklava", "kiremitte köfte" (a known modifier, a -sız / -da word naming a cooking place).
 * A modifier that says nothing ("zzqxv köfte") leaves the phrase to the caller.
 */
function categoryByHeadNoun(parts: string[], lexicon: boolean): FoodCategory | null {
  const ex = (w: string) => exactCategory(w, lexicon);
  const word = parts[parts.length - 1] ?? '';
  const modifier = parts.slice(0, -1);
  const first = modifier[0] ?? '';
  const isModifier = (m: string): boolean => lexicon && MODIFIERS.has(m);
  const isCategory = (m: string): boolean =>
    (m === 'et' || !PLACE_KIND_WORDS.has(m)) && ex(m) !== null;
  const isFood = (m: string): boolean => isModifier(m) || isCategory(m);
  const modifierIsFood = (): boolean => [...modifier, modifier.join(' ')].some(isFood);
  const stems = headStems(word);
  // "çavdar ekmeği", "köy ekmeği": bread from a bakery; a dish word before it ("sucuk ekmek") keeps its dish.
  if (stems.includes('ekmek') && modifier.every((m) => BREAD_MODIFIER_WORDS.has(m)))
    return 'breakfast';
  if (stems.some((stem) => COOKING_WORDS.has(stem)) && modifierIsFood()) {
    const c = ex(first) ?? ex(modifier.join(' '));
    if (c) return c;
  }
  // "kiremitte", "tencerede": the place of cooking, when the word before the ending is a food word.
  const locative = lexicon && /(da|de|ta|te)$/.test(first) && isFood(first.slice(0, -2));
  const byWord =
    /l[iu]$/.test(first) ||
    (lexicon && /s[iu]z$/.test(first)) ||
    locative ||
    [...modifier, modifier.join(' ')].some(isModifier);
  const byFood = [...modifier, modifier.join(' ')].some(isCategory);
  for (const stem of stems) {
    if (PLACE_KIND_WORDS.has(stem)) continue;
    const c = ex(stem) ?? HEAD_ONLY_CATEGORY[stem];
    if (!c) continue;
    const fromLexicon =
      exactCategory(stem, false) === null && HEAD_ONLY_CATEGORY[stem] === undefined;
    // A short lexicon word ("dil", "kek") is too common a word to be a head by its ending alone.
    const compound = !(fromLexicon && stem.length < 4) && hasCompoundEnding(word, stem);
    // A drink next to a dish is its side ("lahmacun ayran"), not the head.
    const side = fromLexicon && c === 'cafe';
    if (compound || byWord || (byFood && !side)) return c;
  }
  return null;
}

/** Endings of a dish's head noun: plural, seller and compound ("kebabı", "tatlısı", "böreği", "çorbası"). */
const HEAD_ENDINGS = ['lari', 'leri', 'lar', 'ler', 'ci', 'cu', 'si', 'su', 'i', 'u'];

/** The folded word and its forms without an ending, also with the last letter hardened ("boregi" -> "borek", "simidi" -> "simit"). */
export function headStems(word: string): string[] {
  const out = [word];
  for (const e of HEAD_ENDINGS) {
    if (!word.endsWith(e) || word.length - e.length < 3) continue;
    const stem = word.slice(0, word.length - e.length);
    out.push(stem);
    const hard = SOFTENED[stem.slice(-1)];
    if (hard !== undefined) out.push(`${stem.slice(0, -1)}${hard}`);
  }
  return out;
}

/** The folded dish minus up to two suffixes on its last word, as far as it is still a category word. */
export function dishStem(dish: string): string {
  const f = fold(dish.trim());
  if (!f || exactCategory(f)) return f;
  const parts = f.split(' ');
  let last: string | null = parts.pop() ?? '';
  for (let i = 0; i < 2 && last; i++) {
    last = stripSuffix(last);
    if (last && exactCategory([...parts, last].join(' '))) return [...parts, last].join(' ');
  }
  return f;
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

/** "1,8 km" (Turkish) or "1.8 km" (English) from 1 km up, otherwise "650 m". */
export function formatDistance(m: number, lang: string = i18next.language ?? 'tr'): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = (m / 1000).toFixed(1);
  return `${lang.startsWith('tr') ? km.replace('.', ',') : km} km`;
}
