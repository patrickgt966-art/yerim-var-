import { fold } from './search';

/**
 * Name lookups for a restaurant the user typed: question words and generic nouns around the name
 * are dropped, and a typed name with a slip ("parga balıık") still finds the place it starts like.
 * Words are folded (see search.ts).
 */

/** Words that ask where a place is; never part of a name. */
const ASK_WORDS = new Set(['nerede', 'nerde', 'neresi', 'where']);
/** Generic nouns for a place: a name may carry them or not ("Özlem" / "Özlem Restoran"). */
const GENERIC_WORDS = new Set([
  'restoran',
  'restorani',
  'restorant',
  'restaurant',
  'lokanta',
  'lokantasi',
]);

/** The folded words of a message without the question words. */
export function nameWordsOf(folded: string): string[] {
  return folded.split(' ').filter((w) => w && !ASK_WORDS.has(w));
}

/** The folded words of a message without the question words and the generic nouns. */
export function bareNameWordsOf(folded: string): string[] {
  return nameWordsOf(folded).filter((w) => !GENERIC_WORDS.has(w));
}

/** A doubled letter counts once: "baliik" -> "balik", "mamullerri" -> "mamuleri". */
const collapse = (w: string): string => w.replace(/(.)\1+/g, '$1');

/** Edits (insert, delete, replace, swap of neighbours) between two short words. */
export function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = v;
    }
  }
  return rows[a.length]![b.length]!;
}

/** How many edits a typed word of this length may be off: none under 4 letters, 1 up to 7, 2 from 8. */
const slipsAllowed = (len: number): number => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** True when the typed word is the name word, or its start (the last typed word may be cut short), within the slips. */
function wordMatches(typed: string, nameWord: string, last: boolean): boolean {
  const a = collapse(typed);
  const b = collapse(nameWord);
  const slips = slipsAllowed(a.length);
  if (editDistance(a, b) <= slips) return true;
  return last && b.length > a.length && editDistance(a, b.slice(0, a.length)) <= slips;
}

/**
 * True when the folded name starts with the typed words, each within a few typing slips. The
 * first word must be the start of the name's first word exactly: a slip in the very first letters
 * is not repaired, so a random text does not turn into a place.
 */
export function fuzzyNameStart(foldedName: string, typed: string[]): boolean {
  const name = foldedName.split(' ').filter(Boolean);
  if (typed.length < 2 || name.length < typed.length) return false;
  if (typed[0]!.length < 3 || !name[0]!.startsWith(typed[0]!)) return false;
  return typed.every((w, i) => wordMatches(w, name[i]!, i === typed.length - 1));
}

/** The typed name for a message, as shown: the question words dropped, each word in capitals. */
export function displayName(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((w) => w && !ASK_WORDS.has(fold(w)))
    .map((w) => w.replace(/ø/g, 'ö').replace(/Ø/g, 'Ö'))
    .map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1).toLocaleLowerCase('tr'))
    .join(' ');
}
