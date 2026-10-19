// The check for the AI's wording of a reply (/reply). The facts are ours; the model only writes
// words around them, so this keeps out everything the facts do not say: a name, a number, a price,
// a rating, parking talk when there is no parking data. A text that fails is dropped and the app's
// own template is shown instead. Pure: no app state.
import { fold, type AiReplyFacts, type AiReplyKind } from './protocol';

export const MAX_REPLY_SENTENCES = 2;
export const MAX_REPLY_TEXT_CHARS = 260;

/** Words that are a number only when a unit follows ("bir yer", "on the way" are not numbers). */
const AMBIGUOUS_NUMBERS: Record<string, number> = { bir: 1, on: 10, one: 1 };
/** Number words (folded) for 2-10; 1 and 10 are in AMBIGUOUS_NUMBERS as "bir" / "on" / "one". */
const NUMBER_WORDS: Record<string, number> = {
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
/** Folded word starts that make "bir" / "on" / "one" a quantity (minutes, free spots). */
const UNIT_START = /^(dakika|dk|min|bos)/;

const PARKING_WORDS = /(^| )(otopark|park|parking|garaj|garage|vale|valet)/;
const PRICE_WORDS =
  /(^| )tl( |$)|(^| )(fiyat|lira|ucuz|pahali|indirim|kampanya|price|priced|pricey|cheap|expensive|euro|dolar|dollar|discount|budget|cost|ucret(?!siz))/;
const RATING_WORDS =
  /(^| )(puan|yildiz|yorum|degerlendirme)|(^| )(star|stars|rating|ratings|rated|review|reviews)( |$)/;
const FREE_WORDS = /(^| )(ucretsiz|free|bedava)( |$)/;
const URL_PATTERN = /https?:|www\.|:\/\/|@|#|\.(com|net|org|app|io|tr)\b/i;

type Options = {
  /** The turn's kind: a greeting may ask "parking or food?" with no parking data. */
  kind?: AiReplyKind;
  /** Names that need no fact: the city and its districts. */
  allow?: string[];
};

/** Sentences by their end marks (emoji do not count); a trailing fragment counts as one. */
function sentenceCount(text: string): number {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .split(/[.!?…]+(?:\s+|$)/)
    .filter((s) => s.trim() !== '').length;
}

/** Every digit run of the text, as numbers. */
function digitsIn(s: string): number[] {
  return [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** The names and labels the facts carry. */
function factStrings(facts: AiReplyFacts): string[] {
  return [
    facts.where,
    facts.what,
    ...(facts.items ?? []).map((i) => i.name),
    ...(facts.choices ?? []),
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function factNumbers(facts: AiReplyFacts): Set<number> {
  const out = new Set<number>();
  if (typeof facts.count === 'number') out.add(facts.count);
  for (const i of facts.items ?? []) {
    for (const n of [i.walkMin, i.parkWalkMin, i.freeSpots]) if (typeof n === 'number') out.add(n);
  }
  // A number inside a name or label ("Sokak 2") is the name's own.
  for (const s of factStrings(facts)) for (const n of digitsIn(s)) out.add(n);
  return out;
}

/** True when the facts say anything about car parks. */
function hasParkingFacts(facts: AiReplyFacts): boolean {
  return (
    facts.parkSearch === true ||
    facts.requireParking === true ||
    facts.freeOnly === true ||
    (facts.items ?? []).some(
      (i) => i.parkWalkMin !== undefined || i.freeSpots !== undefined || i.free !== undefined,
    )
  );
}

/** The folded text without any fact string in it, so a place called "Yıldız Pide" is no rating. */
function withoutFactStrings(folded: string, facts: AiReplyFacts, allow: string[]): string {
  let rest = ` ${folded} `;
  const names = [...factStrings(facts), ...allow]
    .map((n) => fold(n))
    .filter((n) => n !== '')
    .sort((a, b) => b.length - a.length);
  for (const n of names) rest = rest.split(` ${n} `).join('  ');
  return rest.replace(/\s+/g, ' ').trim();
}

type Run = { words: string[]; opensSentence: boolean };

/** Runs of capitalised words (two letters or more), each with whether it opens a sentence. */
function capitalRuns(text: string): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  let atStart = true;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    // The word without punctuation and without a Turkish suffix after the apostrophe.
    const word = token
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .split(/['’]/)[0]!
      .replace(/[^\p{L}\p{N}]+$/u, '');
    if (/^\p{Lu}\p{L}+/u.test(word)) {
      if (current) current.words.push(word);
      else {
        current = { words: [word], opensSentence: atStart };
        runs.push(current);
      }
    } else {
      current = null;
    }
    if (/[.!?…][)"”’']*$/.test(token)) {
      current = null;
      atStart = true;
    } else {
      atStart = false;
      if (/[,;:]$/.test(token)) current = null;
    }
  }
  return runs;
}

/** True when the folded words are a stretch of the name's words (a word may carry a suffix). */
function insideName(words: string[], name: string): boolean {
  const foldedName = fold(name);
  const nameWords = foldedName.split(' ').filter(Boolean);
  if (nameWords.length === 0 || words.length === 0) return false;
  if (foldedName.includes(words.join(' '))) return true;
  for (let i = 0; i + words.length <= nameWords.length; i++) {
    if (words.every((w, k) => nameWords[i + k]!.startsWith(w) || w.startsWith(nameWords[i + k]!))) {
      return true;
    }
  }
  return false;
}

/**
 * The AI's wording of a reply, or null when it must not be shown: more than two sentences or 260
 * characters, a link, a number the facts do not carry (Turkish and English number words count), a
 * capitalised name that is not one of the fact names (or an allowed city / district name, or
 * "Yerim"; the word that opens a sentence is free), a price or rating word, "free" without a free
 * fact, or parking talk when the facts hold no parking data. Returned trimmed, on one line.
 */
export function validateReply(
  text: string | null | undefined,
  facts: AiReplyFacts,
  options: Options = {},
): string | null {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '' || clean.length > MAX_REPLY_TEXT_CHARS) return null;
  if (sentenceCount(clean) > MAX_REPLY_SENTENCES) return null;
  if (URL_PATTERN.test(clean) || /[₺$€]/.test(clean)) return null;

  const allow = options.allow ?? [];
  // What is left after the fact names are taken out is checked for numbers and forbidden words.
  const rest = withoutFactStrings(fold(clean), facts, allow);

  const known = factNumbers(facts);
  for (const n of digitsIn(rest)) if (!known.has(n)) return null;
  const words = rest.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const sure = NUMBER_WORDS[w];
    if (sure !== undefined && !known.has(sure)) return null;
    const maybe = AMBIGUOUS_NUMBERS[w];
    if (maybe !== undefined && UNIT_START.test(words[i + 1] ?? '') && !known.has(maybe)) {
      return null;
    }
  }

  const padded = ` ${rest} `.replace(/ feel free /g, ' ');
  if (PRICE_WORDS.test(padded) || RATING_WORDS.test(padded)) return null;
  const freeKnown = facts.freeOnly === true || (facts.items ?? []).some((i) => i.free === true);
  if (!freeKnown && FREE_WORDS.test(padded)) return null;
  if (options.kind !== 'greeting' && !hasParkingFacts(facts) && PARKING_WORDS.test(padded)) {
    return null;
  }

  // A capitalised run must be (part of) a fact name, an allowed name or "Yerim".
  const names = factStrings(facts);
  const allowed = new Set([...allow, 'Yerim', 'Yerim Var'].map((n) => fold(n)));
  const passes = (run: string[]) => {
    const f = run.map((w) => fold(w)).filter(Boolean);
    if (f.length === 0) return true;
    if (allowed.has(f.join(' ')) || f.every((w) => allowed.has(w))) return true;
    return names.some((n) => insideName(f, n));
  };
  for (const run of capitalRuns(clean)) {
    if (passes(run.words)) continue;
    // The word that opens a sentence is capitalised anyway; the rest of the run must still pass.
    if (run.opensSentence && run.words.length === 1) continue;
    if (run.opensSentence && passes(run.words.slice(1))) continue;
    return null;
  }
  return clean;
}
