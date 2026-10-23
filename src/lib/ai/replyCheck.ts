// The check for the AI's wording of a reply (/reply). The facts are ours; the model only writes
// words around them, so this keeps out everything the facts do not say: a name, a number, a price,
// a rating, parking talk when there is no parking data. A text that fails is dropped and the app's
// own template is shown instead. Pure: no app state.
import { FAR_WALK_MIN, fold, type AiReplyFacts, type AiReplyKind } from './protocol';

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
/** "ücretli" / "paid": only a yes/no on the fee, no amount; fine when a fact says the car park is paid. */
const PAID_WORDS = /(^| )(ucretli|paid)( |$)/;
const RATING_WORDS =
  /(^| )(puan|yildiz|yorum|degerlendirme)|(^| )(star|stars|rating|ratings|rated|review|reviews)( |$)/;
const FREE_WORDS = /(^| )(ucretsiz|free|bedava)( |$)/;
/** Words that call a place near ("en yakın", "yakında", "hemen yanında", "nearby", "closest"). */
const NEAR_WORDS =
  /(^| )(yakin|hemen yan|yurume mesafe|nearby|nearest|closest|close by|close to|next to|walking distance)/;
/** Folded wordings that say a car park has room: "boş yeri olan", "boş yer var", "müsait", "boş yer sayıları". */
const ROOM_WORDS =
  /(^| )(bos yer|bos alan|bos kontenjan|musait|(park|otopark|arac) yer\w* var)|(^| )(free|empty|vacant|available|open) (spot|space|parking spot|parking space)s?( |$)|(^| )(spots|spaces|room) (left|available|free)( |$)/;
/**
 * A clause that says the room is not known ("boş yer bilgisi elimde yok", "elimde olmadığı için",
 * "göremiyorum"): not a room claim. Any negated verb form counts (-mı/-mi/-mu/-mü + yor, -ma/-me +
 * dık/dı/yan/z), as does an English negation.
 */
export const NOT_KNOWN =
  /(^| )(bilgi\w*( \w+){0,2} (yok|mevcut degil)|su an yok|elimde yok|bilgim yok|(ol|\w{3,})(m[iu]yor|m[ae]di|m[ae]yan|m[ae]z( |$))|(not|no|cannot|unable|without|unknown|(don|doesn|isn|aren|can|couldn|didn) t|dont|do not|does not|did not)( |$))/;
/** The clause says the place is far, so a near word in it is not a near claim. */
const FAR_WORDS = /(^| )(uzak|far|farther|further)/;
/** "en yakını", "nearest": a superlative that is true of a far place too ("en yakını bile 36 dk"). */
const NEAREST_WORDS = /(^| )(en yakin\w*|nearest|closest)(?= |$)/g;
/** A sentence that says nothing was found: it contradicts the cards shown with it ("uygun bir aday bulamadık"). */
const NOT_FOUND =
  /(^| )(bulamad|bulunamad|aday (yok|bulun)|uygun (bir )?(yer|aday|sonuc) (yok|bulun)|(could not|couldn t|did not|didn t) find|no (match|matches|results?|candidates?)( |$)|nothing (found|matches))/;
/** A sentence that sends the user to the cards or the app for menus: the cards carry no menus. */
const MENU_ON_CARDS = /(^| )menu/;
const CARD_WORDS = /(^| )(kart|card|uygulama|app)/;
/**
 * Names of car park operators and owners (folded words): the model knows them, they are no
 * invented place. Allowed with parking facts only; a number or a place still must be a fact.
 */
const OPERATOR_WORDS = ['ispark', 'izelman', 'burpark', 'belediye', 'belediyesi', 'buyuksehir'];
const URL_PATTERN = /https?:|www\.|:\/\/|@|#|\.(com|net|org|app|io|tr)\b/i;

