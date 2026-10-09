import raw from '../../data/places-izmir.json';
import { distanceMeters, type LatLng } from './geo';
import { CURATED_PLACES, IZMIR_CENTER, isInIzmirArea, POPULAR_PLACES } from './places';
import { categoryForQuery, type FoodCategory } from './restaurants';
import { staticParkings } from './staticParkings';

/** Kinds shown as a subtitle; the label text lives in i18n (search.kind.*). */
export type PlaceKind =
  | 'popular'
  | 'town'
  | 'area'
  | 'mall'
  | 'hospital'
  | 'university'
  | 'pier'
  | 'station'
  | 'hotel'
  | 'landmark'
  | 'parking'
  | 'apple';

/** `subtitle` replaces the kind label when set (e.g. an Apple Maps address). */
export type SearchHit = {
  name: string;
  kind: PlaceKind;
  subtitle?: string;
  /** Nearest district / town name, shown after the kind. */
  district?: string;
  /** Outside the İzmir province box (see isInIzmirArea). */
  far?: boolean;
} & LatLng;

type RawPlace = {
  n: string;
  a: number;
  o: number;
  k: Exclude<PlaceKind, 'popular' | 'parking' | 'apple'>;
};

/** Lower-case, Turkish letters folded to ASCII, punctuation dropped. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Entry = SearchHit & {
  key: string;
  compact: string;
  rank: number;
  /** Words of the folded name, and of the district (popular places only). */
  words: string[];
  districtWords: string[];
  hay: string;
  /** Folded alternative names that count as an exact match. */
  aliases: string[];
  /** Metres from IZMIR_CENTER. */
  d: number;
};

// Higher wins on equal match quality.
const KIND_RANK: Record<PlaceKind, number> = {
  apple: 0,
  popular: 9,
  mall: 8,
  town: 7,
  area: 6,
  pier: 6,
  hospital: 5,
  university: 5,
  hotel: 4,
  landmark: 4,
  station: 4,
  parking: 3,
};

const SAME_PLACE_M = 300;
const NEAR_CITY_M = 6_000;
const PENALTY_FROM_M = 15_000;
const FAR_M = 30_000;

// Words that add no meaning to a place search ("alsancak otopark", "izmir otogar").
const FILLER = new Set([
  'izmir',
  'otopark',
  'otoparki',
  'park',
  'parking',
  'yakini',
  'yakin',
  'civari',
]);
// Generic nouns: used when the name has them, ignored when it does not.
const OPTIONAL = new Set(['carsi', 'carsisi', 'liman', 'limani', 'otogar', 'otogari']);
// A generic noun on its own points to the best known place for it.
const ALIAS: Record<string, string> = {
  liman: 'alsancak',
  limani: 'alsancak',
  carsi: 'kemeralti',
  carsisi: 'kemeralti',
};

// Whole queries (folded) that stand for another search: abbreviations and the
// English words visitors type. Food words live in restaurants.ts.
const QUERY_ALIAS: Record<string, string> = {
  deu: 'dokuz eylul universitesi',
  'ege tip': 'ege universitesi hastanesi',
  'clock tower': 'saat kulesi',
  bazaar: 'kemeralti',
  'old bazaar': 'kemeralti',
  ferry: 'iskele',
  pier: 'konak pier',
  promenade: 'kordon',
  'kordon promenade': 'kordon',
  airport: 'adnan menderes havalimani',
  'bus station': 'izmir otogari',
  'cruise port': 'alsancak limani',
  port: 'alsancak limani',
  ephesus: 'efes antik kenti',
};
// Queries that name a university or hospital even without the word for it.
const INSTITUTION_QUERIES = new Set(['deu', 'ege tip', 'dokuz eylul']);

let index: Entry[] | null = null;

function entry(hit: SearchHit, aliases: string[] = []): Entry {
  const key = fold(hit.name);
  return {
    ...hit,
    key,
    compact: key.replace(/ /g, ''),
    rank: KIND_RANK[hit.kind],
    hay: key,
    aliases,
    words: key.split(' '),
    districtWords: hit.district ? fold(hit.district).split(' ') : [],
    d: distanceMeters(hit, IZMIR_CENTER),
  };
}

