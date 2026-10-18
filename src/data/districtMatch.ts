import type { Quarter } from './quarters';
import { DISHES, dishProfile } from './dishes';
import { FOOD_LEXICON } from './foodLexicon';
import { parseQuery } from './intent';
import { fold } from './search';
import type { Understanding } from '@/lib/ai/protocol';

type Search = Extract<Understanding, { kind: 'search' }>;

/** Case endings a district takes in a sentence ("bornovada", "kadıköyden", "buca'ya"). */
const SUFFIXES = [
  'nda',
  'nde',
  'dan',
  'den',
  'tan',
  'ten',
  'ya',
  'ye',
  'da',
  'de',
  'ta',
  'te',
  'a',
  'e',
];

/** The endings of "in" and "from" a place: a word with one of them is meant as a place. */
const LOCATED = ['nda', 'nde', 'dan', 'den', 'tan', 'ten', 'da', 'de', 'ta', 'te'];

/** Words that make the word before them a place ("kas tarafında", "bebek civarı"). */
const AREA_WORDS = ['taraf', 'civar', 'semt', 'yakin', 'merkez'];

/** Words that ask where ("kunafa aalnya nerde"): the word before one is meant as a place. */
const WHERE_WORDS = ['nerede', 'nerde', 'nereye', 'nereden', 'neresi'];

/** The name folded with no spaces: "Göl­başı" (a soft hyphen) and "Golbasi" are the same. */
const key = (s: string) => fold(s).replace(/ /g, '');

