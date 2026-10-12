import {
  dishProfile,
  GENERIC_DISH_STEMS,
  hasExactDish,
  likelyFirst,
  likelyServes,
  typicalFirst,
  type DishProfile,
} from '@/data/dishes';
import {
  CITY_STYLES,
  GENERIC_NAME_WORDS,
  MEAL_WORDS,
  MODIFIERS,
  ORDER_SINGLE_WORDS,
} from '@/data/foodLexicon';
import { IZMIR_CENTER, isNearRail } from '@/data/places';
import { getFreshness, visibleFree } from '@/data/freshness';
import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import {
  IZMIR_DISTRICTS,
  isQualifierWord,
  looksLikePlace,
  parseQuery,
  parkTripIn,
  planWhenIn,
  typedPlaceText,
  wishesIn,
  withoutPlanWords,
  type QueryIntent,
} from '@/data/intent';
import {
  allRestaurants,
  categoryOf,
  cuisineLabels,
  dishStem,
  matchesCategory,
  getRestaurant,
  nearestParking,
  NEAREST_PARKING_RADIUS_M,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  hasWordForm,
  hasWordStart,
  isFoodWord,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
  type Restaurant,
  type RestaurantRow,
} from '@/data/restaurants';
import { fold, searchPlaces } from '@/data/search';
import type { Parking } from '@/data/types';
import { closesLate, istanbulClock, openState, type OpenState } from '@/lib/openNow';
import type { AiResult } from '@/lib/ai/client';
import { validateFreeText, type FreeTextContext } from '@/lib/ai/freeText';
import {
  MAX_CANDIDATES,
  MAX_PLAN_PARKINGS,
  type ClarifyAsk,
  type DishMatch,
  type ParkPickCandidate,
  type ParkPickRequest,
  type ParkPickResponse,
  type ParkReason,
  type PickCandidate,
  type PickReason,
  type PickRequest,
  type PickResponse,
  type PlanCandidate,
  type PlanRequest,
  type PlanResponse,
  type PlanWhen,
  type Understanding,
  type Wish,
} from '@/lib/ai/protocol';
import { verifyParkPick, verifyPick, verifyPlan, walkMinFromMeters } from '@/lib/ai/verify';
import { disabledInfo } from '@/lib/disabledSpots';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { tariffFor } from '@/data/tariffs';

export type ChatPlace = { label: string; lat: number; lng: number };

export type ChatContext = {
  /** null = near the user. */
  place: ChatPlace | null;
  cat: FoodCategory | null;
  /** A category the user ruled out ("köfte değil balık"). */
  notCat: FoodCategory | null;
  dish: string | null;
  /** AI only: name words of places that serve `dish` when it is not a known dish. */
  dishServes?: string[] | null;
  /** Rule fallback: a name must carry the dish word exactly (or with a seller / plural suffix). */
  dishExact?: boolean;
  section: 'park' | 'food';
  requireParking: boolean;
  /** Only car parks known to be free ("otopark ücretsiz"). */
  freeParking: boolean;
  parkM: 300 | 500;
  wide: boolean;
  /** 'distance' after "daha yakın". */
  sort: 'parkEase' | 'distance';
  /** Wishes of the last message (rules + AI); only some change the order, see runFood. */
  wishes?: Wish[];
  /** Party size picked from a clarify chip (2 = "1-2 kişi", 4 = "3-5 kişi", 6 = "6+ kişi"). */
  party?: number;
  /** Prefer places known to be open at this time (clarify chip or plan). */
  when?: PlanWhen;
  /** The user's words that made this list; the "✨ Yerim seçsin" chip sends them. */
  query?: string;
};

export const emptyContext = (section: 'park' | 'food'): ChatContext => ({
  place: null,
  cat: null,
  notCat: null,
  dish: null,
  section,
  requireParking: false,
  freeParking: false,
  parkM: 300,
  wide: false,
  sort: 'parkEase',
});

export type ChatAction =
  | { kind: 'say'; label: string; text: string }
  | { kind: 'refine'; label: string; patch: Partial<ChatContext> }
  | { kind: 'open'; label: string; pathname: string; params: Record<string, string> }
  /** "✨ Yerim seçsin": the AI picks one of these cards (needs the AI layer). */
  | { kind: 'pick'; label: string; cards: ChatCard[]; query: string };

/** True facts about a restaurant card: shown on the card and checked against every AI claim. */
export type CardNarr = {
  cat?: string;
  open: OpenState;
  parkingPaid: boolean | null;
  parkingFree: number | null;
  /** Closes at 22:00 or later (or is open around the clock). */
  closesLate: boolean;
  outdoor: boolean | null;
  dish: DishMatch;
};

export type ChatCard =
  | {
      kind: 'restaurant';
      id: string;
      name: string;
      distanceM: number;
      parkingM: number | null;
      open: 'open' | 'closed' | 'unknown';
      unverified?: boolean;
      /** Why a dish search lists this place ("Adında lahmacun geçiyor"). */
      reason?: string;
      narr?: CardNarr;
      /** Chosen by the AI and verified against the card's own facts. */
      picked?: boolean;
    }
  | {
      kind: 'parking';
      id: string;
      name: string;
      distanceM: number;
      free: number | null;
      capacity: number | null;
      open: 'open' | 'closed' | 'unknown';
      /** Chosen by the AI and verified against the car park's own facts. */
      picked?: boolean;
    };

export type BotMessage = {
  text: string;
  cards: ChatCard[];
  actions: ChatAction[];
  /** The text was written by the AI layer. */
  sparkle?: boolean;
  /** Small note under the text (e.g. the daily AI quota is used up). */
  notice?: string;
  /** "Park, walk, eat" steps built from our data. */
  plan?: PlanData;
};

/** A plan card: the steps are already-rendered templates filled with our data. */
export type PlanData = {
  steps: string[];
  /** "Neden: ..." line made of verified reason templates, or null. */
  why: string | null;
  /** The car park to navigate to. */
  dest: { lat: number; lng: number; name: string };
};