function buildIndex(): Entry[] {
  const places = (raw as { items: RawPlace[] }).items.map((p) =>
    entry({ name: p.n, lat: p.a, lng: p.o, kind: p.k }),
  );
  const popular = POPULAR_PLACES.map((p) =>
    entry({ name: p.name, lat: p.lat, lng: p.lng, kind: 'popular', district: p.district }),
  );
  // Named car parks are useful targets too ("Konak Katlı").
  const parkings = staticParkings()
    .filter((p) => !p.genericName)
    .map((p) => entry({ name: p.name, lat: p.lat, lng: p.lng, kind: 'parking' }));
  const curated = CURATED_PLACES.map((p) =>
    entry({ name: p.name, lat: p.lat, lng: p.lng, kind: p.kind, district: p.district }, p.aliases),
  );
  // A curated place stands for any other entry within 300 m that has its name
  // or one of its aliases (the OSM "Efes", "Kültürpark"): list it once.
  const dup = (e: Entry) =>
    curated.some(
      (c) => (c.key === e.key || c.aliases.includes(e.key)) && distanceMeters(c, e) <= SAME_PLACE_M,
    );
  return [
    ...popular.filter((e) => !dup(e)),
    ...curated,
    ...places.filter((e) => !dup(e)),
    ...parkings.filter((e) => !dup(e)),
  ];
}

let towns: (LatLng & { name: string })[] | null = null;

function nearestTown(p: LatLng): string | undefined {
  towns ??= (raw as { items: RawPlace[] }).items
    .filter((t) => t.k === 'town')
    .map((t) => ({ name: t.n, lat: t.a, lng: t.o }));
  let best: string | undefined;
  let bestD = Infinity;
  for (const t of towns) {
    const d = distanceMeters(p, t);
    if (d < bestD) {
      bestD = d;
      best = t.name;
    }
  }
  return best;
}

/** Query words that carry meaning, with generic nouns mapped to a known place. */
function contentTokens(q: string): string[] {
  const all = q.split(' ');
  // "car park" is filler, but "car" alone must not match Çarşı.
  return all.filter(
    (t, i) => t && !FILLER.has(t) && !(t === 'car' && /^park(ing)?$/.test(all[i + 1] ?? '')),
  );
}

/** The known place a lone generic noun stands for ("liman"), if any. */
function aliasFor(tokens: string[]): string | undefined {
  return tokens.length > 0 && tokens.every((t) => OPTIONAL.has(t)) ? ALIAS[tokens[0]!] : undefined;
}

/** The word itself plus a form without a Turkish possessive ending ("limani" -> "liman"). */
function variants(tok: string): string[] {
  const out = [tok];
  if (tok.length > 4 && tok.endsWith('si')) out.push(tok.slice(0, -2));
  if (tok.length > 4 && /[iu]$/.test(tok)) out.push(tok.slice(0, -1));
  return out;
}

/** 2 = starts a name word, 1 = inside a name word or starts a district word, 0 = absent. */
function tokenMatch(e: Entry, vs: string[]): number {
  let best = 0;
  for (const v of vs) {
    if (e.words.some((w) => w.startsWith(v))) return 2;
    if (v.length >= 3 && e.hay.includes(v)) best = 1;
    else if (e.districtWords.some((w) => w.startsWith(v))) best = 1;
  }
  return best;
}

/** Every content word must match; generic nouns (çarşı, liman) are optional. */
function tokenScore(e: Entry, tokens: { vs: string[]; optional: boolean }[]): number {
  let allPrefix = true;
  let bonus = 0;
  for (const t of tokens) {
    const m = tokenMatch(e, t.vs);
    if (m === 0) {
      if (t.optional) continue;
      return 0;
    }
    if (m < 2) allPrefix = false;
    if (t.optional) bonus += 10;
  }
  return (allPrefix ? 250 : 120) + bonus;
}

/**
 * Searches bundled İzmir places (OpenStreetMap) and car park names on the
 * device. Matches ignore case, Turkish letters and spaces ("istinyepark",
 * "İstinye Park" and "istinye" all find "İstinyePark İzmir"). Several words
 * ("kordon alsancak") must each start a word of the name. Places far from the
 * city centre rank lower but stay listed.
 */
