// Scoring of the conversation eval (scripts/ai-eval-convo.ts). Pure: it reads what the user saw
// after each turn (ObservedTurn, filled by convoRun.ts) and the turn's expectation (convoCases.ts),
// and scores four checks separately:
//   1. understanding: kind, category, dish, goal, district, parking, and whether results came;
//   2. choices: the chips and the question Yerim asked;
//   3. reply text: the shown text is clean, and every wording the app accepted from the AI
//      (validateReply) is at most two sentences, free of "undefined" / "{{", and not the same text
//      as another case's;
//   4. honesty: no price, rating or menu claim, and the honest "no data" note when required.
// A case passes when every check of every turn passes. How often validateReply accepts the AI's
// wording is a rate that is reported, not a check: a rejected text falls back to the template.
import { KINDS, memberLabel } from '../choices';
import { replyLeaks } from './aiScore';
import { CONVO_CATEGORIES, HEPSI } from './convoCases';
import type { ConvoCase, ConvoCategory, ConvoTurn, TurnExpect } from './convoCases';
import { fold, type AiReplyKind, type Understanding } from '@/lib/ai/protocol';
import { ECHO_CUES, NOT_KNOWN } from '@/lib/ai/replyCheck';
import { walkMinFromMeters } from '@/lib/ai/verify';

export type ObservedCard = {
  kind: 'restaurant' | 'parking';
  name: string;
  /** Metres to the nearest car park (restaurant cards), null when none. */
  parkingM: number | null;
  /** Metres from the search point to the place. */
  distanceM: number;
  /** A restaurant card that shows its car park (the ask included parking). */
  parkAsked?: boolean;
};
export type ObservedAction = { kind: 'say' | 'refine' | 'open' | 'pick'; label: string };

/** One /reply wording the assistant asked the AI for in a turn. */
export type ObservedWording = {
  kind: AiReplyKind;
  /** What the model wrote; null when the call failed. */
  raw: string | null;
  /** validateReply's verdict on it: the text the app would show, or null (the template is shown). */
  accepted: string | null;
  /** Why validateReply dropped a text the model wrote; null when accepted or the call failed. */
  rejectReason: string | null;
  /** The accepted text is in the reply the user saw (it came within the app's wait). */
  shown: boolean;
  /** The model answered after the app's REPLY_TIMEOUT_MS. */
  late: boolean;
  /** The facts held a live free-spot count. */
  hasFreeSpots: boolean;
};

/** Everything the eval keeps of one turn: what the user saw and what the AI layer did. */
export type ObservedTurn = {
  /** What the user typed, or the label of the chip they tapped. */
  input: string;
  /** A tap named a chip the last reply did not offer; the label was typed instead. */
  tapMissing: boolean;
  /** A "@n" tap found no kind chip to tap: the turn was not played (the turn before it failed). */
  skipped?: boolean;
  /** The tapped kind was not offered (the router picked other kinds): the first offered kind was tapped. */
  kindSwapped?: boolean;
  routerCalls: number;
  /** The router's reading, or null (no call, or it failed). */
  understood: Understanding | null;
  routerFailed: boolean;
  text: string;
  cards: ObservedCard[];
  actions: ObservedAction[];
  ctx: {
    place: string | null;
    cat: string | null;
    dish: string | null;
    requireParking: boolean;
    freeParking: boolean;
    ask: string | null;
    choice: { id: string; member: string } | null;
  };
  wordings: ObservedWording[];
  /** The map app was handed this destination in the turn (a "no" to the parking offer, a direct tap). */
  directions?: { name: string } | null;
  /** The restaurant the parking offer named, before the turn (what it answers) and after it (what it asks). */
  parkAsk?: { before: string | null; after: string | null };
  /** An AI call failed for a reason that is not the model's (rate limit, outage): the run is void. */
  infra: boolean;
  error?: string;
};

export type Check = { ok: boolean; na: boolean; misses: string[] };
export const CHECKS = ['understanding', 'choices', 'reply', 'honesty'] as const;
export type CheckName = (typeof CHECKS)[number];
export type TurnScore = Record<CheckName, Check> & { ok: boolean };

const notApplicable = (): Check => ({ ok: true, na: true, misses: [] });
const result = (misses: string[]): Check => ({ ok: misses.length === 0, na: false, misses });

/** True when a folded word of `text` starts with folded `w`. */
function hasWordStart(text: string, w: string): boolean {
  const want = fold(w);
  return want.length > 0 && ` ${fold(text)}`.includes(` ${want}`);
}

/** Sentences by their end marks (emoji do not count); a trailing fragment counts as one. */
export function sentenceCount(text: string): number {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .split(/[.!?…]+(?:\s+|$)/)
    .filter((s) => s.trim() !== '').length;
}