export type AssistantDeps = {
  here: () => Promise<LatLng | null>;
  geocode: (q: string) => Promise<LatLng | null>;
  parkings: Parking[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  now?: Date;
  /** Optional AI layer; the screen binds deviceId / messageId / text / history. */
  ai?: {
    understand(text: string): Promise<AiResult<Understanding>>;
    /** Jobs 2 and 4; an AI layer without them simply never picks or plans. */
    pick?(req: Omit<PickRequest, 'deviceId' | 'messageId'>): Promise<AiResult<PickResponse>>;
    plan?(req: Omit<PlanRequest, 'deviceId' | 'messageId'>): Promise<AiResult<PlanResponse>>;
    pickPark?(
      req: Omit<ParkPickRequest, 'deviceId' | 'messageId'>,
    ): Promise<AiResult<ParkPickResponse>>;
    /** True the first time per day, so the "out of quota" notice shows once. */
    quotaNotice(): boolean;
  };
};

type Result = { reply: BotMessage; ctx: ChatContext };

const MAX_CARDS = 5;
/** Folded seller / possessive / plural endings a name word may add to a typed dish word. */
const NAME_SUFFIXES = [
  '',
  'ci',
  'cu',
  'si',
  'su',
  'i',
  'u',
  'in',
  'un',
  'ler',
  'lar',
  'cisi',
  'cusu',
];

/** True when a word of the folded name is `word`, or `word` plus one of NAME_SUFFIXES. */
function hasExactNameWord(foldedName: string, word: string): boolean {
  return foldedName.split(' ').some((nw) => NAME_SUFFIXES.some((suf) => nw === word + suf));
}
/** Folded word starts that make an unknown text clearly a place (street, quarter ...). */
const PLACE_WORDS = ['mahalle', 'mah', 'sokak', 'sk', 'cadde', 'cd', 'bulvar', 'meydan', 'semt'];
/** A dish search with fewer places than this looks in the wider rings. */
const MIN_DISH_PLACES = 3;

/** How far from a district's centre a restaurant or a place still counts as "in or near" it. */
const DISTRICT_REACH_M = WIDE_RADII_M[WIDE_RADII_M.length - 1]!;

/** "Bornova" -> "Bornova'da", "Konak" -> "Konak'ta", "Çiğli" -> "Çiğli'de"; `ki` adds "-ki" ("Bornova'daki"). */
function inDistrict(name: string, ki = false): string {
  const f = name.toLocaleLowerCase('tr');
  const lastVowel = f.replace(/[^aeıioöuü]/g, '').slice(-1) || 'e';
  const hard = 'çfhkpsşt'.includes(f.slice(-1));
  return `${name}'${hard ? 't' : 'd'}${'aıou'.includes(lastVowel) ? 'a' : 'e'}${ki ? 'ki' : ''}`;
}

/**
 * What a district plus one more word means. 'name': a restaurant near the district is named so;
 * 'place': a known place (street, mall, school) near it; 'food': the word is a dish modifier;
 * 'unknown': none of these, so the word may not be ignored.
 */
type Leftover =
  { kind: 'name' | 'food' | 'unknown'; x: string } | { kind: 'place'; x: string; place: ChatPlace };

/** Words a restaurant name may add to the typed name and still be that name ("Mado Cafe", "Sakura İzmir"). */
const GENERIC_SUFFIX_WORDS = new Set([
  ...GENERIC_NAME_WORDS,
  'restoran',
  'restorant',
  'restaurant',
  'cafe',
  'kafe',
  'lokanta',
  'lokantasi',
  'bufe',
  'izmir',
  ...IZMIR_DISTRICTS.map((d) => fold(d.name)),
]);

/** The word next to a district that no dish or category explains, and what it turns out to be. */
function districtLeftover(it: QueryIntent, text: string): Leftover | null {
  if (it.kind !== 'search' || !it.district || !it.placeQuery) return null;
  if (it.cat || it.mentionsParking || it.nearMe || !looksLikePlace(it.placeQuery)) return null;
  // "romantik", "ucuz", "ne yenir", "bir yer": a wish about the district's food, not a name.
  const qWords = it.placeQuery.split(' ').filter((w) => w && !isQualifierWord(w));
  if (qWords.length === 0) return null;
  const pq = qWords.join(' ');
  // A second district name is a place of its own ("Bornova Buca"), not an unknown word.
  if (qWords.some((w) => IZMIR_DISTRICTS.some((d) => fold(d.name) === w))) return null;
  const x = typedPlaceText(text, pq);
  if (qWords.some(isFoodWord)) return { kind: 'food', x };
  const centre = it.district;
  const near = restaurantsNear(centre, DISTRICT_REACH_M, 5000).filter(
    (r) => categoryOf(r) !== null,
  );
  const named = (r: Restaurant) => qWords.every((w) => hasExactNameWord(fold(r.name), w));
  // 1. A restaurant that is called exactly that (the name has no word beyond a generic one).
  const exact = (r: Restaurant) =>
    named(r) &&
    fold(r.name)
      .split(' ')
      .every(
        (nw) =>
          GENERIC_SUFFIX_WORDS.has(nw) ||
          qWords.some((w) => NAME_SUFFIXES.some((s) => nw === w + s)),
      );
  if (pq.length >= 3 && near.some(exact)) return { kind: 'name', x };
  // 2. A known place (university, mall, landmark) whose full name starts with the words.
  const placeHits = searchPlaces(pq, 6).filter(
    (hit) => distanceMeters(centre, hit) <= DISTRICT_REACH_M,
  );
  const asPlace = (h: (typeof placeHits)[number]): Leftover => ({
    kind: 'place',
    x,
    place: { label: h.name, lat: h.lat, lng: h.lng },
  });
  const full = placeHits.find((h) => {
    const n = fold(h.name);
    return n === pq || n.startsWith(`${pq} `);
  });
  if (full) return asPlace(full);
  // 3. Restaurants with the words somewhere in their names.
  if (pq.length >= 3 && near.some(named)) return { kind: 'name', x };
  // 4. The first hit that carries every word in its name.
  const h = placeHits.find((hit) => qWords.every((w) => hasWordStart(fold(hit.name), w)));
  if (h) return asPlace(h);
  return { kind: 'unknown', x };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function variant(
  t: AssistantDeps['t'],
  prefix: string,
  n: number,
  seed: string,
  opts?: Record<string, unknown>,
): string {
  return t(`${prefix}_${hash(seed) % n}`, opts);
}

function say(t: AssistantDeps['t'], key: string): ChatAction {
  const text = t(key);
  return { kind: 'say', label: text, text };
}

function examples(section: 'park' | 'food', t: AssistantDeps['t']): ChatAction[] {
  const keys =
    section === 'park'
      ? ['chat.exAlsancak', 'chat.exKonak', 'chat.exNear']
      : ['chat.exKofte', 'chat.exBreakfast', 'chat.exFish'];
  return keys.map((k) => say(t, k));
}

function pickOnMap(text: string, t: AssistantDeps['t']): ChatAction {
  return {
    kind: 'open',
    label: t('chat.actPickMap'),
    pathname: '/konum-sec',
    params: { purpose: 'search', q: text },
  };
}

const plain = (reply: BotMessage, ctx: ChatContext): Result => ({ reply, ctx });

/** A search intent from the AI's understanding of the text. */
function intentFromUnderstanding(
  u: Extract<Understanding, { kind: 'search' }>,
  text: string,
): Extract<QueryIntent, { kind: 'search' }> {
  const district = u.district
    ? (IZMIR_DISTRICTS.find((d) => fold(d.name) === fold(u.district!)) ?? null)
    : null;
  // A dish or a category is food, whichever section the chat is in.
  const food = u.food || u.cat !== null || !!u.dish;
  return {
    kind: 'search',
    text: fold(text),
    cat: u.cat,
    dish: u.dish,
    dishServes: u.dishServes,
    district,
    placeQuery: u.place ? fold(u.place) : '',
    requireParking: u.requireParking,
    quality: false,
    uncertain: false,
    food,
    nearMe: u.nearMe,
    mentionsParking: u.requireParking || !food,
  };
}

type SearchIntent = Extract<QueryIntent, { kind: 'search' }>;

/** Rule intent + AI intent: AI fills what the rules left empty; rule-found values stay. */
function mergeIntents(rule: SearchIntent, ai: SearchIntent): SearchIntent {
  const cat = rule.cat ?? ai.cat;
  const food = rule.food || ai.food || cat !== null || !!ai.dish;
  const requireParking = rule.requireParking || ai.requireParking;
  return {
    ...rule,
    cat,
    dish: rule.cat ? rule.dish : ai.dish,
    dishServes: rule.cat ? null : ai.dishServes,
    district: rule.district ?? ai.district,
    // The rules' leftover words are the ones they could not place; the AI decides what they meant.
    placeQuery: ai.placeQuery,
    requireParking,
    uncertain: false,
    food,
    nearMe: rule.nearMe || ai.nearMe,
    mentionsParking: rule.mentionsParking || requireParking || (!food && cat === null),
  };
}

type FollowUp =
  | { kind: 'nearer' }
  | { kind: 'freePark' }
  | { kind: 'wider' }
  | { kind: 'elsewhere'; intent: SearchIntent };

const WIDER_WORDS = new Set([
  'baska',
  'var',
  'mi',
  'mu',
  'yok',
  'yer',
  'yeri',
  'yerler',
  'bir',
  'peki',
]);
const LOCATIVE = ['de', 'da', 'te', 'ta'];

/** A short follow-up that refers to the previous search ("daha yakın", "bir de Konak'ta bak"). */
function detectFollowUp(folded: string, it: QueryIntent): FollowUp | null {
  const tokens = folded.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  // A named category or district is a new search, not a follow-up.
  const sameTarget = it.kind !== 'search' || (!it.cat && !it.district);

  if (sameTarget && /\botopark\w*\s+ucretsiz\b|\bucretsiz\s+(?:otopark|park)\w*/.test(folded)) {
    return { kind: 'freePark' };
  }
  if (sameTarget && /\bdaha yakin\w*/.test(folded)) return { kind: 'nearer' };
  if (sameTarget && tokens.includes('baska') && tokens.every((t) => WIDER_WORDS.has(t))) {
    return { kind: 'wider' };
  }

  // "bir de Bornova'da bak" / "Bornova'da da": the same search somewhere else.
  let x: string[] = [];
  if (tokens[0] === 'bir' && tokens[1] === 'de') {
    const end = tokens.findIndex((tok, i) => i > 2 && tok.startsWith('bak'));
    if (end > 2) x = tokens.slice(2, end);
  } else {
    const last = tokens[tokens.length - 1]!;
    const before = tokens[tokens.length - 2];
    if (
      tokens.length >= 2 &&
      LOCATIVE.includes(last) &&
      before !== undefined &&
      (LOCATIVE.includes(before) || LOCATIVE.some((l) => before.endsWith(l)))
    ) {
      x = tokens.slice(0, -1);
    }
  }
  if (x.length > 0) {
    const xi = parseQuery(x.join(' '));
    if (xi.kind === 'search' && !xi.cat && !xi.food && (xi.district || xi.placeQuery)) {
      return { kind: 'elsewhere', intent: xi };
    }
  }
  return null;
}

/** What one user message turned out to be, shared between understanding it and finishing the reply. */
type AnswerMeta = {
  text: string;
  /** Wishes from the rules, plus the AI's when it understood the message. */
  wishes: Wish[];
  /** The AI's understanding when it returned a search. */
  ai: Extract<Understanding, { kind: 'search' }> | null;
  planWhen: PlanWhen | null;
  /** The daily AI uses are gone: do not ask again for this message. */
  quotaOut: boolean;
};

export async function answer(text: string, ctx: ChatContext, deps: AssistantDeps): Promise<Result> {
  const meta: AnswerMeta = {
    text,
    wishes: wishesIn(text),
    ai: null,
    planWhen: null,
    quotaOut: false,
  };
  const res = await answerText(text, ctx, deps, meta);
  return finishAnswer(res, deps, meta);
}

async function answerText(
  text: string,
  ctx: ChatContext,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<Result> {
  const { t } = deps;
  meta.planWhen = planWhenIn(text) ?? (parkTripIn(text) ? 'now' : null);
  let it = parseQuery(meta.planWhen ? withoutPlanWords(text) || text : text);
  let notice: string | undefined;
  const withNotice = (r: Result): Result =>
    notice && !r.reply.notice ? { ...r, reply: { ...r.reply, notice } } : r;
  const offTopicActions = () => [
    say(t, 'chat.exStadium'),
    say(t, 'chat.exNear'),
    say(t, 'chat.exKofte'),
  ];

  // Follow-ups only make sense after a previous search.
  let followUp: FollowUp | null = null;
  if (ctx.place || ctx.cat || ctx.dish) {
    followUp = detectFollowUp(fold(text), it);
    if (followUp?.kind === 'elsewhere') {
      it = followUp.intent;
    } else if (followUp) {
      const f = followUp;
      const patch: Partial<ChatContext> =
        f.kind === 'nearer'
          ? { sort: 'distance' }
          : f.kind === 'freePark'
            ? { requireParking: true, freeParking: true }
            : { wide: true };
      meta.wishes = [];
      meta.planWhen = null;
      const res = await run({ ...ctx, ...patch }, deps, text);
      // The free-parking reply already says what it did; the other two get a short lead-in.
      const lead =
        f.kind === 'nearer' ? 'chat.nearest' : ctx.wide ? 'chat.wideAlready' : 'chat.wideNow';
      if (f.kind !== 'freePark' && res.reply.cards.length > 0) {
        res.reply.text = `${t(lead)} ${res.reply.text}`;
      }
      return withNotice(res);
    }
  }

  // A district with a word that is a restaurant's or a place's name needs no AI to be understood.
  const ruleIt = it;
  const ruleLeft = districtLeftover(it, text);
  const settled = ruleLeft !== null && ruleLeft.kind !== 'unknown';
  if (
    deps.ai &&
    !followUp &&
    (it.kind === 'offtopic' ||
      it.kind === 'empty' ||
      (it.kind === 'search' && it.uncertain && !settled) ||
      // A wish the rules cannot act on ("romantik", "çocuklarla"): the AI may map it to data we have.
      (it.kind === 'search' && meta.wishes.length > 0))
  ) {
    const res = await deps.ai.understand(text);
    if (res.ok) {
      if (res.remaining === 0 && deps.ai.quotaNotice()) notice = t('chat.sparkleLast');
      if (res.value.kind === 'offtopic') {
        // The model's words go through the same checks as the tone; otherwise the template answers.
        const said = validateFreeText('offtopic', res.value.reply, textContext(deps, IZMIR_CENTER));
        return withNotice(
          plain(
            said
              ? { text: said, cards: [], actions: offTopicActions(), sparkle: true }
              : {
                  text: variant(t, 'chat.offTopic', 2, text),
                  cards: [],
                  actions: offTopicActions(),
                },
            ctx,
          ),
        );
      }
      if (res.value.kind === 'search') {
        const fromAi = intentFromUnderstanding(res.value, text);
        it = it.kind === 'search' ? mergeIntents(it, fromAi) : fromAi;
        meta.ai = res.value;
        meta.wishes = [...new Set([...meta.wishes, ...(res.value.wishes ?? [])])];
        if ((res.value.partySize ?? 0) >= 3 && !meta.wishes.includes('group')) {
          meta.wishes.push('group');
        }
        meta.planWhen = res.value.plan?.when ?? meta.planWhen;
      }
    } else {
      if (res.reason === 'quota') meta.quotaOut = true;
      if (res.reason === 'quota' && deps.ai.quotaNotice()) notice = t('chat.sparkleOut');
    }
  }

  if (it.kind === 'offtopic') {
    return withNotice(
      plain(
        {
          text: variant(t, 'chat.offTopic', 2, text),
          cards: [],
          actions: offTopicActions(),
        },
        ctx,
      ),
    );
  }
  if (it.kind === 'greeting') {
    const msg = variant(t, 'chat.hello', 5, text);
    return plain({ text: msg, cards: [], actions: examples(ctx.section, t) }, ctx);
  }
  if (it.kind === 'abuse') {
    return plain({ text: t('chat.calm_0'), cards: [], actions: examples(ctx.section, t) }, ctx);
  }
  // 'gibberish' (too short / no vowel) never reaches the AI above: ask again, no search.
  if (it.kind === 'empty' || it.kind === 'gibberish') {
    return withNotice(
      plain(
        {
          text: variant(t, 'chat.unknown', 2, text),
          cards: [],
          actions: [pickOnMap(text, t), ...examples(ctx.section, t)],
        },
        ctx,
      ),
    );
  }

  const folded = fold(text);
  if (folded.split(' ').length >= 2) {
    const matches = allRestaurants().filter((r) => fold(r.name).startsWith(folded));
    const first = matches[0];
    if (first) {
      const target: LatLng = ctx.place ?? (await deps.here()) ?? IZMIR_CENTER;
      const nearest = matches
        .map((r) => ({ ...r, distanceM: distanceMeters(target, r) }))
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, MAX_CARDS);
      const rows = buildRestaurantRows(nearest, deps.parkings, target, deps.now ?? new Date());
      const cards: ChatCard[] = rows.map((row) => ({
        kind: 'restaurant',
        id: row.r.id,
        name: row.r.name,
        distanceM: row.r.distanceM,
        parkingM: row.parking?.distanceM ?? null,
        open: 'unknown',
        unverified: !row.r.verified,
        narr: cardNarr(row, deps, deps.now ?? new Date()),
      }));
      const actions: ChatAction[] = ctx.place
        ? [
            {
              kind: 'refine',
              label: t('chat.actFoodHere'),
              patch: { section: 'food', cat: null, dish: null },
            },
          ]
        : [];
      const found: BotMessage = {
        text: t('chat.foundName', { name: first.name, count: matches.length }),
        cards,
        actions,
      };
      return withNotice(plain(found, ctx));
    }
  }

  // A district plus a word nothing explained (not even the AI): never show the district's
  // places as if the word had been understood.
  let left = ruleLeft;
  if (it !== ruleIt) {
    const merged = districtLeftover(it, text);
    const nothing = it.kind === 'search' && !it.cat && !it.dish && !it.placeQuery;
    left = merged
      ? { ...merged, x: ruleLeft?.x ?? merged.x }
      : ruleLeft?.kind === 'unknown' && nothing
        ? ruleLeft
        : null;
  }
  if (left && it.kind === 'search' && it.district) {
    const district = it.district;
    const here: ChatPlace = { label: district.name, lat: district.lat, lng: district.lng };
    if (left.kind === 'name' || left.kind === 'food') {
      return withNotice(
        await run(
          {
            ...ctx,
            section: 'food',
            cat: null,
            dish: left.x,
            dishServes: null,
            dishExact: left.kind === 'name',
            place: here,
            parkM: 300,
            wide: false,
            sort: 'parkEase',
            freeParking: false,
          },
          deps,
          text,
          it.quality,
          meta,
        ),
      );
    }
    if (left.kind === 'unknown') {
      const streetLike = left.x
        .split(' ')
        .some((w) => PLACE_WORDS.some((p) => fold(w).startsWith(p)));
      const actions: ChatAction[] = [
        streetLike
          ? pickOnMap(text, t)
          : {
              kind: 'refine',
              label: t('chat.actAsDish'),
              patch: {
                section: 'food',
                cat: null,
                dish: left.x,
                dishServes: null,
                dishExact: false,
                place: here,
              },
            },
        {
          kind: 'refine',
          label: t('chat.actDistrictFood', { inDistrict: inDistrict(district.name, true) }),
          patch: { section: 'food', cat: null, dish: null, dishServes: null, place: here },
        },
      ];
      return withNotice(
        plain(
          {
            text: t('chat.districtUnknownThing', {
              inDistrict: inDistrict(district.name),
              q: left.x,
            }),
            cards: [],
            actions,
          },
          ctx,
        ),
      );
    }
  }

  const next: ChatContext = { ...ctx };
  if (it.cat) {
    next.cat = it.cat;
    next.dish = it.dish;
    next.dishServes = it.dishServes ?? null;
    next.dishExact = false;
    next.section = 'food';
  } else if (it.food) {
    next.cat = null;
    next.dish = it.dish;
    next.dishServes = it.dishServes ?? null;
    next.dishExact = false;
    next.section = 'food';
  }
  if (it.notCat) next.notCat = it.notCat;
  else if (it.cat) next.notCat = null;
  if (it.mentionsParking && (it.cat || it.food)) {
    next.requireParking = true;
  } else if (it.mentionsParking && (it.district || it.placeQuery)) {
    next.section = 'park';
    next.requireParking = false;
  } else if (it.mentionsParking) {
    if (ctx.section === 'food') next.requireParking = true;
    else next.section = 'park';
  }

  if (it.district) {
    next.place =
      left?.kind === 'place'
        ? left.place
        : { label: it.district.name, lat: it.district.lat, lng: it.district.lng };
  } else if (it.placeQuery) {
    const typedRaw = typedPlaceText(text, it.placeQuery);
    // One to three unknown words: maybe a dish rather than a place.
    const qWords = it.placeQuery.split(' ').filter(Boolean);
    const maybeDish =
      qWords.length <= 3 &&
      it.placeQuery.length >= 4 &&
      !qWords.some((w) => PLACE_WORDS.some((p) => w.startsWith(p)));
    const h = searchPlaces(it.placeQuery, 1)[0];
    // A place hit that does not carry the words in its name is only a fuzzy guess.
    const weakHit = !!h && !qWords.every((w) => hasWordStart(fold(h.name), w));
    if (maybeDish && (!h || weakHit)) {
      const from: LatLng = ctx.place ?? (await deps.here()) ?? IZMIR_CENTER;
      const reach = WIDE_RADII_M[WIDE_RADII_M.length - 1]!;
      // Names that start with the typed words: search it as a dish (tier 1 = these names).
      const nameHit = restaurantsNear(from, reach, 5000).some(
        (r) => categoryOf(r) !== null && qWords.every((w) => hasExactNameWord(fold(r.name), w)),
      );
      if (nameHit) {
        return withNotice(
          await run(
            {
              ...ctx,
              section: 'food',
              cat: null,
              dish: typedRaw,
              dishServes: null,
              dishExact: true,
            },
            deps,
            text,
            false,
            meta,
          ),
        );
      }
    }
    if (h) {
      next.place = { label: h.name, lat: h.lat, lng: h.lng };
    } else {
      const p = await deps.geocode(it.placeQuery);
      if (!p) {
        const typed = typedRaw.charAt(0).toLocaleUpperCase('tr') + typedRaw.slice(1);

        // 0. Unsure whether it is a dish or a place: ask (in the food chat, or when the text is not place-like).
        if (
          maybeDish &&
          !it.food &&
          !it.nearMe &&
          (ctx.section === 'food' || !looksLikePlace(text))
        ) {
          return withNotice(
            plain(
              {
                text: t('chat.dishOrPlace', { q: typedRaw }),
                cards: [],
                actions: [
                  {
                    kind: 'refine',
                    label: t('chat.actAsDish'),
                    patch: {
                      section: 'food',
                      cat: null,
                      dish: typedRaw,
                      dishServes: null,
                      dishExact: false,
                      place: null,
                    },
                  },
                  pickOnMap(text, t),
                ],
              },
              ctx,
            ),
          );
        }

        // 1. A dish or cuisine the user named: show restaurants matching it.
        const hasAll = (hay: string) => qWords.every((w) => hasWordStart(hay, w));
        const named = allRestaurants().filter(
          (r) => hasAll(fold(r.name)) || r.cuisines.some((c) => hasAll(fold(c.replace(/_/g, ' ')))),
        );
        if (named.length > 0) {
          const target: LatLng = ctx.place ?? (await deps.here()) ?? IZMIR_CENTER;
          const nearest = named
            .map((r) => ({ ...r, distanceM: distanceMeters(target, r) }))
            .sort((a, b) => a.distanceM - b.distanceM)
            .slice(0, MAX_CARDS);
          const rows = buildRestaurantRows(nearest, deps.parkings, target, deps.now ?? new Date());
          const cards: ChatCard[] = rows.map((row) => ({
            kind: 'restaurant',
            id: row.r.id,
            name: row.r.name,
            distanceM: row.r.distanceM,
            parkingM: row.parking?.distanceM ?? null,
            open: 'unknown',
            unverified: !row.r.verified,
            narr: cardNarr(row, deps, deps.now ?? new Date()),
          }));
          return withNotice(
            plain(
              {
                text: t('chat.dishNamed', { dish: typed, count: named.length }),
                cards,
                actions: [
                  {
                    kind: 'refine',
                    label: t('chat.actOnlyParking'),
                    patch: { requireParking: true },
                  },
                  {
                    kind: 'refine',
                    label: t('chat.actLokanta'),
                    patch: { section: 'food', cat: 'lokanta', dish: null },
                  },
                ],
              },
              { ...ctx, section: 'food', dish: typed },
            ),
          );
        }

        // 1b. The words name a category (a food word plus something unknown): never answer a
        // food question with nothing; say honestly nothing is known and show that category.
        if (it.cat) {
          const dishFirst =
            !!it.dish && folded.indexOf(fold(it.dish)) < folded.indexOf(it.placeQuery);
          const label = (dishFirst ? [it.dish, typedRaw] : [typedRaw, it.dish])
            .filter(Boolean)
            .join(' ');
          const fresh = ctx.cat !== next.cat;
          return withNotice(
            await run(
              {
                ...next,
                dish: label,
                dishServes: null,
                dishExact: false,
                ...(fresh
                  ? { parkM: 300, wide: false, sort: 'parkEase' as const, freeParking: false }
                  : {}),
              },
              deps,
              text,
              it.quality,
              meta,
            ),
          );
        }

        // 2. Looks like food: say no place makes it, offer nearby restaurants.
        if (it.food || it.nearMe || ctx.section === 'food') {
          return withNotice(
            plain(
              {
                text: t('chat.dishNotFound', { dish: typed }),
                cards: [],
                actions: [
                  {
                    kind: 'refine',
                    label: t('chat.actLokanta'),
                    patch: { section: 'food', cat: 'lokanta', dish: null },
                  },
                  pickOnMap(text, t),
                ],
              },
              { ...ctx, section: 'food' },
            ),
          );
        }

        // 3. Not food: keep the place-not-found reply, with the typed text.
        return withNotice(
          plain(
            {
              text: t('chat.placeNotFound', { q: typedRaw }),
              cards: [],
              actions: [pickOnMap(text, t), ...examples(next.section, t)],
            },
            ctx,
          ),
        );
      }
      next.place = { label: text.trim(), lat: p.lat, lng: p.lng };
    }
  } else if (it.nearMe) {
    next.place = null;
  }

  const placeChanged =
    (ctx.place?.lat ?? null) !== (next.place?.lat ?? null) ||
    (ctx.place?.lng ?? null) !== (next.place?.lng ?? null);
  if (placeChanged || ctx.cat !== next.cat) {
    next.parkM = 300;
    next.wide = false;
    next.sort = 'parkEase';
    next.freeParking = false;
  }
  // "en yakın X": nearest first, like the "daha yakın" follow-up.
  if (/\ben yakin\w*/.test(folded)) next.sort = 'distance';

  // The AI asked for a missing piece the rules do not have: ask it, with chips from our own data.
  const ask = meta.ai?.clarify?.ask;
  if (
    ask &&
    ((ask === 'district' && next.place === null && !it.nearMe) ||
      (ask === 'dish' && next.section === 'food' && !next.cat && !next.dish && !it.dish) ||
      (ask === 'party' &&
        next.section === 'food' &&
        ctx.party === undefined &&
        !meta.ai?.partySize) ||
      (ask === 'time' && ctx.when === undefined && meta.planWhen === null) ||
      (ask === 'duration' && next.section === 'park'))
  ) {
    return withNotice(await clarify(ask, next, it.food, deps, meta));
  }

  return withNotice(await run(next, deps, text, it.quality, meta));
}

export async function refine(
  ctx: ChatContext,
  patch: Partial<ChatContext>,
  deps: AssistantDeps,
): Promise<Result> {
  return run({ ...ctx, ...patch }, deps, JSON.stringify(patch), false);
}

async function run(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  quality = false,
  meta?: AnswerMeta,
): Promise<Result> {
  const { t } = deps;
  const now = deps.now ?? new Date();
  // A new message brings its own wishes; follow-ups and chips keep the last ones.
  if (meta) {
    ctx = {
      ...ctx,
      wishes: meta.wishes.length > 0 ? meta.wishes : undefined,
      when: undefined,
      ...(deps.ai ? { query: meta.text } : {}),
      ...(meta.wishes.includes('quick') ? { sort: 'distance' as const } : {}),
    };
  }

  let target: LatLng;
  let where: string;
  if (ctx.place) {
    target = { lat: ctx.place.lat, lng: ctx.place.lng };
    where = ctx.place.label;
  } else {
    const here = await deps.here();
    if (here) {
      target = here;
      where = t('chat.nearYou');
    } else {
      target = IZMIR_CENTER;
      where = t('chat.center');
    }
  }

  const reply =
    ctx.section === 'food'
      ? runFood(ctx, deps, seed, quality, target, where, now)
      : runPark(ctx, deps, seed, target, where, now);
  return { reply, ctx };
}

/** Card facts: only what the app itself would show as true. */
function cardNarr(row: RestaurantRow, deps: AssistantDeps, now: Date, hit?: DishHit): CardNarr {
  const r = row.r;
  const catKey = categoryOf(r);
  // deps.t is the plain i18n function; cuisineLabels wants i18next's TFunction type.
  const tf = deps.t as Parameters<typeof cuisineLabels>[1];
  const label = cuisineLabels(r.cuisines, tf)[0] ?? (catKey ? deps.t(`food.cats.${catKey}`) : '');
  const near = row.parking ? nearestParking(r, deps.parkings) : null;
  return {
    ...(label && label.length <= 20 ? { cat: label } : {}),
    open: r.openingHours ? openState({ openingHoursText: r.openingHours }, now) : 'unknown',
    parkingPaid: near?.parking.isPaid ?? null,
    // row.parking.free is already null unless the reading is fresh (same rules as visibleFree).
    parkingFree: row.parking?.free ?? null,
    closesLate: r.openingHours ? closesLate({ openingHoursText: r.openingHours }, now) : false,
    outdoor: r.outdoorSeating,
    // Only a name that carries the dish word is "named"; a cuisine tag or a typical place is "likely".
    dish: hit ? (hit.byName ? 'named' : 'likely') : 'none',
  };
}

/** Folded, short, non-generic name words the AI says places serving an unknown dish carry. */
function adHocProfile(
  dishServes: string[] | null | undefined,
  cat: FoodCategory | null,
): DishProfile | null {
  const serves = [
    ...new Set(
      (dishServes ?? [])
        .map((w) => fold(w))
        .filter((w) => w.length >= 3 && w.length <= 20 && !GENERIC_DISH_STEMS.has(w)),
    ),
  ];
  const first = serves[0];
  if (!first) return null;
  return { dish: first, cat: cat ?? 'lokanta', serves, label: first };
}

/** How a place fits a searched dish: 1 = the name or cuisine says it, 2 = it very likely serves it. */
type DishHit = { tier: 1 | 2; byName: boolean };

/**
 * The words of a dish that a place's name must carry to be "named after it". A modifier
 * ("taze", "sebzeli", "sıcak") and a generic meal word ("yemeği") never count: "taze meyve
 * suyu" is not "Taze Balıkçılık". A phrase that is a dish of its own ("kıymalı pide", "etli
 * ekmek") keeps its words. Empty for a meal phrase with nothing else ("sebze yemeği": only the
 * category speaks); a lone modifier-like word ("bezelye") is still matched as it was typed.
 */
function nameWords(stem: string): string[] {
  if (hasExactDish(stem)) return stem.split(' ');
  // How much or how it is ordered ("kilo", "yarım") names no place; nor does a city next to a dish word.
  const plain = stem
    .split(' ')
    .filter((w) => !GENERIC_NAME_WORDS.has(w) && !ORDER_SINGLE_WORDS.has(w));
  const styled = plain.filter((w) => !CITY_STYLES.has(w));
  const words = styled.length > 0 ? styled : plain;
  if (hasExactDish(words.join(' '))) return words;
  const content = words.filter((w) => !MODIFIERS.has(w));
  if (content.length > 0 || MEAL_WORDS.some((m) => stem.split(' ').includes(m))) return content;
  return words;
}

function dishClassifier(
  stem: string,
  profile: DishProfile | null,
  exact = false,
  words: string[] = stem.split(' '),
) {
  const kebab = (x: string) => x.replace(/kebap/g, 'kebab');
  const stemKebab = kebab(words.join(' '));
  return (r: Restaurant): DishHit | null => {
    const n = fold(r.name);
    // A word under 4 letters ("bal") only counts as a whole name word: not "Balcı", "Ballı".
    const hasWord = (w: string) =>
      w.length < 4 ? n.split(' ').includes(w) : exact ? hasExactNameWord(n, w) : hasWordForm(n, w);
    const byName = words.length > 0 && words.every(hasWord);
    const byCuisine =
      words.length > 0 &&
      r.cuisines.some((c) => {
        const tag = fold(c.replace(/_/g, ' '));
        return !profile?.notCuisines?.includes(tag) && kebab(tag).includes(stemKebab);
      });
    if (byName || byCuisine) {
      return { tier: 1, byName };
    }
    return profile && likelyServes(profile, n, r.cuisines) ? { tier: 2, byName: false } : null;
  };
}

/** The dish as typed, without a seller ending that the stem dropped ("pilavcı" -> "pilav"). */
function shownDish(dish: string, stem: string): string {
  const words = dish.split(' ');
  const sw = stem.split(' ');
  if (words.length !== sw.length) return dish;
  const i = words.length - 1;
  const last = words[i]!;
  const f = fold(last);
  if (f.length !== last.length || f === sw[i] || !f.startsWith(sw[i]!)) return dish;
  return [...words.slice(0, i), last.slice(0, sw[i]!.length)].join(' ');
}

/** When a "planned" time is meant: the next time of that name today, never in the past. */
export function plannedTime(when: PlanWhen, now: Date): Date {
  if (when === 'now') return now;
  const { minutes } = istanbulClock(now);
  const target =
    when === 'later_today'
      ? minutes + 120
      : when === 'lunch'
        ? 12 * 60 + 30
        : when === 'dinner'
          ? 19 * 60 + 30
          : 20 * 60;
  return target <= minutes ? now : new Date(now.getTime() + (target - minutes) * 60_000);
}

/** "20:00" in Istanbul time. */
function clockLabel(at: Date): string {
  const { minutes } = istanbulClock(at);
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Open state of a restaurant's readable hours at a time (live data does not apply). */
function openAt(r: Restaurant, at: Date): OpenState {
  return r.openingHours ? openState({ openingHoursText: r.openingHours }, at) : 'unknown';
}

/** The wishes and the time we can act on with data we really have. */
type Prefs = { late: boolean; outdoor: boolean; parking: boolean; at: Date | null };
const GROUP_PARKING_M = 300;

function preferences(ctx: ChatContext, now: Date): Prefs | null {
  const w = ctx.wishes ?? [];
  const prefs: Prefs = {
    late: w.includes('late'),
    outdoor: w.includes('outdoor'),
    // No claim beyond this: a car park within 300 m is all we know that helps a group or a family.
    parking: w.some((x) => x === 'family' || x === 'kids' || x === 'group'),
    at: ctx.when ? plannedTime(ctx.when, now) : null,
  };
  return prefs.late || prefs.outdoor || prefs.parking || prefs.at ? prefs : null;
}

/** Keeps the dish tiers; inside a tier, places that fit more of the wishes come first. */
function preferRows(rows: RestaurantRow[], p: Prefs, hits: Map<string, DishHit>): RestaurantRow[] {
  const score = (row: RestaurantRow) =>
    (p.late &&
    row.r.openingHours &&
    closesLate({ openingHoursText: row.r.openingHours }, p.at ?? undefined)
      ? 1
      : 0) +
    (p.outdoor && row.r.outdoorSeating === true ? 1 : 0) +
    (p.parking && row.parking && row.parking.distanceM <= GROUP_PARKING_M ? 1 : 0) +
    (p.at && openAt(row.r, p.at) === 'open' ? 1 : 0);
  return rows
    .map((row, i) => ({ row, i, tier: hits.get(row.r.id)?.tier ?? 0, s: score(row) }))
    .sort((a, b) => a.tier - b.tier || b.s - a.s || a.i - b.i)
    .map((x) => x.row);
}

function runFood(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  quality: boolean,
  target: LatLng,
  where: string,
  now: Date,
): BotMessage {
  const { t } = deps;
  const inCategory = ctx.cat
    ? restaurantsInCategory(target, ctx.cat, undefined, ctx.wide ? WIDE_RADII_M : undefined)
    : null;
  const searchRadiusM = inCategory?.radiusM ?? (ctx.wide ? 15000 : 1000);
  const found = inCategory ? inCategory.items : restaurantsNear(target, searchRadiusM, 600);
  const notCat = ctx.notCat;
  const items = notCat ? found.filter((r) => !matchesCategory(r, notCat)) : found;
  const rows = rankRestaurants(
    buildRestaurantRows(items, deps.parkings, target, now),
    ctx.sort,
    ctx.cat ?? undefined,
  );
  // Dish-first: rows named after the dish, then places that very likely serve it; no padding.
  // The places typical for the category come first, unless the user asked for the nearest.
  let ordered = ctx.sort === 'distance' ? rows : typicalFirst(rows, ctx.cat, ctx.dish ?? '');
  let dishPrefix = '';
  const hits = new Map<string, DishHit>();
  let profile: DishProfile | null = null;
  const stem = ctx.dish ? dishStem(ctx.dish) : '';
  const dishName = ctx.dish ? shownDish(ctx.dish, stem) : '';
  const words = stem ? nameWords(stem) : [];
  // "sebze yemeği", "taze balık": only generic words, so the category alone answers.
  const generic = !stem || GENERIC_DISH_STEMS.has(stem) || GENERIC_DISH_STEMS.has(words.join(' '));
  if (ctx.dish && stem && !generic) {
    // The AI's name words for an unknown dish come before reading it by its head noun
    // (and when the AI named only generic words it has no opinion to override).
    profile =
      dishProfile(stem, false) ??
      adHocProfile(ctx.dishServes, ctx.cat) ??
      (ctx.dishServes?.length ? null : dishProfile(stem));
  }
  if (ctx.dish && stem && !generic && (words.length > 0 || profile)) {
    const classify = dishClassifier(stem, profile, ctx.dishExact, words);
    // Both tiers come from every meal place around, not only the dish's own category:
    // a lahmacun can be at a kebab house (meat), an iskender at a döner shop (fast).
    const tiered = (radius: number) => {
      const candidates = restaurantsNear(target, radius, 5000).filter(
        (r) => categoryOf(r) !== null && (!notCat || !matchesCategory(r, notCat)) && classify(r),
      );
      const ranked = rankRestaurants(
        buildRestaurantRows(candidates, deps.parkings, target, now),
        ctx.sort,
        ctx.cat ?? undefined,
      );
      const t1: RestaurantRow[] = [];
      let t2: RestaurantRow[] = [];
      for (const row of ranked) {
        const hit = classify(row.r)!;
        hits.set(row.r.id, hit);
        (hit.tier === 1 ? t1 : t2).push(row);
      }
      // The places that only very likely serve it: the typical ones for the dish first.
      if (profile && ctx.sort !== 'distance') t2 = likelyFirst(t2, profile);
      return { t1, t2 };
    };
    let { t1, t2 } = tiered(searchRadiusM);
    let widened = false;
    // Too few matches nearby: look in the wider rings before giving up.
    if (!ctx.wide && t1.length + t2.length < MIN_DISH_PLACES) {
      for (const radius of WIDE_RADII_M) {
        const wide = tiered(radius);
        const total = wide.t1.length + wide.t2.length;
        if (total > t1.length + t2.length) {
          t1 = wide.t1;
          t2 = wide.t2;
          widened = true;
        }
        if (total >= MIN_DISH_PLACES) break;
      }
    }
    if (t1.length + t2.length > 0) {
      ordered = [...t1, ...t2];
      dishPrefix =
        (widened ? t('chat.dishWider', { dish: dishName }) + ' ' : '') +
        (t1.length > 0
          ? t('chat.dishNamed', { dish: dishName, count: t1.length })
          : t('chat.dishLikely', {
              dish: dishName,
              count: t2.length,
              label: profile?.label ?? '',
            })) +
        ' ';
    } else {
      dishPrefix = t('chat.dishUnknown', { dish: dishName }) + ' ';
      // Only the category is known: a place that is typical for it (by name, cuisine, kind) comes first,
      // not just the best-ranked one ("Kasap Fuat" for a kızartma, a juice bar for meyve suyu).
      ordered = typicalFirst(ordered, ctx.cat, stem);
      // Nothing of the category within reach of this place: look wider rather than answer with nothing.
      if (ordered.length === 0 && !ctx.wide) {
        const wideItems = ctx.cat
          ? restaurantsInCategory(target, ctx.cat, undefined, WIDE_RADII_M).items
          : restaurantsNear(target, WIDE_RADII_M[WIDE_RADII_M.length - 1]!, 600);
        ordered = typicalFirst(
          rankRestaurants(
            buildRestaurantRows(
              notCat ? wideItems.filter((r) => !matchesCategory(r, notCat)) : wideItems,
              deps.parkings,
              target,
              now,
            ),
            ctx.sort,
            ctx.cat ?? undefined,
          ),
          ctx.cat,
          stem,
        );
        if (ordered.length > 0)
          dishPrefix = t('chat.dishWider', { dish: dishName }) + ' ' + dishPrefix;
      }
    }
  }
  const withPark = withParkingWithin(ordered, ctx.parkM);
  const freeOnly = ctx.requireParking && ctx.freeParking;
  const parked = freeOnly
    ? withPark.filter((row) => nearestParking(row.r, deps.parkings)?.parking.isPaid === false)
    : withPark;
  const shown = ctx.requireParking ? parked : ordered;
  const noun = ctx.cat ? t(`chat.noun.${ctx.cat}`) : t('chat.noun.all');
  const what = notCat ? `${noun} (${t('chat.except', { cat: t(`food.cats.${notCat}`) })})` : noun;

  const prefs = preferences(ctx, now);
  const list = prefs ? preferRows(shown, prefs, hits) : shown;

  if (shown.length > 0) {
    let text = ctx.requireParking
      ? t(freeOnly ? 'chat.foodFoundFree' : 'chat.foodFoundPark', {
          where,
          count: shown.length,
          what,
        })
      : variant(t, 'chat.foodFound', 2, seed, {
          where,
          count: ordered.length,
          what,
          withPark: withPark.length,
        });
    text = dishPrefix + text;
    if (quality) text = t('chat.noRatings') + '\n' + text;
    if (prefs?.at) {
      const known = list.slice(0, MAX_CARDS).some((row) => openAt(row.r, prefs.at!) === 'open');
      text += ' ' + t(known ? 'chat.whenPrefer' : 'chat.whenNone', { time: clockLabel(prefs.at) });
    }
    const reasonOf = (id: string): string | undefined => {
      const hit = hits.get(id);
      if (!hit) return undefined;
      if (hit.byName) return t('chat.reasonNamed', { dish: dishName });
      // A cuisine-tag match is not "in the name": word it as a likely fit.
      return profile ? t('chat.reasonLikely', { dish: dishName, label: profile.label }) : undefined;
    };
    const cards: ChatCard[] = list.slice(0, MAX_CARDS).map((row) => {
      const reason = reasonOf(row.r.id);
      return {
        kind: 'restaurant',
        id: row.r.id,
        name: row.r.name,
        distanceM: row.r.distanceM,
        parkingM: row.parking?.distanceM ?? null,
        open: 'unknown',
        unverified: !row.r.verified,
        ...(reason ? { reason } : {}),
        narr: cardNarr(row, deps, now, hits.get(row.r.id)),
      };
    });
    const actions: ChatAction[] = [];
    if (deps.ai?.pick && cards.length >= 2) {
      actions.push({ kind: 'pick', label: t('chat.actPick'), cards, query: ctx.query ?? '' });
    }
    if (!ctx.requireParking) {
      actions.push({
        kind: 'refine',
        label: t('chat.actOnlyParking'),
        patch: { requireParking: true },
      });
    } else {
      actions.push({
        kind: 'refine',
        label: t('chat.actDropParking'),
        patch: { requireParking: false },
      });
    }
    actions.push({
      kind: 'open',
      label: t('chat.actList'),
      pathname: '/restoranlar',
      params: {
        lat: String(target.lat),
        lng: String(target.lng),
        label: where,
        ...(ctx.cat ? { cat: ctx.cat } : {}),
        ...(ctx.requireParking ? { park: '1' } : {}),
        ...(ctx.parkM === 500 ? { parkm: '500' } : {}),
        ...(ctx.wide ? { wide: '1' } : {}),
      },
    });
    actions.push({
      kind: 'say',
      label: t('chat.actOther'),
      text: t(ctx.cat !== 'breakfast' ? 'chat.exBreakfast' : 'chat.exFish'),
    });
    return { text, cards, actions };
  }

  if (freeOnly && withPark.length > 0) {
    const actions: ChatAction[] = [
      { kind: 'refine', label: t('chat.actDropFree'), patch: { freeParking: false } },
    ];
    if (!ctx.wide) {
      actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
    }
    return { text: t('chat.foodNoFreePark', { where, what }), cards: [], actions };
  }

  if (ctx.requireParking && ordered.length > 0) {
    const actions: ChatAction[] = [];
    if (ctx.parkM === 300) {
      actions.push({ kind: 'refine', label: t('chat.actWiden500'), patch: { parkM: 500 } });
    }
    if (!ctx.wide) {
      actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
    }
    actions.push({
      kind: 'refine',
      label: t('chat.actDropParking'),
      patch: { requireParking: false },
    });
    return { text: t('chat.foodNoParking', { where, what }), cards: [], actions };
  }

  const actions: ChatAction[] = [];
  if (!ctx.wide) {
    actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
  }
  actions.push(...examples('food', t));
  return { text: t('chat.foodNone', { where, what }), cards: [], actions };
}

/** Car park wishes and the time we can act on with data we really have. */
type ParkPrefs = {
  free: boolean;
  covered: boolean;
  nonstop: boolean;
  rail: boolean;
  disabled: boolean;
  late: boolean;
  at: Date | null;
};

function parkPreferences(ctx: ChatContext, now: Date): ParkPrefs | null {
  const w = ctx.wishes ?? [];
  const prefs: ParkPrefs = {
    free: w.includes('cheap') || w.includes('free'),
    covered: w.includes('covered'),
    nonstop: w.includes('nonstop') || w.includes('overnight'),
    rail: w.includes('rail'),
    disabled: w.includes('disabled'),
    late: w.includes('late'),
    at: ctx.when ? plannedTime(ctx.when, now) : null,
  };
  return Object.values(prefs).some(Boolean) ? prefs : null;
}

/** Open state of a car park at a time: live "isOpen" only counts for now. */
function parkOpenAt(p: Parking, at: Date, now: Date): OpenState {
  return at === now ? openState(p, now) : openState({ ...p, isOpen: null }, at);
}

/** The prefs a car park meets, by key. */
function parkFits(p: Parking, prefs: ParkPrefs, now: Date): Record<string, boolean> {
  return {
    free: prefs.free && p.isPaid === false,
    covered: prefs.covered && p.isIndoor === true,
    nonstop: prefs.nonstop && p.nonstop === true,
    rail: prefs.rail && isNearRail(p),
    disabled: prefs.disabled && disabledInfo(p, now) != null,
    late: prefs.late && (p.nonstop === true || closesLate(p, now)),
    at: !!prefs.at && parkOpenAt(p, prefs.at, now) === 'open',
  };
}

function preferParkings<T extends { p: Parking }>(list: T[], prefs: ParkPrefs, now: Date): T[] {
  return list
    .map((x, i) => ({ x, i, s: Object.values(parkFits(x.p, prefs, now)).filter(Boolean).length }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((e) => e.x);
}

/** One honest sentence per wish that changed the order: did any shown car park meet it? */
function parkPrefLines(
  shown: { p: Parking }[],
  prefs: ParkPrefs,
  now: Date,
  t: AssistantDeps['t'],
): string[] {
  const keys = ['free', 'covered', 'nonstop', 'rail', 'disabled', 'late'] as const;
  const lines: string[] = [];
  for (const key of keys) {
    if (!prefs[key]) continue;
    const has = shown.some((x) => parkFits(x.p, prefs, now)[key]);
    lines.push(t(`chat.parkWish.${key}${has ? '' : 'None'}`));
  }
  if (prefs.at) {
    const has = shown.some((x) => parkFits(x.p, prefs, now).at);
    lines.push(t(has ? 'chat.whenPrefer' : 'chat.whenNone', { time: clockLabel(prefs.at) }));
  }
  return lines;
}

function runPark(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  target: LatLng,
  where: string,
  now: Date,
): BotMessage {
  const { t } = deps;
  const radius = ctx.wide ? 5000 : 1500;
  const list = deps.parkings
    .map((p) => ({ p, d: distanceMeters(target, p) }))
    .filter((x) => x.d <= radius && (!ctx.freeParking || x.p.isPaid === false))
    .sort((a, b) => a.d - b.d);
  const prefs = parkPreferences(ctx, now);
  const ranked = prefs ? preferParkings(list, prefs, now) : list;

  if (list.length > 0) {
    let text = variant(t, 'chat.parkFound', 2, seed, { where, count: list.length });
    const fresh = list.filter((x) => visibleFree(x.p, now) !== null).length;
    if (fresh > 0) text += ' ' + t('chat.parkFresh', { count: fresh });
    if (prefs) text += ' ' + parkPrefLines(ranked.slice(0, MAX_CARDS), prefs, now, t).join(' ');
    const cards: ChatCard[] = ranked.slice(0, MAX_CARDS).map(({ p, d }) => ({
      kind: 'parking',
      id: p.id,
      name: p.name,
      distanceM: Math.round(d),
      free: visibleFree(p, now),
      capacity: p.capacity,
      open: openState(p, now),
    }));
    const actions: ChatAction[] = [];
    if (deps.ai?.pickPark && cards.length >= 2) {
      actions.push({ kind: 'pick', label: t('chat.actPick'), cards, query: ctx.query ?? '' });
    }
    actions.push(
      {
        kind: 'open',
        label: t('chat.actMap'),
        pathname: '/sonuc',
        params: { lat: String(target.lat), lng: String(target.lng), label: where },
      },
      {
        kind: 'refine',
        label: t('chat.actFoodHere'),
        patch: { section: 'food', cat: null, dish: null },
      },
    );
    return { text, cards, actions };
  }

  const actions: ChatAction[] = [];
  if (ctx.freeParking) {
    actions.push({ kind: 'refine', label: t('chat.actDropFree'), patch: { freeParking: false } });
  }
  if (!ctx.wide) {
    actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
  }
  return {
    text: t(ctx.freeParking ? 'chat.parkNoFree' : 'chat.parkNone', { where }),
    cards: [],
    actions,
  };
}

// --- Clarify (job 3) -------------------------------------------------------------------------

const CLARIFY_CATS: FoodCategory[] = ['breakfast', 'meat', 'fish', 'lokanta', 'cafe', 'dessert'];

/** One question and its chips. The wording may come from the AI (checked); the chips never do. */
async function clarify(
  ask: ClarifyAsk,
  next: ChatContext,
  food: boolean,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<Result> {
  const { t } = deps;
  const here = (await deps.here()) ?? IZMIR_CENTER;
  const asked = validateFreeText('clarify', meta.ai?.clarify?.text, textContext(deps, here));
  const text = asked ?? t(`chat.ask_${ask}`);
  const group = [...new Set<Wish>([...meta.wishes, 'group'])];
  let actions: ChatAction[];
  if (ask === 'district') {
    const nearest = [...IZMIR_DISTRICTS]
      .sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b))
      .slice(0, 3);
    actions = [
      ...nearest.map((d): ChatAction => ({
        kind: 'refine',
        label: d.name,
        patch: { place: { label: d.name, lat: d.lat, lng: d.lng } },
      })),
      { kind: 'refine', label: t('chat.clarifyNear'), patch: { place: null } },
    ];
  } else if (ask === 'dish') {
    actions = CLARIFY_CATS.map((cat): ChatAction => ({
      kind: 'refine',
      label: t(`food.cats.${cat}`),
      patch: { section: 'food', cat, dish: null },
    }));
  } else if (ask === 'party') {
    actions = [
      { kind: 'refine', label: t('chat.party_1'), patch: { party: 2 } },
      { kind: 'refine', label: t('chat.party_2'), patch: { party: 4, wishes: group } },
      { kind: 'refine', label: t('chat.party_3'), patch: { party: 6, wishes: group } },
    ];
  } else if (ask === 'duration') {
    // Only what the data can use: staying long prefers car parks known free, a night prefers 24 hours.
    const wishes = (extra?: Wish) => [
      ...new Set<Wish>([...meta.wishes, ...(extra ? [extra] : [])]),
    ];
    actions = [
      { kind: 'refine', label: t('chat.durShort'), patch: { wishes: wishes() } },
      { kind: 'refine', label: t('chat.durFew'), patch: { wishes: wishes('free') } },
      { kind: 'refine', label: t('chat.durNight'), patch: { wishes: wishes('overnight') } },
    ];
  } else if (next.section === 'park' && !food) {
    actions = [
      { kind: 'refine', label: t('chat.timeNow'), patch: { when: 'now' } },
      { kind: 'refine', label: t('chat.timeLater'), patch: { when: 'later_today' } },
    ];
  } else {
    actions = [
      { kind: 'refine', label: t('chat.timeNow'), patch: { when: 'now' } },
      { kind: 'refine', label: t('chat.timeLunch'), patch: { when: 'lunch' } },
      { kind: 'refine', label: t('chat.timeTonight'), patch: { when: 'tonight' } },
    ];
  }
  const ctx: ChatContext = {
    ...next,
    section: food || ask === 'dish' || ask === 'party' ? 'food' : next.section,
    wishes: meta.wishes.length > 0 ? meta.wishes : undefined,
    ...(deps.ai ? { query: meta.text } : {}),
  };
  return plain({ text, cards: [], actions, sparkle: asked !== null }, ctx);
}

// --- Wishes we have no data for (L4) -------------------------------------------------------

/** What each unmappable wish asks about; the app has no data on any of these. */
const PARK_NO_DATA_TOPIC: Partial<Record<Wish, 'security' | 'height' | 'motorcycle'>> = {
  safe: 'security',
  big_vehicle: 'height',
  motorcycle: 'motorcycle',
};

const NO_DATA_TOPIC: Partial<Record<Wish, 'price' | 'ambiance' | 'reviews' | 'menu' | 'kids'>> = {
  cheap: 'price',
  romantic: 'ambiance',
  quiet: 'ambiance',
  view: 'ambiance',
  tasty: 'reviews',
  healthy: 'menu',
  kids: 'kids',
  family: 'kids',
};

/** The honest note for wishes we cannot answer, or null when every wish is one we can use. */
function noInfoNote(
  wishes: Wish[],
  aiPicked: boolean,
  t: AssistantDeps['t'],
  section: 'park' | 'food' = 'food',
): string | null {
  const table = section === 'park' ? PARK_NO_DATA_TOPIC : NO_DATA_TOPIC;
  const topics = [...new Set(wishes.flatMap((w) => table[w] ?? []))];
  if (topics.length === 0) return null;
  const names = topics.map((k) => t(`chat.noInfo_${k}`));
  const what =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} ${t('chat.and')} ${names[names.length - 1]}`;
  const first = what.charAt(0).toLocaleUpperCase('tr') + what.slice(1);
  const key = section === 'park' ? 'chat.noInfoPark' : 'chat.noInfo';
  return t(`${key}${aiPicked ? 'Ai' : 'Rule'}`, { what: first });
}

/** Lines saying which wishes really changed the order, written only from the shown cards. */
function wishLines(wishes: Wish[], cards: ChatCard[], t: AssistantDeps['t']): string[] {
  const rest = cards.filter((c) => c.kind === 'restaurant');
  const out: string[] = [];
  if (wishes.includes('late')) {
    out.push(t(rest.some((c) => c.narr?.closesLate) ? 'chat.wishLate' : 'chat.wishLateNone'));
  }
  if (wishes.includes('outdoor')) {
    out.push(
      t(rest.some((c) => c.narr?.outdoor === true) ? 'chat.wishOutdoor' : 'chat.wishOutdoorNone'),
    );
  }
  if (wishes.some((w) => w === 'family' || w === 'kids' || w === 'group')) {
    const ok = rest.some((c) => c.parkingM != null && c.parkingM <= GROUP_PARKING_M);
    out.push(t(ok ? 'chat.wishParking' : 'chat.wishParkingNone'));
  }
  return out;
}

// --- Pick (job 2) and plan (job 4) ----------------------------------------------------------

/** Names the model's few free words must not repeat (cards, nearby car parks and restaurants). */
function textContext(deps: AssistantDeps, around: LatLng, cards: ChatCard[] = []): FreeTextContext {
  return {
    names: [
      ...cards.map((c) => c.name),
      ...deps.parkings
        .filter((p) => !p.genericName && distanceMeters(around, p) <= 2000)
        .map((p) => p.name),
      ...restaurantsNear(around, 1500, 250).map((r) => r.name),
    ],
    districts: IZMIR_DISTRICTS.map((d) => d.name),
  };
}

function pickCandidate(card: Extract<ChatCard, { kind: 'restaurant' }>, i: number): PickCandidate {
  const n = card.narr;
  return {
    i,
    kind: 'restaurant',
    walkMin: walkMinFromMeters(card.distanceM),
    openState: n?.open ?? card.open,
    closesLate: n?.closesLate ?? false,
    parkingM: card.parkingM != null ? Math.round(card.parkingM) : null,
    parkingFree: n?.parkingPaid == null ? null : !n.parkingPaid,
    freeSpots: n?.parkingFree ?? null,
    dishMatch: n?.dish ?? 'none',
    outdoor: n?.outdoor ?? null,
  };
}

/** A verified reason code as a sentence part, filled only with the facts that made it true. */
function reasonText(
  code: PickReason,
  facts: {
    walkMin: number;
    parkingM: number | null;
    parkWalkMin?: number;
    freeSpots: number | null;
  },
  dish: string,
  t: AssistantDeps['t'],
): string {
  switch (code) {
    case 'closest':
      return t('chat.why.closest', { count: facts.walkMin });
    case 'parking_close':
      return facts.parkWalkMin !== undefined
        ? t('chat.why.parking_close_walk', { count: facts.parkWalkMin })
        : t('chat.why.parking_close', { m: facts.parkingM });
    case 'most_free_spots':
      return t('chat.why.most_free_spots', { count: facts.freeSpots });
    case 'dish_named':
      return t('chat.why.dish_named', { dish });
    default:
      return t(`chat.why.${code}`);
  }
}

type AiFail = { ok: false; reason: 'quota' | 'error' | 'invalid'; remaining?: number };

type PickDone = {
  ok: true;
  /** The picked card first (flagged), the others in their order. */
  cards: ChatCard[];
  line: string;
  tone: string | null;
  remaining: number;
};

/** Asks the AI to pick among the restaurant cards; shows nothing unless every claim checks out. */
async function askPick(
  cards: ChatCard[],
  text: string,
  dish: string,
  deps: AssistantDeps,
  tctx: FreeTextContext,
): Promise<PickDone | AiFail> {
  const ai = deps.ai;
  if (!ai?.pick) return { ok: false, reason: 'error' };
  const rest = cards
    .filter((c): c is Extract<ChatCard, { kind: 'restaurant' }> => c.kind === 'restaurant')
    .slice(0, MAX_CANDIDATES);
  if (rest.length < 2) return { ok: false, reason: 'invalid' };
  const candidates = rest.map(pickCandidate);
  const res = await ai.pick({ text, candidates });
  if (!res.ok) {
    return res.remaining === undefined
      ? { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error' }
      : { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error', remaining: res.remaining };
  }
  const v = verifyPick(res.value, candidates, tctx);
  if (!v) return { ok: false, reason: 'invalid', remaining: res.remaining };
  const t = deps.t;
  const why = (code: PickReason, k: number) =>
    reasonText(code, { ...candidates[k]!, freeSpots: candidates[k]!.freeSpots }, dish, t);
  let line = t('chat.pickLine', {
    name: rest[v.pick]!.name,
    reasons: v.reasons.map((c) => why(c, v.pick)).join(', '),
  });
  if (v.runnerUp) {
    line +=
      ' ' +
      t('chat.pickRunner', {
        name: rest[v.runnerUp.index]!.name,
        why: why(v.runnerUp.why, v.runnerUp.index),
      });
  }
  const picked = rest[v.pick]!;
  const ordered: ChatCard[] = [
    { ...picked, picked: true },
    ...cards.filter((c) => !(c.kind === 'restaurant' && c.id === picked.id)),
  ];
  return { ok: true, cards: ordered, line, tone: v.tone, remaining: res.remaining };
}

type PlanDone = { ok: true; plan: PlanData; tone: string | null; remaining: number };

/** Builds the plan candidates from the shown restaurants and our car parks, asks, and verifies. */
async function askPlan(
  cards: ChatCard[],
  text: string,
  when: PlanWhen,
  dish: string,
  deps: AssistantDeps,
  tctx: FreeTextContext,
): Promise<PlanDone | AiFail> {
  const ai = deps.ai;
  if (!ai?.plan) return { ok: false, reason: 'error' };
  const { t } = deps;
  const now = deps.now ?? new Date();
  const at = plannedTime(when, now);
  const isNow = when === 'now' || at === now;
  const entries: { card: ChatCard; r: Restaurant; cand: PlanCandidate; parks: Parking[] }[] = [];
  let p = 0;
  for (const card of cards) {
    if (card.kind !== 'restaurant' || entries.length >= MAX_CANDIDATES) continue;
    const r = getRestaurant(card.id);
    if (!r) continue;
    const state = openAt(r, at);
    // A place known to be closed at that time is no plan.
    if (state === 'closed') continue;
    const near = deps.parkings
      .filter((x) => x.access !== 'subscribers')
      .map((x) => ({ x, d: distanceMeters(r, x) }))
      .filter(({ x, d }) => {
        if (d > NEAREST_PARKING_RADIUS_M) return false;
        // Live "isOpen" is only true for now; for a later time the hours decide.
        return (isNow ? openState(x, at) : openState({ ...x, isOpen: null }, at)) !== 'closed';
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_PLAN_PARKINGS);
    if (near.length === 0) continue;
    const n = card.narr;
    const index = entries.length;
    entries.push({
      card,
      r,
      parks: near.map((x) => x.x),
      cand: {
        i: index,
        kind: 'restaurant',
        walkMin: walkMinFromMeters(card.distanceM),
        openState: state,
        closesLate: r.openingHours ? closesLate({ openingHoursText: r.openingHours }, at) : false,
        dishMatch: n?.dish ?? 'none',
        outdoor: r.outdoorSeating,
        parkings: near.map(({ x }) => {
          // A free-space count is only known for now, and only when it is fresh.
          const f = getFreshness(x, now);
          const fresh = isNow && (f.kind === 'live' || f.kind === 'updated') && x.free != null;
          return {
            p: p++,
            walkMin: walkMinutes(r, x),
            parkingFree: x.isPaid === null ? null : !x.isPaid,
            freeSpots: fresh ? x.free : null,
            openState: isNow ? openState(x, at) : openState({ ...x, isOpen: null }, at),
          };
        }),
      },
    });
  }
  if (entries.length === 0) return { ok: false, reason: 'invalid' };
  const candidates = entries.map((e) => e.cand);
  const res = await ai.plan({ text, when, candidates });
  if (!res.ok) {
    return res.remaining === undefined
      ? { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error' }
      : { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error', remaining: res.remaining };
  }
  const v = verifyPlan(res.value, candidates, when, tctx);
  if (!v) return { ok: false, reason: 'invalid', remaining: res.remaining };

  const e = entries[v.restaurant]!;
  const pc = e.cand.parkings.findIndex((x) => x.p === v.parking);
  const park = e.parks[pc]!;
  const pf = e.cand.parkings[pc]!;
  const time = clockLabel(at);
  const details = [
    park.isPaid === false ? t('chat.parkFree') : park.isPaid === true ? t('chat.parkPaid') : null,
    pf.freeSpots !== null ? t('chat.parkSpots', { count: pf.freeSpots }) : null,
  ].filter(Boolean);
  const state =
    e.cand.openState === 'open'
      ? t(isNow ? 'chat.planOpenNow' : 'chat.planOpenAt', { time })
      : e.cand.openState === 'closed'
        ? t(isNow ? 'chat.planClosedNow' : 'chat.planClosedAt', { time })
        : t('chat.planNoHours');
  const eat = e.cand.closesLate ? `${state}, ${t('chat.planLate')}` : state;
  const reasons = v.reasons.map((code) =>
    reasonText(
      code,
      { walkMin: e.cand.walkMin, parkingM: null, parkWalkMin: pf.walkMin, freeSpots: pf.freeSpots },
      dish,
      t,
    ),
  );
  const plan: PlanData = {
    steps: [
      details.length > 0
        ? t('chat.planParkWith', { name: park.name, details: details.join(', ') })
        : t('chat.planPark', { name: park.name }),
      t('chat.planWalk', { count: pf.walkMin }),
      t('chat.planEat', { name: e.r.name, state: eat }),
    ],
    why: t('chat.planWhy', { reasons: reasons.join(', ') }),
    dest: { lat: park.lat, lng: park.lng, name: park.name },
  };
  return { ok: true, plan, tone: v.tone, remaining: res.remaining };
}

/** Quota notices for an AI answer, as for understanding. */
function noteQuota(
  reply: BotMessage,
  r: { ok: true; remaining: number } | AiFail,
  deps: AssistantDeps,
) {
  const ai = deps.ai;
  if (!ai || reply.notice) return;
  if (r.ok ? r.remaining === 0 : r.reason === 'quota') {
    if (ai.quotaNotice()) reply.notice = deps.t(r.ok ? 'chat.sparkleLast' : 'chat.sparkleOut');
  }
}

/** A fresh free-space count of a car park: live or recently updated, never sample data. */
function freshFree(p: Parking, now: Date): number | null {
  const f = getFreshness(p, now);
  return (f.kind === 'live' || f.kind === 'updated') && p.free != null ? p.free : null;
}

/** "ücretsiz, 12 boş": only what we know about the car park. */
function parkDetails(p: Parking, freeSpots: number | null, t: AssistantDeps['t']): string {
  return [
    p.isPaid === false ? t('chat.parkFree') : p.isPaid === true ? t('chat.parkPaid') : null,
    freeSpots !== null ? t('chat.parkSpots', { count: freeSpots }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

type ParkPickDone = {
  ok: true;
  cards: ChatCard[];
  line: string;
  tone: string | null;
  remaining: number;
  /** The chosen car park, its facts and the verified reasons as sentence parts. */
  park: Parking;
  cand: ParkPickCandidate;
  reasons: string[];
};

/** Asks the AI to pick a car park among the shown ones; every claim is checked against our data. */
async function askParkPick(
  cards: ChatCard[],
  text: string,
  deps: AssistantDeps,
  tctx: FreeTextContext,
  when: PlanWhen = 'now',
  minCards = 2,
): Promise<ParkPickDone | AiFail> {
  const ai = deps.ai;
  if (!ai?.pickPark) return { ok: false, reason: 'error' };
  const now = deps.now ?? new Date();
  const at = plannedTime(when, now);
  const rest: { card: Extract<ChatCard, { kind: 'parking' }>; p: Parking }[] = [];
  for (const card of cards) {
    if (card.kind !== 'parking' || rest.length >= MAX_CANDIDATES) continue;
    const p = deps.parkings.find((x) => x.id === card.id);
    if (p) rest.push({ card, p });
  }
  if (rest.length < minCards) return { ok: false, reason: 'invalid' };
  const candidates: ParkPickCandidate[] = rest.map(({ card, p }, i) => ({
    i,
    kind: 'parking',
    walkMin: walkMinFromMeters(card.distanceM),
    openState: parkOpenAt(p, at, now),
    nonstop: p.nonstop === true,
    free: p.isPaid === null ? null : !p.isPaid,
    tariffKnown: tariffFor(p.id) !== null,
    covered: p.isIndoor,
    // A count is only known for now, and only when it is fresh.
    freeSpots: at === now ? freshFree(p, now) : null,
    nearRail: isNearRail(p),
    capacity: p.capacity,
  }));
  const res = await ai.pickPark({ text, candidates });
  if (!res.ok) {
    return res.remaining === undefined
      ? { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error' }
      : { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error', remaining: res.remaining };
  }
  const v = verifyParkPick(res.value, candidates, tctx);
  if (!v) return { ok: false, reason: 'invalid', remaining: res.remaining };
  const { t } = deps;
  const why = (code: ParkReason, k: number) => {
    const c = candidates[k]!;
    return t(`chat.whyPark.${code}`, {
      count: code === 'closest' ? c.walkMin : code === 'big_capacity' ? c.capacity : c.freeSpots,
    });
  };
  const reasons = v.reasons.map((code) => why(code, v.pick));
  let line = t('chat.pickLine', { name: rest[v.pick]!.card.name, reasons: reasons.join(', ') });
  if (v.runnerUp) {
    line +=
      ' ' +
      t('chat.pickRunner', {
        name: rest[v.runnerUp.index]!.card.name,
        why: why(v.runnerUp.why, v.runnerUp.index),
      });
  }
  const picked = rest[v.pick]!;
  const ordered: ChatCard[] = [
    { ...picked.card, picked: true },
    ...cards.filter((c) => !(c.kind === 'parking' && c.id === picked.card.id)),
  ];
  return {
    ok: true,
    cards: ordered,
    line,
    tone: v.tone,
    remaining: res.remaining,
    park: picked.p,
    cand: candidates[v.pick]!,
    reasons,
  };
}

/** A parking-only plan: leave the car here, walk to where you are going. */
function parkOnlyPlan(done: ParkPickDone, place: ChatPlace | null, deps: AssistantDeps): PlanData {
  const { t } = deps;
  const details = parkDetails(done.park, done.cand.freeSpots, t);
  return {
    steps: [
      details
        ? t('chat.planParkWith', { name: done.park.name, details })
        : t('chat.planPark', { name: done.park.name }),
      place
        ? t('chat.planWalkTo', { count: done.cand.walkMin, place: place.label })
        : t('chat.planWalk', { count: done.cand.walkMin }),
    ],
    why: t('chat.planWhy', { reasons: done.reasons.join(', ') }),
    dest: { lat: done.park.lat, lng: done.park.lng, name: done.park.name },
  };
}

/**
 * After a message was answered: the wishes we can and cannot use (L4), the AI's tone and dish
 * note (validated), and, when the AI understood the message, its pick or plan (verified).
 */
async function finishAnswer(res: Result, deps: AssistantDeps, meta: AnswerMeta): Promise<Result> {
  const { t } = deps;
  const reply = res.reply;
  const restaurants = reply.cards.filter((c) => c.kind === 'restaurant');
  const parkings = reply.cards.filter((c) => c.kind === 'parking');
  if (restaurants.length === 0 && parkings.length === 0) return res;
  const food = restaurants.length > 0;

  const lines: string[] = [];
  const first = food ? getRestaurant(restaurants[0]!.id) : null;
  const tctx = textContext(deps, first ?? res.ctx.place ?? IZMIR_CENTER, reply.cards);
  const dish = res.ctx.dish ?? '';
  let sparkle = false;

  let tone = validateFreeText('tone', meta.ai?.tone, tctx);
  let aiPicked = false;
  const after: string[] = [];
  const ai = deps.ai;

  if (food) {
    if (ai?.plan && !meta.quotaOut && meta.planWhen) {
      const plan = await askPlan(reply.cards, meta.text, meta.planWhen, dish, deps, tctx);
      noteQuota(reply, plan, deps);
      if (plan.ok) {
        reply.plan = plan.plan;
        after.push(t('chat.planIntro'));
        tone = plan.tone ?? tone;
        aiPicked = true;
        sparkle = true;
      }
    } else if (ai?.pick && !meta.quotaOut && meta.ai && restaurants.length >= 2) {
      const pick = await askPick(reply.cards, meta.text, dish, deps, tctx);
      noteQuota(reply, pick, deps);
      if (pick.ok) {
        reply.cards = pick.cards;
        after.push(pick.line);
        tone = pick.tone ?? tone;
        aiPicked = true;
        sparkle = true;
      }
    }
  } else if (ai?.pickPark && !meta.quotaOut) {
    // A trip ("Konak'a gideceğim"): one car park and the walk. Otherwise a pick after the AI understood.
    const trip = meta.planWhen !== null;
    if (trip || (meta.ai && parkings.length >= 2)) {
      const pick = await askParkPick(
        reply.cards,
        meta.text,
        deps,
        tctx,
        meta.planWhen ?? 'now',
        trip ? 1 : 2,
      );
      noteQuota(reply, pick, deps);
      if (pick.ok) {
        if (trip) {
          reply.plan = parkOnlyPlan(pick, res.ctx.place, deps);
          after.push(t('chat.planIntro'));
        } else {
          reply.cards = pick.cards;
          after.push(pick.line);
        }
        tone = pick.tone ?? tone;
        aiPicked = true;
        sparkle = true;
      }
    }
  }

  if (tone) {
    lines.push(tone);
    sparkle = true;
  }
  lines.push(reply.text);
  if (food) {
    const note = validateFreeText('dishNote', meta.ai?.dishNote, tctx);
    if (note && res.ctx.dish) lines.push(note);
    lines.push(...wishLines(res.ctx.wishes ?? [], reply.cards, t));
  }
  lines.push(...after);
  const noInfo = noInfoNote(meta.wishes, aiPicked, t, food ? 'food' : 'park');
  if (noInfo) lines.push(noInfo);

  reply.text = lines.join('\n');
  if (sparkle) reply.sparkle = true;
  return res;
}

/** The "✨ Yerim seçsin" chip: the AI picks among the cards of the list the user is looking at. */
export async function pickFromCards(
  cards: ChatCard[],
  query: string,
  ctx: ChatContext,
  deps: AssistantDeps,
): Promise<Result> {
  const { t } = deps;
  const food = cards.some((c) => c.kind === 'restaurant');
  const first = cards[0];
  const around = first && food ? getRestaurant(first.id) : null;
  const tctx = textContext(deps, around ?? ctx.place ?? IZMIR_CENTER, cards);
  const text = query.trim() || t('chat.noun.all');
  const pick = food
    ? await askPick(cards, text, ctx.dish ?? '', deps, tctx)
    : await askParkPick(cards, text, deps, tctx);
  if (!pick.ok) {
    const reply: BotMessage = { text: t('chat.pickUnavailable'), cards: [], actions: [] };
    // The user asked for this on purpose: always say why, not only once a day.
    if (pick.reason === 'quota') reply.notice = t('chat.sparkleOut');
    return plain(reply, ctx);
  }
  const lines = [pick.tone, pick.line];
  const noInfo = noInfoNote(ctx.wishes ?? [], true, t, food ? 'food' : 'park');
  if (noInfo) lines.push(noInfo);
  const reply: BotMessage = {
    text: lines.filter(Boolean).join('\n'),
    cards: pick.cards,
    actions: [],
    sparkle: true,
  };
  noteQuota(reply, pick, deps);
  return plain(reply, ctx);
}