type Options = {
  /** The turn's kind: a greeting may ask "parking or food?" with no parking data. */
  kind?: AiReplyKind;
  /** Names that need no fact: the city and its districts. */
  allow?: string[];
  /** What the user wrote: a price or budget word of their own may be echoed back. */
  userText?: string;
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

/** True when the facts carry a live free-space count for a listed car park. */
function hasLiveCounts(facts: AiReplyFacts): boolean {
  return (facts.items ?? []).some((i) => typeof i.freeSpots === 'number');
}

/**
 * The reason when a sentence of the wording claims room in car parks the facts have no live count
 * for ("boş yeri olan 22 otopark buldum"), says nothing was found while results are shown, or says
 * the cards show menus (they do not); null otherwise. A sentence that says the count is not known
 * is fine.
 */
function overclaims(
  clean: string,
  facts: AiReplyFacts,
  allow: string[],
  kind: AiReplyKind | undefined,
): string | null {
  const live = hasLiveCounts(facts);
  // Results are shown with the wording: it never says nothing was found.
  const shown = kind !== 'none_found' && (facts.count ?? 0) > 0;
  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    const f = withoutFactStrings(fold(sentence), facts, allow);
    const padded = ` ${f} `;
    if (MENU_ON_CARDS.test(padded) && CARD_WORDS.test(padded)) return 'menu-on-cards';
    if (!live) {
      // A room phrase is excused by a negated verb in its own clause.
      for (const clause of sentence.split(/[,;:–—]/)) {
        const c = ` ${withoutFactStrings(fold(clause), facts, allow)} `;
        if (ROOM_WORDS.test(c) && !NOT_KNOWN.test(c)) return 'room-without-live-count';
      }
    }
    if (shown && NOT_FOUND.test(padded)) return 'not-found-with-results';
  }
  return null;
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
  if (typeof facts.farWalkMin === 'number') out.add(facts.farWalkMin);
  // "ilk üç otopark": how many results are listed is a fact too.
  if ((facts.items ?? []).length > 0) out.add(facts.items!.length);
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

/** Folded price / budget stems; the user's own ones may be echoed back (see priceViolation). */
const PRICE_STEMS = ['ucuz', 'fiyat', 'budget', 'cheap', 'price', 'ucret'];
/** The sentence repeats what the user asked for ("ucuz derken", "ucuz bir yer arıyorsun") or asks. */
export const ECHO_CUES =
  /(derken|dediginde|istedig|aradig|diledig|ariyor|istiyor|bakiyor|olsun|mean|looking|want)/;

/** The sentences of a text, split after . ! ? and the ellipsis mark. */
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?…])\s+/);

/**
 * True when a sentence calls a place near while the first result is far. "En yakını bile 36 dk"
 * (the superlative with the far walk stated) or any sentence that also says it is far is honest;
 * a bare "en yakını X", "yakında", "hemen yanında", "yürüme mesafesinde" are not.
 */
function nearClaim(clean: string, facts: AiReplyFacts, allow: string[]): boolean {
  const known = new Set<number>();
  if (typeof facts.farWalkMin === 'number') known.add(facts.farWalkMin);
  for (const i of facts.items ?? []) {
    for (const n of [i.walkMin, i.parkWalkMin]) if (typeof n === 'number') known.add(n);
  }
  for (const sentence of sentencesOf(clean)) {
    const f = ` ${withoutFactStrings(fold(sentence), facts, allow)} `;
    if (FAR_WORDS.test(f)) continue;
    const walks = [...f.matchAll(/(\d+) ?(?:dk|dakika|min|minutes)/g)].map((m) => Number(m[1]));
    // A superlative is honest whatever the number, as long as the sentence states a walk of the facts.
    const statesWalk = walks.some((m) => m > FAR_WALK_MIN || known.has(m));
    if (NEAR_WORDS.test(statesWalk ? f.replace(NEAREST_WORDS, ' ') : f)) return true;
  }
  return false;
}

/**
 * True when a sentence of the wording has a price word the facts and the user's message do not
 * excuse. A price or budget word the user wrote may be echoed in a question or a restatement of the
 * wish ("Ucuz derken aklında hangisi var?"), but never with a number or a shown place ("X ucuz").
 * "ücret" is fine when the sentence sends the user to cards that carry the fee (a fact says paid /
 * free) and names no place.
 */
function priceViolation(
  clean: string,
  facts: AiReplyFacts,
  allow: string[],
  userText: string | undefined,
): boolean {
  const items = facts.items ?? [];
  const paidKnown = items.some((i) => i.free === false);
  const feeOnCards = items.some((i) => i.free !== undefined);
  const mine = fold(userText ?? '');
  const own = PRICE_STEMS.filter((st) => mine.includes(st));
  for (const sentence of sentencesOf(clean)) {
    const raw = fold(sentence);
    const rest = ` ${withoutFactStrings(raw, facts, allow)} `.replace(/ feel free /g, ' ');
    let p = paidKnown ? rest.replace(PAID_WORDS, ' ') : rest;
    if (!PRICE_WORDS.test(p)) continue;
    const namesPlace = items.some((i) => ` ${raw} `.includes(` ${fold(i.name)} `));
    const claim = namesPlace || /\d/.test(raw);
    if (!claim) {
      const pointsToCards =
        CARD_WORDS.test(rest) && /(gor|bak|incele|goster|see|check|look|show)/.test(rest);
      const asks = /[?]\s*$/.test(sentence.trim()) || ECHO_CUES.test(raw);
      const words = p.split(' ').filter((w) => {
        if (own.some((st) => w.startsWith(st)) && asks) return false;
        // The fee is on the cards: pointing the user there states no amount.
        if (w.startsWith('ucret') && feeOnCards && pointsToCards) return false;
        return true;
      });
      p = words.join(' ');
    }
    if (PRICE_WORDS.test(p)) return true;
  }
  return false;
}