export function searchPlaces(query: string, limit = 6): SearchHit[] {
  let q = fold(query);
  if (q.length < 2) return [];
  const wantsInstitution = INSTITUTION_QUERIES.has(q);
  q = QUERY_ALIAS[q] ?? q;
  const alias = aliasFor(contentTokens(q));
  if (alias) q = alias;
  const qc = q.replace(/ /g, '');
  index ??= buildIndex();
  const words = contentTokens(q);
  const allOptional = words.length > 0 && words.every((w) => OPTIONAL.has(w));
  const tokens = words.map((w) => ({
    vs: variants(w),
    // Only optional when something else in the query is required.
    optional: !allOptional && OPTIONAL.has(w),
  }));
  // A known abbreviation lifts universities / hospitals clearly; the plain words
  // "üniversite" / "hastane" only break ties (they already match by name).
  const institutionBoost = wantsInstitution
    ? 150
    : words.some((w) => w.startsWith('universite') || w.startsWith('hastane'))
      ? 10
      : 0;
  const scored: { e: Entry; score: number }[] = [];
  for (const e of index) {
    let score = 0;
    const exact =
      e.key === q || e.compact === qc || e.aliases.includes(q) || e.aliases.includes(qc);
    if (exact) score = 400;
    else if (e.key.startsWith(q) || e.compact.startsWith(qc)) score = 300;
    else if (e.key.includes(` ${q}`)) score = 200;
    else if (e.compact.includes(qc)) score = 100;
    if (tokens.length > 0 && score < 250) score = Math.max(score, tokenScore(e, tokens));
    if (score === 0) continue;
    const near = e.d < NEAR_CITY_M ? 40 * (1 - e.d / NEAR_CITY_M) : 0;
    // An exact name is what the user typed: distance never demotes it.
    const far =
      !exact && e.d > PENALTY_FROM_M ? Math.min(((e.d - PENALTY_FROM_M) / 1000) * 3, 250) : 0;
    let adjust = e.rank * 5 - Math.min(e.key.length, 40) / 4 + near - far;
    // An exact town beats a same-named neighbourhood ("Selçuk"); a lone word
    // names a place before it names a car park ("Efes", "Hilton").
    if (exact && e.kind === 'town') adjust += 50;
    if (words.length === 1 && e.kind === 'parking') adjust -= 30;
    if (e.kind === 'university' || e.kind === 'hospital') adjust += institutionBoost;
    scored.push({ e, score: score + adjust });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: SearchHit[] = [];
  for (const { e } of scored) {
    // Same name in the same spot is one place. The same name elsewhere is kept
    // only when it is another kind of place near the city (e.g. "Ege
    // Üniversitesi" campus vs. its metro station), never a far duplicate.
    if (
      out.some(
        (o) =>
          fold(o.name) === e.key &&
          (o.kind === e.kind || e.d > FAR_M || distanceMeters(o, e) <= SAME_PLACE_M),
      )
    )
      continue;
    out.push({
      name: e.name,
      kind: e.kind,
      lat: e.lat,
      lng: e.lng,
      ...(e.kind === 'town' ? {} : { district: e.district ?? nearestTown(e) }),
      ...(isInIzmirArea(e) ? {} : { far: true }),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The leftover text names a place when each word starts a word of a place name
 * (short words must be a whole word), not merely appears inside one.
 */
function namesPlace(text: string): boolean {
  const toks = text.split(' ').filter(Boolean);
  if (toks.length === 0) return false;
  return searchPlaces(text, 20).some((h) => {
    const w = [...fold(h.name).split(' '), ...(h.district ? fold(h.district).split(' ') : [])];
    return toks.every((t) => w.some((x) => (t.length >= 4 ? x.startsWith(t) : x === t)));
  });
}

/**
 * "Bornova balık" -> the place "bornova" plus the food category. Null when the
 * text is not a place followed or preceded by a category word.
 */
export function splitPlaceAndCategory(
  query: string,
): { placeQuery: string; cat: FoodCategory } | null {
  const tokens = fold(query).split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  // A name that contains every word is a place, not place + category.
  const whole = searchPlaces(query, 1)[0];
  if (whole && tokens.every((t) => fold(whole.name).includes(t))) return null;
  for (const len of [2, 1]) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const cat = categoryForQuery(tokens.slice(i, i + len).join(' '));
      if (!cat) continue;
      const placeQuery = [...tokens.slice(0, i), ...tokens.slice(i + len)].join(' ');
      if (placeQuery.length >= 2 && namesPlace(placeQuery)) return { placeQuery, cat };
    }
  }
  return null;
}

/** For tests: rebuild with the current data. */
export function resetSearchIndex() {
  index = null;
}