/** A leftover of a broken template or of code. */
const BROKEN = /undefined|\{\{|\}\}|\[object|\bNaN\b|\bnull\b/i;
/** The honest "we have no data" note of the app (chat.noInfo*, chat.choice.note.*), folded. */
const NOTE = /(bilgimiz|verimiz) yok|bilgimiz bulunmuyor/;
/** A sentence that says we lack the data is honest, whatever word it names. */
const LACKS = /(^| )(yok|bilgimiz|verimiz|bilmiyoruz|bilmiyorum|elimizde)( |$)/;
const PRICE =
  /\d ?(tl|lira)( |$)|(^| )(fiyat|ucuz|pahali|ucret(?!siz)|butce|indirim|kampanya|ekonomik|uygun fiyat)/;
const RATING =
  /(^| )(puan|yildiz|yorum|degerlendirme)|(^| )(rating|ratings|review|reviews|star|stars)( |$)/;
const MENU = /(^| )(menu|menusu|menuler|porsiyon)/;
/**
 * A hedged sentence about menus ("büyük ihtimalle menüde var", "menüleri kontrol etmekte fayda
 * var", "adlarından anlaşılıyor") says the menu is not known: it claims no menu data. A positive
 * one ("menüsünde köfte var") still does.
 */
const MENU_HEDGE = /(buyuk ihtimalle|olabilir|kontrol et|emin degil|adlarindan)/;
/**
 * The AI says there is room in a car park: only a live free-spot count may say so. "yer var" is a
 * claim only right after car park words ("otoparkta 5 yer var"); "baklava için 18 yer var" counts
 * places, not spots.
 */
const ROOM =
  /(^| )(bos (yer|alan|kontenjan)|musait|park yeri var|(otopark\w*|garaj|park)( \w+){0,2} (yer|alan) var)/;

/**
 * The claims of a text: price, rating and menu, outside sentences that say the data is missing. A
 * place called "Yıldız Pide" or "Ucuz Lokanta" is a name, not a claim: `names` are taken out first.
 */
export function claimsIn(text: string, names: readonly string[] = [], userText = ''): string[] {
  const out: string[] = [];
  const own = names.map((n) => fold(n)).filter((n) => n !== '');
  // A question that repeats the user's own word "menü" ("Fit menüde hangi tarzı arıyorsun?") asks
  // for a kind; it claims nothing about a menu.
  const userMenu = MENU.test(` ${fold(userText)}`);
  const userPrice = PRICE.test(` ${fold(userText)}`);
  for (const part of text.match(/[^.!?\n;]+[.!?\n;]*/g) ?? []) {
    const sentence = part.replace(/[.!?\n;]+$/, '');
    let f = ` ${fold(sentence)} `;
    for (const n of own) f = f.split(` ${n} `).join('  ');
    f = f.replace(/\s+/g, ' ').trim();
    if (f === '' || LACKS.test(f)) continue;
    // The user's own price word, asked back or restated ("Ucuz derken aklında hangisi var?"), is no claim.
    const echoed = userPrice && (part.includes('?') || ECHO_CUES.test(f));
    if (PRICE.test(f) && !echoed) out.push(`price: "${sentence.trim()}"`);
    if (RATING.test(f)) out.push(`rating: "${sentence.trim()}"`);
    if (MENU.test(f) && !MENU_HEDGE.test(f) && !(userMenu && part.includes('?'))) {
      out.push(`menu: "${sentence.trim()}"`);
    }
  }
  return out;
}

/** A walk longer than this is not near, and a list that starts there must say it is far. */
export const FAR_WALK_MIN = 20;
/** A place called near: "en yakın", "yakında", "hemen yanında", "nearby", "closest" (folded). */
const NEAR = /(^| )(en yakin|yakinda( |$)|hemen yaninda|nearby|closest|nearest|close by)/;
/** What tells the user the results are far or the search was widened (folded). */
const FAR = /(genis|uzak|az yer var|wider|far away|farther|\bkm\b)/;

/** "~48 dk yürüme", "20 minutes": the minutes a sentence names. */
const minutesIn = (folded: string): number[] =>
  [...folded.matchAll(/(\d+) ?(?:dk|dakika|min|minutes)/g)].map((m) => Number(m[1]));

/** Walk time of a card, as the app shows and tells it. */
export const cardWalkMin = (c: ObservedCard): number => walkMinFromMeters(c.distanceM);

/**
 * True when the folded sentence names a card that is over FAR_WALK_MIN minutes away. A card whose
 * name is only part of another named card's name ("Burger King" inside "Burger King - Demetevler")
 * is not named by the sentence; and among cards with one name, the walk the sentence states says
 * which of them it means.
 */
function namesFarCard(folded: string, cards: readonly ObservedCard[], mins: readonly number[]) {
  const padded = ` ${folded} `;
  const named = cards
    .map((c) => ({ c, n: fold(c.name) }))
    .filter(({ n }) => n !== '' && padded.includes(` ${n} `));
  const whole = named.filter(
    ({ n }) => !named.some((o) => o.n !== n && ` ${o.n} `.includes(` ${n} `)),
  );
  return whole.some(({ c, n }) => {
    const same = whole.filter((o) => o.n === n).map((o) => o.c);
    const stated = same.filter((o) => mins.includes(cardWalkMin(o)));
    return (stated.length > 0 ? stated : same).some((o) => cardWalkMin(o) > FAR_WALK_MIN);
  });
}

/**
 * Honesty about distance: no sentence may call a place near ("en yakın", "yakında", "nearby") when
 * the walk it names (or the place it names, or the top card of the list) is over FAR_WALK_MIN
 * minutes, and when the top card is that far the message must say so (a widened search, "uzak",
 * a walk of more than FAR_WALK_MIN minutes stated). `byName`: a name search is exempt from the
 * far signal (the user asked for that place), not from the near claims.
 */
export function distanceClaims(
  text: string,
  cards: readonly ObservedCard[],
  byName = false,
): string[] {
  const out: string[] = [];
  const top = cards[0];
  const topMin = top ? cardWalkMin(top) : 0;
  // A place searched by its name is wanted wherever it is: its distance needs no warning.
  const topFar = !byName && topMin > FAR_WALK_MIN;
  let signal = false;
  for (const sentence of text.split(/[.!?\n;]+/)) {
    const f = ` ${fold(sentence)} `.replace(/\s+/g, ' ').trim();
    if (f === '') continue;
    const mins = minutesIn(f);
    const far = mins.some((m) => m > FAR_WALK_MIN);
    if (FAR.test(f) || (far && !NEAR.test(f))) signal = true;
    // A sentence that says it looked wider is the signal itself, however it words it.
    if (!NEAR.test(f) || FAR.test(f)) continue;
    const q = sentence.trim();
    if (far) out.push(`calls a ${Math.max(...mins)} min walk near: "${q}"`);
    else if (namesFarCard(f, cards, mins)) {
      out.push(`calls a place over ${FAR_WALK_MIN} min away near: "${q}"`);
    } else if (topFar && mins.length === 0) {
      out.push(`calls the list near, but its top place is ${topMin} min away: "${q}"`);
    }
  }
  if (topFar && !signal) out.push(`top place is ${topMin} min away and nothing says it is far`);
  return out;
}

/** Sentences in the whole message: every line, templates and notes included. */
export const messageSentences = (text: string): number =>
  text.split('\n').reduce((n, line) => n + sentenceCount(line), 0);

/** The text a wording is compared by: folded, so case, accents and punctuation do not hide a repeat. */
export const wordingKey = (text: string): string => fold(text);

/** A wording the AI gave, with the message of the user that produced it. */
export type WordingOf = { user: string; text: string };

/**
 * For each case, the wordings (folded) the AI gave an earlier case already for a different user
 * message: the same text for two different inputs is a template, not an answer. The same input
 * giving the same wording is no defect. The first case to use a text keeps it.
 */
export function repeatedWordings(perCase: readonly (readonly WordingOf[])[]): Set<string>[] {
  const seen = new Map<string, { index: number; user: string }[]>();
  return perCase.map((wordings, i) => {
    const repeats = new Set<string>();
    for (const w of wordings) {
      const key = wordingKey(w.text);
      const user = fold(w.user);
      const earlier = seen.get(key) ?? [];
      if (earlier.some((e) => e.index !== i && e.user !== user)) repeats.add(key);
      seen.set(key, [...earlier, { index: i, user }]);
    }
    return repeats;
  });
}

const memberLabels = new Set(Object.values(KINDS).map((m) => memberLabel(m, 'tr')));

/** The folded text without the names of the shown places and the searched place (a car park may be in a name). */
function withoutNames(text: string, cards: readonly ObservedCard[], place: string | null): string {
  let f = ` ${fold(text)} `;
  for (const n of [...cards.map((c) => c.name), place ?? '']) {
    const own = fold(n);
    if (own !== '') f = f.split(` ${own} `).join('  ');
  }
  return f.replace(/\s+/g, ' ').trim();
}

/** The parking offer after "Yol tarifi": the question, the car parks near the restaurant, the map app. */
function parkOffer(want: NonNullable<TurnExpect['parkAsk']>, obs: ObservedTurn): string[] {
  const m: string[] = [];
  const asked = obs.parkAsk ?? { before: null, after: null };
  if (want === 'question') {
    if (!asked.after) m.push('parking offer: Yerim did not ask the question');
    if (obs.directions) m.push('parking offer: the map opened before the user answered');
    if (obs.cards.length > 0) m.push('parking offer: the question comes with no cards');
  } else if (want === 'cars') {
    if (!asked.before) m.push('parking offer: no question was waiting for this answer');
    else if (!fold(obs.text).includes(fold(asked.before))) {
      m.push(`parking offer: the reply does not name the restaurant (${asked.before})`);
    }
    if (obs.directions) m.push('parking offer: the map opened for a yes');
    if (obs.cards.some((c) => c.kind !== 'parking')) m.push('parking offer: want car park cards');
    if (obs.ctx.place !== null && asked.before && fold(obs.ctx.place) !== fold(asked.before)) {
      m.push(`parking offer: car parks searched near ${obs.ctx.place}, not ${asked.before}`);
    }
  } else {
    if (!obs.directions) m.push('parking offer: the map did not open');
    else if (asked.before && fold(obs.directions.name) !== fold(asked.before)) {
      m.push(`parking offer: directions to ${obs.directions.name}, not ${asked.before}`);
    }
    if (asked.after) m.push('parking offer: asked the question again');
  }
  return m;
}

function understanding(turn: ConvoTurn, obs: ObservedTurn): Check {
  const e = turn.expect;
  const m: string[] = [];
  const u = obs.understood;
  const needsRouter = turn.input.type === 'say' || obs.routerCalls > 0 || obs.routerFailed;
  if (!u && needsRouter)
    m.push(obs.routerFailed ? 'router: no usable answer' : 'router: not asked');

  if (u) {
    if (e.kind === 'greeting') {
      if (u.kind !== 'chat') m.push(`kind: want chat (small talk), got ${u.kind}`);
    } else if (e.kind === 'offtopic' || e.kind === 'none') {
      if (u.kind === 'search') m.push('kind: want chat or unknown, got search');
    } else if (u.kind !== 'search') {
      m.push(`kind: want search (${e.kind}), got ${u.kind}`);
    }
  }
  if (u?.kind === 'search') {
    const food = u.food || u.cat !== null || !!u.dish;
    if ((e.kind === 'food' || e.kind === 'choice') && !food) m.push('food: want true, got false');
    if (e.kind === 'park' && food) m.push('food: want false (car park), got true');
    if (e.wishes && !e.wishes.some((w) => u.wishes?.includes(w))) {
      m.push(`wishes: want one of ${e.wishes.join('|')}, got ${u.wishes?.join(',') ?? '-'}`);
    }
    if (e.placeHas) {
      const all = [u.place, u.appleQuery, u.district].map((v) => v ?? '').join(' ');
      if (!e.placeHas.some((w) => hasWordStart(all, w))) {
        m.push(`place: want ${e.placeHas.join('|')}, got ${u.place} / ${u.appleQuery}`);
      }
    }
  }
  // The category and the dish: the router's reading, else what the app searched (a chip tap).
  if (e.cat && (u === null || u.kind === 'search')) {
    const got: string | null = u?.kind === 'search' ? u.cat : obs.ctx.cat;
    if (!(e.cat as (string | null)[]).includes(got)) {
      m.push(`cat: want ${e.cat.map((x) => x ?? 'none').join('|')}, got ${got ?? 'none'}`);
    }
  }
  if (e.dishHas && (u === null || u.kind === 'search')) {
    const dish = fold((u ? u.dish : obs.ctx.dish) ?? '');
    if (!(e.dishOptional && dish === '') && !e.dishHas.some((w) => dish.includes(fold(w)))) {
      m.push(`dish: want ${e.dishHas.join('|')}, got ${u ? u.dish : obs.ctx.dish}`);
    }
  }
  // What the user sees: where it searched, parking, results.
  if (e.place) {
    const label = fold(obs.ctx.place ?? '');
    if (!e.place.some((p) => label.includes(fold(p)))) {
      m.push(`place: want ${e.place.join('|')}, got ${obs.ctx.place ?? 'around the user'}`);
    }
  }
  if (e.nearMe === true && obs.ctx.place !== null)
    m.push(`place: want around the user, got ${obs.ctx.place}`);
  if (e.requireParking !== undefined && obs.ctx.requireParking !== e.requireParking) {
    m.push(`requireParking: want ${e.requireParking}, got ${obs.ctx.requireParking}`);
  }
  if (e.freeParking !== undefined && obs.ctx.freeParking !== e.freeParking) {
    m.push(`freeParking: want ${e.freeParking}, got ${obs.ctx.freeParking}`);
  }
  const cards = obs.cards;
  if (e.cards === 'some' && cards.length === 0) m.push('cards: want results, got none');
  if (e.cards === 'none' && cards.length > 0) m.push(`cards: want none, got ${cards.length}`);
  if (e.kind === 'greeting' && cards.length > 0) m.push('cards: small talk shows no results');
  const cardKind =
    e.cardKind ?? (e.kind === 'park' ? 'parking' : e.kind === 'food' ? 'restaurant' : null);
  if (cardKind && cards.some((c) => c.kind !== cardKind)) m.push(`cards: want only ${cardKind}`);
  if (
    e.requireParking === true &&
    cards.some((c) => c.kind === 'restaurant' && c.parkingM === null)
  ) {
    m.push('cards: a place without a car park is listed for a parking ask');
  }
  if (e.parkAsk) m.push(...parkOffer(e.parkAsk, obs));
  if (e.parkShown !== undefined) {
    const food = cards.filter((c) => c.kind === 'restaurant');
    if (food.length === 0) m.push('parkShown: no restaurant cards');
    for (const c of food) {
      if ((c.parkAsked === true) !== e.parkShown) {
        m.push(
          `parkShown: want ${e.parkShown}, got a card with${c.parkAsked ? '' : 'out'} its car park`,
        );
        break;
      }
    }
    if (!e.parkShown && /(^| )otopark/.test(withoutNames(obs.text, cards, obs.ctx.place))) {
      m.push(
        `parkShown: a food answer without a parking ask names parking: ${obs.text.slice(0, 80)}`,
      );
    }
  }
  if (e.nameCard) {
    const named = cards.some((c) => e.nameCard!.some((n) => fold(c.name).includes(fold(n))));
    if (!named) m.push(`name: no card is named ${e.nameCard.join('|')}`);
  }
  // Talk and injection: the reply stays on task (no internals, no poem, no digits).
  if (e.kind === 'offtopic' || e.kind === 'none') {
    if (replyLeaks(obs.text)) m.push(`reply leaks or states a fact: ${obs.text.slice(0, 80)}`);
    if (obs.text.split('\n').length > 2)
      m.push('reply is long-winded, not a short turn back to the app');
  }
  return result(m);
}

function choices(turn: ConvoTurn, obs: ObservedTurn): Check {
  const e = turn.expect;
  const m: string[] = [];
  if (obs.tapMissing) m.push(`chip not offered: "${obs.input}"`);
  const specified =
    e.chips || e.noChips || e.hepsi !== undefined || e.chipsMin !== undefined || e.ask || e.member;
  if (!specified && !obs.tapMissing) return notApplicable();
  const labels = obs.actions.filter((a) => a.kind !== 'open').map((a) => a.label);
  for (const c of e.chips ?? []) if (!labels.includes(c)) m.push(`chip missing: ${c}`);
  for (const c of e.noChips ?? []) if (labels.includes(c)) m.push(`chip must not be there: ${c}`);
  if (e.hepsi !== undefined && labels.includes(HEPSI) !== e.hepsi) {
    m.push(`"${HEPSI}" chip: want ${e.hepsi ? 'present' : 'absent'}`);
  }
  if (e.chipsMin !== undefined) {
    const n = labels.filter((l) => memberLabels.has(l)).length;
    if (n < e.chipsMin) m.push(`kind chips: want ${e.chipsMin}+, got ${n} (${labels.join(', ')})`);
  }
  if (e.ask && !e.ask.includes(obs.ctx.ask ?? '')) {
    m.push(`question: want ${e.ask.join('|')}, got ${obs.ctx.ask ?? 'none'}`);
  }
  if (e.member && !obs.kindSwapped && obs.ctx.choice?.member !== e.member) {
    m.push(`kind picked: want ${e.member}, got ${obs.ctx.choice?.member ?? 'none'}`);
  }
  return result(m);
}

function replyText(obs: ObservedTurn, repeats: ReadonlySet<string>): Check {
  const m: string[] = [];
  // A tap that only opens the map (the ask included parking) says nothing in the chat.
  if (obs.text.trim() === '' && !obs.directions) m.push('empty reply');
  if (BROKEN.test(obs.text)) m.push(`broken text: ${obs.text.slice(0, 80)}`);
  for (const w of obs.wordings) {
    if (w.accepted === null) continue;
    if (sentenceCount(w.accepted) > 2) m.push(`wording is over two sentences: ${w.accepted}`);
    if (BROKEN.test(w.accepted)) m.push(`wording is broken: ${w.accepted}`);
    if (repeats.has(wordingKey(w.accepted))) m.push(`wording repeats another case: ${w.accepted}`);
  }
  return result(m);
}

function honesty(turn: ConvoTurn, obs: ObservedTurn): Check {
  const m: string[] = [
    ...claimsIn(
      obs.text,
      obs.cards.map((c) => c.name),
      obs.input,
    ),
    ...distanceClaims(obs.text, obs.cards, turn.expect.kind === 'name'),
  ];
  if (turn.expect.note === true && !NOTE.test(fold(obs.text))) {
    m.push('the honest "no data" note is missing');
  }
  for (const w of obs.wordings) {
    const claimsRoom =
      w.accepted !== null &&
      !w.hasFreeSpots &&
      (w.accepted.match(/[^.!?\n;]+[.!?\n;]*/g) ?? []).some((part) => {
        const f = fold(part);
        return ROOM.test(f) && !NOT_KNOWN.test(f);
      });
    if (claimsRoom) {
      m.push(`wording claims room without a live count: ${w.accepted}`);
    }
  }
  return result(m);
}

/** The four checks of a turn. A void turn (an outage) fails them all. */
export function scoreTurn(
  turn: ConvoTurn,
  obs: ObservedTurn,
  repeats: ReadonlySet<string> = new Set(),
): TurnScore {
  // A follow-up with nothing to tap was not played: the turn before it already failed.
  if (obs.skipped) {
    const na = notApplicable();
    return { understanding: na, choices: na, reply: na, honesty: na, ok: true };
  }
  if (obs.infra) {
    const down = result([`outage: ${obs.error ?? 'an AI call failed'}`]);
    return { understanding: down, choices: down, reply: down, honesty: down, ok: false };
  }
  const s = {
    understanding: understanding(turn, obs),
    choices: choices(turn, obs),
    reply: replyText(obs, repeats),
    honesty: honesty(turn, obs),
  };
  return { ...s, ok: CHECKS.every((c) => s[c].ok) };
}

export type CaseResult = {
  c: ConvoCase;
  turns: ObservedTurn[];
  scores: TurnScore[];
  /** Every check of every turn passed (and every turn ran). */
  ok: boolean;
  error?: string;
};

/** Scores a played conversation; a conversation that stopped early fails. */
export function scoreCase(
  c: ConvoCase,
  turns: ObservedTurn[],
  repeats: ReadonlySet<string> = new Set(),
  error?: string,
): CaseResult {
  const scores = turns.map((obs, i) => scoreTurn(c.turns[i] as ConvoTurn, obs, repeats));
  const ok = turns.length === c.turns.length && scores.every((s) => s.ok) && !error;
  return { c, turns, scores, ok, ...(error ? { error } : {}) };
}

/** Scores every conversation, with the cross-case repetition check. */
export function scoreAll(
  played: { c: ConvoCase; turns: ObservedTurn[]; error?: string }[],
): CaseResult[] {
  const repeats = repeatedWordings(
    played.map((p) =>
      p.turns.flatMap((t) =>
        t.wordings.flatMap((w) => (w.accepted ? [{ user: t.input, text: w.accepted }] : [])),
      ),
    ),
  );
  return played.map((p, i) => scoreCase(p.c, p.turns, repeats[i], p.error));
}

// --- Cost estimate and report ---------------------------------------------------------------

/** USD per million tokens (Haiku 5.5), for the estimate only; the same as scripts/ai-eval-big.ts. */
export const PRICE_IN = 0.1;
export const PRICE_OUT = 0.5;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};
/** 5-minute prompt cache: reads cost 0.1x and writes 1.25x the input price. */
export function costOf(u: Usage): number {
  return (
    (u.inputTokens * PRICE_IN +
      u.cacheReadTokens * PRICE_IN * 0.1 +
      u.cacheWriteTokens * PRICE_IN * 1.25 +
      u.outputTokens * PRICE_OUT) /
    1e6
  );
}