/**
 * The AI's wording of a reply, or null when it must not be shown: more than two sentences or 260
 * characters, a link, a number the facts do not carry (Turkish and English number words count), a
 * capitalised name that is not one of the fact names (or an allowed city / district name, or
 * "Yerim"; the word that opens a sentence is free), a price or rating word, "free" without a free
 * fact, parking talk when the facts hold no parking data, room in car parks without a live free
 * count (unless the sentence says it is not known), cards that show menus, "not found" next to
 * shown results, or a near-word ("yakında", "nearby")
 * when a result is more than FAR_WALK_MIN minutes away. Returned trimmed, on one line.
 */
export function validateReply(
  text: string | null | undefined,
  facts: AiReplyFacts,
  options: Options = {},
): string | null {
  return validateReplyReason(text, facts, options).text;
}

/** validateReply's verdict with the reason a text was dropped (the eval reports these). */
export type ReplyVerdict = { text: string; reason: null } | { text: null; reason: string };

/** Same check as validateReply, but says why a text was dropped. */
export function validateReplyReason(
  text: string | null | undefined,
  facts: AiReplyFacts,
  options: Options = {},
): ReplyVerdict {
  const no = (reason: string): ReplyVerdict => ({ text: null, reason });
  if (typeof text !== 'string') return no('no-text');
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return no('empty');
  if (clean.length > MAX_REPLY_TEXT_CHARS) return no('too-long');
  if (sentenceCount(clean) > MAX_REPLY_SENTENCES) return no('too-many-sentences');
  if (URL_PATTERN.test(clean) || /[₺$€]/.test(clean)) return no('link-or-currency');

  const allow = options.allow ?? [];
  // What is left after the fact names are taken out is checked for numbers and forbidden words.
  const rest = withoutFactStrings(fold(clean), facts, allow);

  const over = overclaims(clean, facts, allow, options.kind);
  if (over) return no(over);

  const known = factNumbers(facts);
  for (const n of digitsIn(rest)) if (!known.has(n)) return no('number-not-in-facts');
  const words = rest.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const sure = NUMBER_WORDS[w];
    if (sure !== undefined && !known.has(sure)) return no('number-word-not-in-facts');
    const maybe = AMBIGUOUS_NUMBERS[w];
    if (maybe !== undefined && UNIT_START.test(words[i + 1] ?? '') && !known.has(maybe)) {
      return no('number-word-not-in-facts');
    }
  }

  const padded = ` ${rest} `.replace(/ feel free /g, ' ');
  // A car park the facts call paid (`free: false`) may be called "ücretli": a yes/no, not an amount.
  if (priceViolation(clean, facts, allow, options.userText)) return no('price-word');
  if (RATING_WORDS.test(padded)) return no('rating-word');
  const freeKnown = facts.freeOnly === true || (facts.items ?? []).some((i) => i.free === true);
  if (!freeKnown && FREE_WORDS.test(padded)) return no('free-without-fact');
  // A far result is never called near: the walk of a shown item (or the far flag) says it is not.
  const far =
    facts.far === true || (facts.items ?? []).some((i) => (i.walkMin ?? 0) > FAR_WALK_MIN);
  if (far && nearClaim(clean, facts, allow)) return no('near-word-for-far');
  if (options.kind !== 'greeting' && !hasParkingFacts(facts) && PARKING_WORDS.test(padded)) {
    return no('parking-without-data');
  }

  // A capitalised run must be (part of) a fact name, an allowed name or "Yerim".
  const names = factStrings(facts);
  const allowed = new Set(
    [...allow, 'Yerim', 'Yerim Var', ...(hasParkingFacts(facts) ? OPERATOR_WORDS : [])].map((n) =>
      fold(n),
    ),
  );
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
    return no('unknown-name');
  }
  return { text: clean, reason: null };
}
