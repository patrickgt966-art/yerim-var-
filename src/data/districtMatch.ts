import type { Quarter } from './quarters';
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
 * Çubuk, "serin" Serik, "tuzlu" Tuzla).
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
    const next = words[k + 1] ? key(words[k + 1]!) : '';
    const placed = AREA_WORDS.some((a) => next.startsWith(a));
    const hit = matchDistrict(word, districts, { typos: 'located', placed });
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

/**
 * The AI's search with its district settled against the city's own list, the way the app reads
 * it: a district typed wrong or without Turkish letters becomes the city's spelling; a name that
 * is not a district (a quarter such as Karaköy or Kızılay) moves to `place`; a district the AI
 * wrote into place moves to `district`. With neither a district nor a place, a district named in
 * the text (exactly) is used, unless the AI read that word as the dish (İzmir's Menemen). A place
 * the AI named is never overridden by another word of the sentence ("Karşıyaka'dan geçiyorum,
 * Alsancak'ta balık"). A well-known quarter of the city (`quarters`) written bare in the text
 * ("lara balık") is the place when the AI named none. Other kinds pass through.
 */
export function settleDistrict<T extends Understanding>(
  u: T,
  text: string,
  districts: readonly string[],
  quarters: readonly Quarter[] = [],
): T {
  if (u.kind !== 'search') return u;
  return settled(u as Search, text, districts, quarters) as T;
}

function settled(
  s: Search,
  text: string,
  districts: readonly string[],
  quarters: readonly Quarter[],
): Search {
  if (s.district) {
    const hit = matchDistrict(s.district, districts);
    if (hit) return { ...s, district: hit };
    return { ...s, district: null, place: s.place ?? s.district };
  }
  // A district written into place ("Bornova").
  const asPlace = s.place ? matchDistrict(s.place, districts) : null;
  if (asPlace) return { ...s, district: asPlace, place: null };
  // appleQuery often repeats the district, so it does not count.
  const skip = [s.dish, ...(s.dishServes ?? [])].filter((v): v is string => !!v);
  // A quarter the AI missed ("lara balık" read as near me). Not when it asked which place was meant.
  if (!s.place && s.clarify?.ask !== 'place') {
    const q = quarterInText(text, quarters, skip);
    if (q) return { ...s, place: q.n, nearMe: false };
  }
  if (s.nearMe || s.place) return s;
  const found = districtInText(text, districts, skip);
  return found ? { ...s, district: found } : s;
}