/** The fixed prompts, in tokens (the runner measures them from the real prompt texts). */
export type PromptSizes = {
  understand: number;
  pick: number;
  parkPick: number;
  reply: number;
};

const SCHEMA_TOKENS = { understand: 700, pick: 250, reply: 100 };
const OUT_TOKENS = { understand: 250, pick: 110, reply: 80 };
/** Per candidate of a pick request (name, type and the facts as JSON). */
const PICK_CANDIDATE_TOKENS = 70;
const AVG_PICK_CANDIDATES = 30;
const TURN_TOKENS = { user: 15, bot: 70 };

export type Estimate = {
  calls: { understand: number; pick: number; reply: number };
  usage: Usage;
  usd: number;
};

/**
 * What a full run costs, before it starts: the calls each turn makes (a typed message goes to the
 * router; a search with results also to the pick; most replies are worded), their sizes, and the
 * prompt cache (the first call of each prompt is a write, the rest are reads).
 */
export function estimateCost(cases: readonly ConvoCase[], sizes: PromptSizes): Estimate {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const calls = { understand: 0, pick: 0, reply: 0 };
  const written = new Set<string>();
  const cached = (key: string, tokens: number) => {
    if (written.has(key)) usage.cacheReadTokens += tokens;
    else {
      written.add(key);
      usage.cacheWriteTokens += tokens;
    }
  };
  for (const c of cases) {
    let history = 0;
    let city: string = c.city;
    for (const t of c.turns) {
      if (t.input.type === 'say' && t.input.city) {
        city = t.input.city;
        history = 0;
      }
      const textTokens = Math.ceil(t.input.text.length / 3);
      if (t.input.type === 'say') {
        calls.understand++;
        cached(`understand|${city}|${c.section}`, sizes.understand);
        usage.inputTokens += SCHEMA_TOKENS.understand + textTokens + history;
        usage.outputTokens += OUT_TOKENS.understand;
      }
      const k = t.expect.kind;
      const searched = t.input.type === 'say' && (k === 'food' || k === 'park');
      if (searched && t.expect.cards === 'some') {
        calls.pick++;
        const park = k === 'park';
        cached(`${park ? 'park' : 'pick'}|${city}`, park ? sizes.parkPick : sizes.pick);
        usage.inputTokens += SCHEMA_TOKENS.pick + AVG_PICK_CANDIDATES * PICK_CANDIDATE_TOKENS;
        usage.outputTokens += OUT_TOKENS.pick;
      }
      // Wordings: a hello, results, a name, a choice question and a "nothing found" are worded.
      const worded = k !== 'offtopic' && k !== 'none' && !(k === 'greeting' && t.expect.noChips);
      if (worded && t.input.type !== 'tap') {
        calls.reply++;
        cached(`reply|${city}`, sizes.reply);
        usage.inputTokens += SCHEMA_TOKENS.reply + textTokens + 150;
        usage.outputTokens += OUT_TOKENS.reply;
      }
      history += TURN_TOKENS.user + textTokens + TURN_TOKENS.bot;
    }
  }
  return { calls, usage, usd: costOf(usage) };
}

