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
export function matchDistrict(word: string, districts: readonly string[]): string | null {
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
      continue;
    }
    for (const s of stems(w)) {
      if (s === n) return name;
      if (s.length < 5 || s[0] !== n[0]) continue;
      const cost = edits(s, n);
      if (cost <= (n.length >= 8 ? 2 : 1) && (!best || cost < best.cost)) best = { name, cost };
    }
  }
  return best?.name ?? null;
}

/** The first word of the text (outside `skip`) that names a district, or null. */
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
  for (const word of words) {
    if (skipped.has(key(word))) continue;
    const hit = matchDistrict(word, districts);
    if (hit) return hit;
  }
  return null;
}

/**
 * The AI's search with its district settled against the city's own list, the way the app reads
 * it: a district typed wrong or without Turkish letters becomes the city's spelling; a name that
 * is not a district (a quarter such as Karaköy or Kızılay) moves to `place`; with no district, one
 * named in the text is used, unless the AI read that word as the dish or a place (İzmir's
 * Menemen is also a dish), or one the AI wrote into place. Other kinds pass through.
 */
export function settleDistrict<T extends Understanding>(
  u: T,
  text: string,
  districts: readonly string[],
): T {
  if (u.kind !== 'search') return u;
  return settled(u as Search, text, districts) as T;
}

function settled(s: Search, text: string, districts: readonly string[]): Search {
  if (s.district) {
    const hit = matchDistrict(s.district, districts);
    if (hit) return { ...s, district: hit };
    return { ...s, district: null, place: s.place ?? s.district };
  }
  // A district written into place ("Bornova").
  const asPlace = s.place ? matchDistrict(s.place, districts) : null;
  if (asPlace) return { ...s, district: asPlace, place: null };
  if (s.nearMe) return s;
  // A business name ("Konak Pide") keeps its words; appleQuery often repeats the district, so it does not count.
  const skip = [s.dish, s.place, ...(s.dishServes ?? [])].filter((v): v is string => !!v);
  const found = districtInText(text, districts, skip);
  return found ? { ...s, district: found } : s;
}