/** Insertions, deletions, substitutions and swaps of neighbours between a and b (Damerau). */
function edits(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** The word itself and the word without each case ending it may carry. */
function stems(word: string): string[] {
  const out = [word];
  for (const s of SUFFIXES)
    if (word.endsWith(s) && word.length - s.length >= 3) out.push(word.slice(0, -s.length));
  return out;
}

/**
 * The district of `districts` that `word` names: exactly (folded), or for a name of five letters
 * or more, within one typo (two from eight letters) of a stem of five letters or more with the
 * same first letter. A shorter name ("Kaş", "Buca", "Tire") must be typed with its own letters,
 * so "kas" (muscle) is never Kaş.
 */
export function matchDistrict(
  word: string,
  districts: readonly string[],
  opts: { typos?: boolean | 'located'; placed?: boolean } = {},
): string | null {
  const typos = opts.typos ?? true;
  const low = word.toLocaleLowerCase('tr').replace(/['’`]/g, '');
  const w = key(word);
  if (!w) return null;
  let best: { name: string; cost: number } | null = null;
  for (const name of districts) {
    const n = key(name);
    if (n.length < 5) {
      const own = name.toLocaleLowerCase('tr');
      const rest = low.startsWith(own) ? low.slice(own.length) : null;
      if (rest !== null && (rest === '' || SUFFIXES.includes(fold(rest)))) return name;
      // Typed without its letters ("kas"), a short name counts only when it is said as a place:
      // with an "in/from" ending ("kasta") or before an area word ("kas tarafında").
      if (opts.placed && w === n) return name;
      if (typos === 'located' && LOCATED.some((e) => w === n + e)) return name;
      continue;
    }
    for (const s of stems(w)) {
      if (s === n) return name;
      if (!typos || s.length < 5 || s[0] !== n[0]) continue;
      // 'located': a typo only on a stem that carried a place ending ("sicanda", "maamakta").
      if (typos === 'located' && !LOCATED.some((e) => w === s + e)) continue;
      const cost = edits(s, n);
      if (cost <= (n.length >= 8 ? 2 : 1) && (!best || cost < best.cost)) best = { name, cost };
    }
  }
  return best?.name ?? null;
}

/**
 * The first word of the text (outside `skip`) that names a district, case ending and missing
 * Turkish letters aside, or null. A typo counts only on a word that carries a place ending ("in" /
 * "from": "sicanda", "kciorende"): bare everyday words sit one letter from a district ("çabuk"
 * Çubuk, "serin" Serik, "tuzlu" Tuzla). A word right before a where-word ("aalnya nerde") or an
 * area word ("aalnya civarı") is said as a place too, so it may carry a typo bare.
 */
export function districtInText(
  text: string,
  districts: readonly string[],
  skip: readonly string[] = [],
): string | null {
  const skipped = new Set(skip.flatMap((s) => fold(s).split(' ')).filter(Boolean));
  const words = text
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}'’]+/u)
    .filter(Boolean);
  for (const [k, word] of words.entries()) {
    // "Menemen'i" is the dish the AI named, case ending or not.
    if (stems(key(word)).some((st) => skipped.has(st))) continue;
    if (stems(key(word.split(/['’]/)[0]!)).some((st) => skipped.has(st))) continue;
    const next = words[k + 1] ? key(words[k + 1]!) : '';
    const placed = AREA_WORDS.some((a) => next.startsWith(a));
    const asked = WHERE_WORDS.includes(next);
    const hit = matchDistrict(word, districts, {
      typos: placed || asked ? true : 'located',
      placed,
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * The quarter of `quarters` that a word of the text names (outside `skip`), case ending and missing
 * Turkish letters aside, or null. Exact only: a quarter is a short everyday-looking name, so a typo
 * is left to the AI. A `common` name ("moda", "hurma") counts only when said as a place: with an
 * "in/from" ending ("hurmada") or before an area word ("moda tarafında").
 */
export function quarterInText(
  text: string,
  quarters: readonly Quarter[],
  skip: readonly string[] = [],
): Quarter | null {
  if (quarters.length === 0) return null;
  const skipped = new Set(skip.flatMap((s) => fold(s).split(' ')).filter(Boolean));
  const words = text
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}'’]+/u)
    .filter(Boolean);
  for (const [k, word] of words.entries()) {
    const w = key(word);
    const forms = stems(w);
    if (forms.some((st) => skipped.has(st))) continue;
    const next = words[k + 1] ? key(words[k + 1]!) : '';
    const placed = AREA_WORDS.some((a) => next.startsWith(a));
    for (const q of quarters) {
      const n = key(q.n);
      if (!forms.includes(n)) continue;
      if (!q.common || placed || LOCATED.some((e) => w === n + e)) return q;
    }
  }
  return null;
}

/** True when a word of the text names `district`, with a case ending or a typo. */
function mentions(text: string, district: string): boolean {
  return text
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}'’]+/u)
    .some((w) => w && matchDistrict(w, [district]) === district);
}

/**
 * The AI's search with its district settled against the city's own list, the way the app reads
 * it: a district typed wrong or without Turkish letters becomes the city's spelling; a name that
 * is not a district (a quarter such as Karaköy or Kızılay) moves to `place`; a district the AI
 * wrote into place moves to `district`. With neither a district nor a place, a district named in
 * the text (exactly) is used, unless the AI read that word as the dish (İzmir's Menemen). A place
 * the AI named is never overridden by another word of the sentence ("Karşıyaka'dan geçiyorum,
 * Alsancak'ta balık"). A well-known quarter of the city (`quarters`) written bare in the text
 * ("lara balık") is the place when the AI named none. Other kinds pass through.
 *
 * `earlier` is the user's earlier messages of the conversation, newest first. A district the AI
 * invents (said neither in the text nor in any earlier message, with no place named) yields to the
 * district the user said most recently there ("vejetaryenim" / "buca" / "tatlı da olur mu": Buca,
 * not the AI's Bornova). A district the user did say earlier is kept.
 */
export function settleDistrict<T extends Understanding>(
  u: T,
  text: string,
  districts: readonly string[],
  quarters: readonly Quarter[] = [],
  earlier: readonly string[] = [],
): T {
  if (u.kind !== 'search') return u;
  const r = settled(u as Search, text, districts, quarters, earlier);
  return settleDish(r, text, placeWords(r, text, districts, quarters)) as T;
}

function settled(
  s: Search,
  text: string,
  districts: readonly string[],
  quarters: readonly Quarter[],
  earlier: readonly string[],
): Search {
  // appleQuery often repeats the district, so it does not count.
  const skip = [s.dish, ...(s.dishServes ?? [])].filter((v): v is string => !!v);
  if (s.district) {
    const hit = matchDistrict(s.district, districts);
    if (!hit) return { ...s, district: null, place: s.place ?? s.district };
    // The AI's district is nowhere in the text, but a word of it names another one ("sicanda"
    // read as Çankaya): the user's word wins. Not when the AI named a place, whose district it
    // gave ("Kızılay" in Çankaya, "Karşıyaka'dan geçiyorum, Alsancak'ta").
    if (!s.place && !mentions(text, hit)) {
      const said = districtInText(text, districts, skip);
      if (said && said !== hit) return { ...s, district: said };
      // Nor in an earlier message of the user: the district they said last wins over the invented one.
      if (!said && !earlier.some((m) => mentions(m, hit))) {
        const before = earlier.map((m) => districtInText(m, districts, [])).find(Boolean);
        if (before && before !== hit) return { ...s, district: before };
      }
    }
    return { ...s, district: hit };
  }
  // A district written into place ("Bornova").
  const asPlace = s.place ? matchDistrict(s.place, districts) : null;
  if (asPlace) return { ...s, district: asPlace, place: null };
  // A quarter the AI missed ("lara balık" read as near me). Not when it asked which place was meant.
  if (!s.place && s.clarify?.ask !== 'place') {
    const q = quarterInText(text, quarters, skip);
    if (q) return { ...s, place: q.n, nearMe: false };
  }
  if (s.place) return s;
  if (s.nearMe) {
    // The AI's "near me" with no near-me word in the text: a district the text names wins.
    const said = parseQuery(text);
    if (said.kind === 'search' && said.nearMe) return s;
    const named = districtInText(text, districts, skip);
    return named ? { ...s, district: named, nearMe: false } : s;
  }
  const found = districtInText(text, districts, skip);
  return found ? { ...s, district: found } : s;
}

/** True for a where-word, an area word or a near-me word: never a dish. */
function isPlaceWord(w: string): boolean {
  if (WHERE_WORDS.includes(w) || AREA_WORDS.some((a) => w.startsWith(a))) return true;
  const q = parseQuery(w);
  return q.kind === 'search' && q.nearMe;
}

/**
 * The AI's search with the dish read from the text when the AI named neither a dish nor a category
 * and did not say food ("iskendr yenimahaalle nerde"). Words of 5 letters or more outside
 * `skipWords` (the district / place / quarter words) are tried with `dishProfile` (one typo); a word
 * of 7 letters or more may also be two edits from a one-word dish name of 7 letters or more with
 * the same first letter. Other kinds pass through.
 */
export function settleDish<T extends Understanding>(
  u: T,
  text: string,
  skipWords: readonly string[],
): T {
  if (u.kind !== 'search' || u.dish || u.cat || u.food === true) return u;
  const skipped = new Set(skipWords.map((w) => key(w)));
  const words = text
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  for (const word of words) {
    const w = key(word);
    if (w.length < 5 || stems(w).some((st) => skipped.has(st)) || isPlaceWord(w)) continue;
    let hit = dishProfile(w);
    // A typo keeps the first letter ("kalabalık" is not a typo of "alabalık").
    if (hit && fold(hit.dish)[0] !== w[0]) hit = null;
    if (!hit && w.length >= 7 && !FOOD_LEXICON.has(w)) {
      hit =
        DISHES.find((p) => {
          const n = key(p.dish);
          return n.length >= 7 && !p.dish.includes(' ') && n[0] === w[0] && edits(w, n) <= 2;
        }) ?? null;
    }
    if (hit) return { ...u, dish: hit.dish, cat: hit.cat, food: true };
  }
  return u;
}

/** Words of the text that name the settled district, place or a quarter: they are not the dish. */
function placeWords(
  r: Search,
  text: string,
  districts: readonly string[],
  quarters: readonly Quarter[],
): string[] {
  const placeKeys = new Set([r.district, r.place].flatMap((v) => (v ? fold(v).split(' ') : [])));
  const q = quarterInText(text, quarters);
  if (q)
    fold(q.n)
      .split(' ')
      .forEach((k) => placeKeys.add(k));
  return text
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .filter(
      (w) =>
        stems(key(w)).some((st) => placeKeys.has(st)) ||
        (r.district && matchDistrict(w, [r.district]) === r.district) ||
        matchDistrict(w, districts, { typos: 'located' }) !== null,
    );
}