const pct = (ok: number, n: number): string => (n === 0 ? '-' : `${((100 * ok) / n).toFixed(1)}%`);
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export type ReportMeta = {
  model: string;
  /** Share of cases that must pass. */
  bar: number;
  usage: Usage;
  estimate?: Estimate;
  seed: number;
  /** How many cases were asked for (stopped early when fewer ran). */
  planned: number;
};

/** The worst failures first: most misses, then the case order. */
function worst(results: CaseResult[], n: number): CaseResult[] {
  const misses = (r: CaseResult) =>
    r.scores.reduce((sum, s) => sum + CHECKS.reduce((k, c) => k + s[c].misses.length, 0), 0);
  return results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.ok)
    .sort((a, b) => misses(b.r) - misses(a.r) || a.i - b.i)
    .slice(0, n)
    .map(({ r }) => r);
}

/** One failed conversation as lines: what the user wrote, what they saw, what was missed. */
export function conversationLines(r: CaseResult): string[] {
  const out = [`**${r.c.name}** (${r.c.category}, ${r.c.city}, ${r.c.hour}:00)`];
  if (r.error) out.push(`- error: ${r.error}`);
  r.turns.forEach((obs, i) => {
    const s = r.scores[i] as TurnScore;
    const chips = obs.actions.filter((a) => a.kind !== 'open').map((a) => a.label);
    out.push(
      `${i + 1}. user: ${obs.skipped ? '(skipped) ' : obs.tapMissing ? '(tap) ' : ''}${oneLine(obs.input)}`,
    );
    out.push(
      `   yerim: ${clip(oneLine(obs.text), 220)} [cards ${obs.cards.length}${chips.length ? `; chips ${chips.join(' | ')}` : ''}]`,
    );
    for (const c of CHECKS) for (const x of s[c].misses) out.push(`   - ${c}: ${x}`);
  });
  if (r.turns.length < r.c.turns.length)
    out.push(`   (stopped after ${r.turns.length} of ${r.c.turns.length} turns)`);
  return out;
}

/** The markdown report: pass rates, the worst failures with their conversations, tokens and cost. */
export function buildReport(results: CaseResult[], meta: ReportMeta): string {
  const lines: string[] = [];
  const passed = results.filter((r) => r.ok).length;
  const rate = results.length === 0 ? 0 : passed / results.length;
  lines.push(
    `Convo AI eval (${meta.model}): ${passed}/${results.length} (${pct(passed, results.length)})`,
  );
  lines.push(
    `Pass bar: ${Math.round(meta.bar * 100)}% -> ${rate >= meta.bar ? 'PASS' : 'FAIL'}` +
      (results.length < meta.planned
        ? ` (stopped early: ${results.length}/${meta.planned} ran)`
        : ''),
  );
  lines.push(`Seed: ${meta.seed}`);
  lines.push('');
  lines.push('| Category | Pass | % |');
  lines.push('| --- | --- | --- |');
  const categories = CONVO_CATEGORIES.filter((c: ConvoCategory) =>
    results.some((r) => r.c.category === c),
  );
  for (const cat of categories) {
    const rs = results.filter((r) => r.c.category === cat);
    const ok = rs.filter((r) => r.ok).length;
    lines.push(`| ${cat} | ${ok}/${rs.length} | ${pct(ok, rs.length)} |`);
  }
  lines.push('');
  lines.push('| Check (per turn) | Pass | % |');
  lines.push('| --- | --- | --- |');
  const allScores = results.flatMap((r) => r.scores);
  for (const check of CHECKS) {
    const applicable = allScores.filter((s) => !s[check].na);
    const ok = applicable.filter((s) => s[check].ok).length;
    lines.push(`| ${check} | ${ok}/${applicable.length} | ${pct(ok, applicable.length)} |`);
  }
  const turnsOk = allScores.filter((s) => s.ok).length;
  lines.push(
    `| every check | ${turnsOk}/${allScores.length} | ${pct(turnsOk, allScores.length)} |`,
  );
  lines.push('');
  lines.push('| City | Pass | % |');
  lines.push('| --- | --- | --- |');
  for (const city of [...new Set(results.map((r) => r.c.city))]) {
    const cr = results.filter((r) => r.c.city === city);
    const ok = cr.filter((r) => r.ok).length;
    lines.push(`| ${city} | ${ok}/${cr.length} | ${pct(ok, cr.length)} |`);
  }
  lines.push('');
  const wordings = results.flatMap((r) => r.turns.flatMap((t) => t.wordings));
  const accepted = wordings.filter((w) => w.accepted !== null).length;
  const shown = wordings.filter((w) => w.shown).length;
  const late = wordings.filter((w) => w.late).length;
  const failed = wordings.filter((w) => w.raw === null).length;
  lines.push(
    `Reply wording (validateReply): ${accepted}/${wordings.length} accepted (${pct(accepted, wordings.length)}); ` +
      `${wordings.length - accepted - failed} rejected, ${failed} failed, ${late} late; ${shown} shown to the user. ` +
      'Reported, not a pass condition: a rejected text falls back to the template.',
  );
  for (const kind of [...new Set(wordings.map((w) => w.kind))]) {
    const ws = wordings.filter((w) => w.kind === kind);
    const ok = ws.filter((w) => w.accepted !== null).length;
    lines.push(`- ${kind}: ${ok}/${ws.length} (${pct(ok, ws.length)})`);
  }
  lines.push(...rejectionLines(wordings));
  const lengths = results.flatMap((r) => r.turns.map((t) => messageSentences(t.text)));
  const buckets = [1, 2, 3, 4].map((n) => lengths.filter((l) => l === n).length);
  const long = lengths.filter((l) => l > 4).length;
  lines.push(
    `Message length (sentences of the whole Yerim message, templates and notes included; ${lengths.length} turns): ` +
      `1: ${buckets[0]}, 2: ${buckets[1]}, 3: ${buckets[2]}, 4: ${buckets[3]}, over 4: ${long} (${pct(long, lengths.length)}), longest ${Math.max(0, ...lengths)}. ` +
      'Reported, not a pass condition yet.',
  );
  const outages = results.filter((r) => r.error).length;
  lines.push('');
  lines.push(`Errors: ${outages}`);
  const u = meta.usage;
  lines.push(
    `Tokens: input ${fmt(u.inputTokens)} · cache read ${fmt(u.cacheReadTokens)} · cache write ${fmt(u.cacheWriteTokens)} · output ${fmt(u.outputTokens)}`,
  );
  lines.push(`Cost: $${costOf(u).toFixed(3)} (at $${PRICE_IN} in / $${PRICE_OUT} out per MTok)`);
  if (meta.estimate) lines.push(`Estimate before the run: $${meta.estimate.usd.toFixed(3)}`);
  const failing = results.filter((r) => !r.ok);
  const shownFails = worst(results, 30);
  lines.push('');
  lines.push(`## Worst failures (${shownFails.length} of ${failing.length})`);
  lines.push('');
  for (const r of shownFails) {
    lines.push(...conversationLines(r));
    lines.push('');
  }
  return lines.join('\n');
}

/** 1234567 -> "1 234 567". */
export const fmt = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Per kind, the reasons validateReply dropped the model's wordings, most common first, with one text each. */
export function rejectionLines(wordings: readonly ObservedWording[]): string[] {
  const rejected = wordings.filter((w) => w.rejectReason !== null);
  if (rejected.length === 0) return [];
  const lines = ['', '### Rejected wordings by kind and reason', ''];
  lines.push('| Kind | Reason | Count | Example |');
  lines.push('| --- | --- | --- | --- |');
  for (const kind of [...new Set(rejected.map((w) => w.kind))]) {
    const ofKind = rejected.filter((w) => w.kind === kind);
    const reasons = new Map<string, ObservedWording[]>();
    for (const w of ofKind)
      reasons.set(w.rejectReason!, [...(reasons.get(w.rejectReason!) ?? []), w]);
    const top = [...reasons.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, TOP_REASONS);
    for (const [reason, ws] of top) {
      const example = (ws[0]!.raw ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/');
      lines.push(`| ${kind} | ${reason} | ${ws.length}/${ofKind.length} | ${example} |`);
    }
  }
  lines.push('');
  return lines;
}

/** How many reasons per kind the rejection table lists. */
const TOP_REASONS = 3;
