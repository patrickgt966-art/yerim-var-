import {
  commonLast,
  commonShop,
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
import {
  askEntryFor,
  CHOICES,
  choiceById,
  entryForCat,
  entryReason,
  inMember,
  isVague,
  memberForAnswer,
  memberLabel,
  memberOf,
  type ChoiceEntry,
  type Member,
} from '@/data/choices';
import { activeCity, CITIES, cityExamples } from '@/data/cities';
import { settleDistrict } from '@/data/districtMatch';
import { isNearRail } from '@/data/places';
import { getFreshness, visibleFree } from '@/data/freshness';
import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import { quartersOf } from '@/data/quarters';
import {
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
  CATEGORY_RADII_M,
  categoryOf,
  cuisineLabels,
  dietLabels,
  dishStem,
  kindLabel,
  matchesCategory,
  getRestaurant,
  isEstimatedKind,
  nearestParking,
  NEAREST_PARKING_RADIUS_M,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  type NearbyRestaurant,
  hasWordForm,
  hasWordStart,
  isFoodWord,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
  type Restaurant,
  type RestaurantRow,
} from '@/data/restaurants';
import { fold, searchPlacesStrict } from '@/data/search';
import type { Parking } from '@/data/types';
import { closesLate, istanbulClock, openState, type OpenState } from '@/lib/openNow';
import type { AiResult } from '@/lib/ai/client';
import { validateFreeText, type FreeTextContext } from '@/lib/ai/freeText';
import {
  FAR_WALK_MIN,
  MAX_CANDIDATES,
  MAX_LABEL_CHARS,
  MAX_PICK_CANDIDATES,
  MAX_PLAN_PARKINGS,
  MAX_REASONS,
  PARK_REASONS,
  PICK_REASONS,
  REPLY_TIMEOUT_MS,
  ROUTER_TIMEOUT_MS,
  clipText,
  MAX_MESSAGE_CHARS,
  type AiReplyFacts,
  type AiReplyItem,
  type AiReplyKind,
  type ChatReplyAction,
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
import {
  parkReasonHolds,
  pickReasonHolds,
  verifyParkPick,
  verifyPick,
  distMOf,
  verifyPlan,
  walkMinFromMeters,
} from '@/lib/ai/verify';
import { validateReply } from '@/lib/ai/replyCheck';
import { disabledInfo } from '@/lib/disabledSpots';
import { pickerParams } from '@/lib/pickPlace';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { tariffFor } from '@/data/tariffs';
import i18n from '@/i18n';
import { daypartOf, foodReply, foundNameReply, parkReply } from '@/data/replyText';

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
  /** The cards of the last bot reply; "sence" / "sen seç" pick among them. */
  lastCards?: ChatCard[];
  /** The question the last reply asked (choices.ts entry id): a typed "balık" / "hepsi" answers it. */
  ask?: string;
  /** The kind of place picked from a choices.ts entry: one member id, or 'all' for the mix. */
  choice?: { id: string; member: string };
  /** The goal / mood wishes of a message Yerim asked a clarify question about: the answer keeps them. */
  clarifyWishes?: Wish[];
  /**
   * The id of the routed message that asked, when its one /reply is still unused: an answer that
   * needs no router call of its own may use it for its wording.
   */
  replyId?: string;
  /**
   * The restaurant whose "Yol tarifi" Yerim asked about ("Arabayla mı gidiyorsun?"): the next
   * message answers it (yes: car parks near it, no: directions to it) and it lasts one answer only.
   */
  parkAsk?: { id: string; name: string; lat: number; lng: number };
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
      /**
       * The ask included parking (a parking word, "Sadece otoparklı", a plan): the card shows its
       * car park and "Yol tarifi" opens directions at once. Without it the card is about food.
       */
      parkAsked?: true;
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
  /**
   * The nearby places behind the cards (more than are shown), for the AI pick to judge which fit
   * the request. Dropped before the reply leaves the assistant.
   */
  pool?: ChatCard[];
  /** Wishes this reply already answered in its own words (no "we have no menu data" note after it). */
  explained?: Wish[];
  /**
   * What the AI may reword: the turn's kind, its facts (the items are added from the final cards)
   * and the template sentence(s) of `text` it replaces. Dropped before the reply leaves the assistant.
   */
  aiReply?: { kind: AiReplyKind; facts: AiReplyFacts; template: string };
  /** The screen hands this destination to the user's map app when it shows the reply. */
  directions?: { lat: number; lng: number; name: string };
};

/** A plan card: the steps are already-rendered templates filled with our data. */
export type PlanData = {
  steps: string[];
  /** "Neden: ..." line made of verified reason templates, or null. */
  why: string | null;
  /** The car park to navigate to; `id` + `kind` let the share text link to our own page. */
  dest: { lat: number; lng: number; name: string; id?: string; kind?: 'p' };
  /** The restaurant the plan ends at, when it has one (shared as our own link). */
  place?: { id: string; name: string; lat: number; lng: number };
};

export type AssistantDeps = {
  here: () => Promise<LatLng | null>;
  geocode: (q: string) => Promise<LatLng | null>;
  parkings: Parking[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  now?: Date;
  /** Optional AI layer; the screen binds deviceId / messageId / text / history. */
  ai?: {
    /**
     * The router: every new user message goes here first (one daily use). It answers with a search
     * (the rules run it), a chat reply, or unknown. `lastCards` says what the last reply showed.
     */
    understand(
      text: string,
      lastCards?: { count: number; kind: 'restaurant' | 'parking' },
    ): Promise<AiResult<Understanding>>;
    /** The user's earlier messages of this conversation, newest first, without the current one. */
    earlier?(): string[];
    /** Uses left today. At 0 the router is not called at all; leave it out and the AI is always tried. */
    usesLeft?(): number;
    /** Jobs 2 and 4; an AI layer without them simply never picks or plans. */
    pick?(req: Omit<PickRequest, 'deviceId' | 'messageId'>): Promise<AiResult<PickResponse>>;
    plan?(req: Omit<PlanRequest, 'deviceId' | 'messageId'>): Promise<AiResult<PlanResponse>>;
    pickPark?(
      req: Omit<ParkPickRequest, 'deviceId' | 'messageId'>,
    ): Promise<AiResult<ParkPickResponse>>;
    /**
     * The AI's wording of a reply built from our facts (REPLY_TIMEOUT_MS at most; it costs no use
     * of its own). Null when it fails; the template stays. Left out, the templates are always used.
     */
    reply?(req: {
      userText: string;
      kind: AiReplyKind;
      facts: AiReplyFacts;
      /** Another (already charged) message's id: the turn was answered without a router call. */
      messageId?: string;
    }): Promise<string | null>;
    /** The id of the message being answered; with it a turn can hand its unused /reply on. */
    messageId?(): string;
    /** True the first time per day, so the "out of quota" notice shows once. */
    quotaNotice(): boolean;
    /**
     * Asked once per failed router call: true when the "AI did not answer" notice may show (the
     * first failure in a row, then every 3rd). Left out, the notice always shows.
     */
    failNotice?(): boolean;
  };
};

type Result = { reply: BotMessage; ctx: ChatContext };

const MAX_CARDS = 5;
/**
 * /pick also sees this many places just beyond the search radius (up to FAR_PICK_M), so a place
 * that fits the request a little further out ("vejetaryenim": a vegan café at 1.2 km) is not
 * missed; the AI takes one of them only when nothing nearby fits.
 */
const FAR_PICK = 10;
const FAR_PICK_M = 3000;
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
  ...CITIES.map((c) => fold(c.name)),
]);

// Per city id: the districts are part of the generic words.
const districtWords = new Map<string, Set<string>>();

function isGenericSuffixWord(w: string): boolean {
  if (GENERIC_SUFFIX_WORDS.has(w)) return true;
  const { id, districts } = activeCity();
  let set = districtWords.get(id);
  if (!set) {
    set = new Set(districts.map(fold));
    districtWords.set(id, set);
  }
  return set.has(w);
}

/** The word next to a district that no dish or category explains, and what it turns out to be. */
function districtLeftover(it: QueryIntent, text: string): Leftover | null {
  if (it.kind !== 'search' || !it.district || !it.placeQuery) return null;
  if (it.cat || it.mentionsParking || it.nearMe || !looksLikePlace(it.placeQuery)) return null;
  // "romantik", "ucuz", "ne yenir", "bir yer": a wish about the district's food, not a name.
  const qWords = it.placeQuery.split(' ').filter((w) => w && !isQualifierWord(w));
  if (qWords.length === 0) return null;
  const pq = qWords.join(' ');
  // A second district name is a place of its own ("Bornova Buca"), not an unknown word.
  if (qWords.some((w) => activeCity().districtCenters.some((d) => fold(d.name) === w))) return null;
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
          isGenericSuffixWord(nw) || qWords.some((w) => NAME_SUFFIXES.some((s) => nw === w + s)),
      );
  if (pq.length >= 3 && near.some(exact)) return { kind: 'name', x };
  // 2. A known place (university, mall, landmark) whose full name starts with the words.
  const placeHits = searchPlacesStrict(pq, 6).filter(
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

/** A known place in or near the district whose name carries every word of `placeQuery`. */
function placeInDistrict(placeQuery: string, district: LatLng): ChatPlace | null {
  const qWords = placeQuery.split(' ').filter(Boolean);
  const h = searchPlacesStrict(placeQuery, 6).find(
    (hit) =>
      distanceMeters(district, hit) <= DISTRICT_REACH_M &&
      qWords.every((w) => hasWordStart(fold(hit.name), w)),
  );
  return h ? { label: h.name, lat: h.lat, lng: h.lng } : null;
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

/** Example chips that name a place of the active city. */
const PLACE_EXAMPLES = new Set([
  'chat.exAlsancak',
  'chat.exKonak',
  'chat.exBreakfast',
  'chat.exFish',
]);

function say(t: AssistantDeps['t'], key: string): ChatAction {
  const text = PLACE_EXAMPLES.has(key) ? t(key, cityExamples()) : t(key);
  return { kind: 'say', label: text, text };
}

function examples(section: 'park' | 'food', t: AssistantDeps['t']): ChatAction[] {
  const keys =
    section === 'park'
      ? ['chat.exAlsancak', 'chat.exKonak', 'chat.exNear']
      : ['chat.exKofte', 'chat.exBreakfast', 'chat.exFish'];
  return keys.map((k) => say(t, k));
}

/** The map picker; in a food chat the picked point opens restaurants, not car parks. */
function pickOnMap(
  text: string,
  t: AssistantDeps['t'],
  ctx: Pick<ChatContext, 'section' | 'cat'>,
): ChatAction {
  const food = ctx.section === 'food';
  return {
    kind: 'open',
    label: t('chat.actPickMap'),
    pathname: '/konum-sec',
    params: pickerParams({
      purpose: 'search',
      q: text,
      food,
      ...(food && ctx.cat ? { cat: ctx.cat } : {}),
    }),
  };
}

const plain = (reply: BotMessage, ctx: ChatContext): Result => ({ reply, ctx });

/** A search intent from the AI's understanding of the text. */
function intentFromUnderstanding(
  u: Extract<Understanding, { kind: 'search' }>,
  text: string,
): Extract<QueryIntent, { kind: 'search' }> {
  const district = u.district
    ? (activeCity().districtCenters.find((d) => fold(d.name) === fold(u.district!)) ?? null)
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

/** The AI's search names this word as a place, a dish or a business (in any of its fields). */
function aiNamed(u: Extract<Understanding, { kind: 'search' }>, word: string): boolean {
  const w = fold(word).trim();
  if (!w) return false;
  const said = [u.place, u.dish, u.appleQuery, ...(u.dishServes ?? [])]
    .filter((v): v is string => !!v)
    .map((v) => fold(v));
  return said.some((v) => v.includes(w) || (v.length >= 4 && w.includes(v)));
}

/**
 * The search when the AI read the message: its reading is the search, and the rules' word
 * matching neither overrides nor adds to it (rules read words, so slang, filler or an address
 * like "hacı" looks like a place or a dish to them). The rules only answer when the AI could not.
 * Two things of ours stay: the rules' dish where the AI named that same dish (it carries our own
 * dish profile), and the "best" note (we have no ratings). Every result still comes from our own
 * data: a district must be one of the city's, a place is looked up in our places.
 */
function aiLedIntent(
  rule: QueryIntent,
  ai: SearchIntent,
  u: Extract<Understanding, { kind: 'search' }>,
): SearchIntent {
  const r = rule.kind === 'search' ? rule : null;
  const sameDish = r !== null && !!r.dish && r.cat === ai.cat && aiNamed(u, r.dish);
  return {
    ...ai,
    // Ruling out the category that was picked excludes nothing (köfte and kebap are both meat).
    notCat: u.notCat && u.notCat !== ai.cat ? u.notCat : null,
    ...(sameDish ? { dish: r.dish, dishServes: r.dishServes ?? null } : {}),
    quality: r?.quality ?? false,
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
/** Words of the "daha yakın" / "ücretsiz otopark" follow-ups that the rules leave as a place. */
const FOLLOW_UP_WORDS = new Set(['daha', 'ucretsiz']);

/** A short follow-up that refers to the previous search ("daha yakın", "bir de Konak'ta bak"). */
function detectFollowUp(folded: string, it: QueryIntent): FollowUp | null {
  const tokens = folded.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  // A named category or district is a new search, not a follow-up.
  const sameTarget = it.kind !== 'search' || (!it.cat && !it.district);
  const isFollowWord = (w: string) =>
    FOLLOW_UP_WORDS.has(w) || WIDER_WORDS.has(w) || w.startsWith('yakin');
  // A place named with it ("Alsancak ücretsiz otopark"): not the previous place; the rest of
  // the words are the search there.
  const newPlace =
    it.kind === 'search' && it.placeQuery.split(' ').some((w) => w && !isFollowWord(w));
  const free = /\botopark\w*\s+ucretsiz\b|\bucretsiz\s+(?:otopark|park)\w*/.test(folded);
  const nearer = /\bdaha yakin\w*/.test(folded);
  if (sameTarget && newPlace && (free || nearer)) {
    const xi = parseQuery(tokens.filter((w) => !isFollowWord(w)).join(' '));
    return xi.kind === 'search' && !xi.cat && !xi.food && (xi.district || xi.placeQuery)
      ? { kind: 'elsewhere', intent: xi }
      : null;
  }

  if (sameTarget && free) return { kind: 'freePark' };
  if (sameTarget && nearer) return { kind: 'nearer' };
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
  /**
   * Do not ask the AI again for this message: the daily uses are gone, or the router already ran
   * and gave no search (chat, unknown, a timeout, an error). Only a search keeps pick / plan on.
   */
  quotaOut: boolean;
  /** The reply is complete as it is (small talk, a pick of the last cards): finishAnswer adds nothing. */
  settled?: boolean;
  /** The router answered this message (it charged the use the AI wording rides on). */
  routed?: boolean;
  /** Wishes of the clarify question this message answers; kept when it is a plain food ask. */
  carried?: Wish[];
  /** The id of this message (deps.ai.messageId), when the screen tells it. */
  messageId?: string;
  /** A charged id of the turn that asked whose /reply is unused: this answer may use it. */
  replyId?: string;
  /** The wording of this message's own id was asked for (the worker allows one per id). */
  replyUsed?: boolean;
};

type GreetKind =
  'day' | 'evening' | 'night' | 'morning' | 'fine' | 'salam' | 'thanks' | 'bye' | 'hello';

/** Words that may appear in a pure greeting; any other word makes the text a real request. */
const GREET_WORDS = new Set(
  (
    'nasilsin nasilsiniz naber nbr ne haber iyi misin misiniz tesekkurler tesekkur ederim sagol saol ' +
    'eyvallah mersi sagolun sag ol olun hosca kal kalin hoscakal gorusuruz bye bay sa as aleykum ' +
    'aleykumselam selamunaleykum selaminaleykum selamun selamin gunler aksamlar geceler gunaydin ' +
    'selam selamlar merhaba merhabalar mrb slm hey hosgeldin iyiyim ya hocam abi abla kanka dostum ' +
    'canim kardesim kardes usta reis size de sen siz cok ' +
    // English and other everyday greetings
    'hello helo hi hii hey heyy yo hola good morning evening night thanks thank you thx ty ' +
    'goodbye see kolay gelsin hayirli calismalar'
  ).split(' '),
);

/** What a pure greeting is ("iyi günler", "naber", "sa"), so the answer fits it; null otherwise. */
function greetKind(folded: string): GreetKind | null {
  // The app's own name is an address word ("merhaba yerim", "selam yerim var", "hey yerim").
  const toks = folded
    .split(' ')
    .filter(Boolean)
    .filter((w, i, all) => !(w === 'yerim' || (w === 'var' && all[i - 1] === 'yerim')));
  if (toks.length === 0 || toks.length > 6 || !toks.every((w) => GREET_WORDS.has(w))) return null;
  const has = (w: string) => toks.includes(w);
  const any = (...w: string[]) => w.some(has);
  if (
    any('nasilsin', 'nasilsiniz', 'naber', 'nbr') ||
    (has('ne') && has('haber')) ||
    (has('iyi') && any('misin', 'misiniz'))
  ) {
    return 'fine';
  }
  if (
    any(
      'tesekkurler',
      'tesekkur',
      'sagol',
      'saol',
      'eyvallah',
      'mersi',
      'sagolun',
      'thanks',
      'thx',
      'ty',
    )
  )
    return 'thanks';
  if (has('thank')) return 'thanks';
  if (has('sag') && any('ol', 'olun')) return 'thanks';
  if (
    (has('hosca') && any('kal', 'kalin')) ||
    any('hoscakal', 'gorusuruz', 'bye', 'goodbye') ||
    (has('see') && any('you', 'ya'))
  )
    return 'bye';
  if (has('bay') && toks.filter((w) => w === 'bay').length >= 2) return 'bye';
  if (any('sa', 'as', 'aleykum', 'aleykumselam', 'selamunaleykum', 'selaminaleykum'))
    return 'salam';
  if (has('gunler')) return 'day';
  if (has('good') && has('morning')) return 'morning';
  if (has('good') && has('evening')) return 'evening';
  if (has('good') && has('night')) return 'night';
  if (has('aksamlar')) return 'evening';
  if (has('geceler')) return 'night';
  if (has('gunaydin')) return 'morning';
  if (
    any('selam', 'selamlar', 'merhaba', 'merhabalar', 'mrb', 'slm', 'hey', 'hosgeldin', 'iyiyim') ||
    any('hello', 'helo', 'hi', 'hii', 'heyy', 'yo', 'hola') ||
    (has('kolay') && has('gelsin')) ||
    (has('iyi') && has('calismalar'))
  ) {
    return 'hello';
  }
  return null;
}

function greetReply(kind: GreetKind, text: string, t: AssistantDeps['t']): string {
  return kind === 'hello'
    ? variant(t, 'chat.hello', 4, text, cityExamples())
    : variant(t, `chat.greet.${kind}`, 2, text);
}

/** A greeting that opens a conversation (not thanks or goodbye). */
const isHello = (k: GreetKind | null): boolean => k !== null && k !== 'thanks' && k !== 'bye';

const greetingFacts = (deps: AssistantDeps): AiReplyFacts => ({
  daypart: daypartOf(istanbulClock(deps.now ?? new Date()).minutes),
});

/** The two jobs; each is sent as a message, so the existing flow (and its "where?" ask) takes over. */
function greetChips(t: AssistantDeps['t']): ChatAction[] {
  return ['chat.greetPark', 'chat.greetFood'].map((key) => {
    const text = t(key);
    return { kind: 'say', label: text, text };
  });
}

/**
 * The AI's own wording for a turn, or null (no AI layer, the router did not answer this message,
 * a timeout, an error, or a text validateReply does not accept): the caller keeps its template.
 */
async function wording(
  kind: AiReplyKind,
  facts: AiReplyFacts,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<string | null> {
  const ai = deps.ai;
  // A routed message words itself; an answer without a router call may use the unused reply of
  // the message that asked. Either way the id's one reply is spent by asking.
  const borrowed = !meta.routed && !meta.replyUsed ? meta.replyId : undefined;
  if (!ai?.reply || (!meta.routed && !borrowed)) return null;
  meta.replyUsed = true;
  const reply = ai.reply;
  const said = await within(
    Promise.resolve().then(() =>
      reply({ userText: meta.text, kind, facts, ...(borrowed ? { messageId: borrowed } : {}) }),
    ),
    REPLY_TIMEOUT_MS,
  );
  const city = activeCity();
  return validateReply(said, facts, { kind, allow: [city.name, ...city.districts] });
}

/** The shown results as the facts of a reply: the first three, only what the app knows to be true. */
function replyItems(cards: ChatCard[], withParking: boolean, deps: AssistantDeps): AiReplyItem[] {
  return cards.slice(0, 3).map((card): AiReplyItem => {
    const item: AiReplyItem = { name: card.name, walkMin: walkMinFromMeters(card.distanceM) };
    if (card.kind === 'parking') {
      if (card.free !== null) item.freeSpots = card.free;
      if (card.open !== 'unknown') item.openNow = card.open === 'open';
      if (deps.parkings.find((p) => p.id === card.id)?.isPaid === false) item.free = true;
      return item;
    }
    if (card.narr && card.narr.open !== 'unknown') item.openNow = card.narr.open === 'open';
    // Food and parking are separate jobs: the car park is part of the facts only when it was asked for.
    if (withParking) {
      if (card.parkingM != null) item.parkWalkMin = walkMinFromMeters(card.parkingM);
      if (card.narr?.parkingFree != null) item.freeSpots = card.narr.parkingFree;
      if (card.narr?.parkingPaid === false) item.free = true;
    }
    return item;
  });
}

/** Lets the AI reword the template sentence(s) of a reply; the cards, notes and chips stay as built. */
async function wordReply(reply: BotMessage, deps: AssistantDeps, meta: AnswerMeta): Promise<void> {
  const spec = reply.aiReply;
  if (!spec) return;
  const withParking = spec.facts.requireParking === true || spec.facts.freeOnly === true;
  const items = spec.kind === 'none_found' ? [] : replyItems(reply.cards, withParking, deps);
  const facts: AiReplyFacts = { ...spec.facts, ...(items.length > 0 ? { items } : {}) };
  const said = await wording(spec.kind, facts, deps, meta);
  const at = said ? reply.text.indexOf(spec.template) : -1;
  if (!said || at < 0) return;
  reply.text = reply.text.slice(0, at) + said + reply.text.slice(at + spec.template.length);
  reply.sparkle = true;
}

/** "Sence", "sen seç", "fark etmez": the user hands the choice to the bot (folded phrases). */
const REPLY_PHRASES = new Set([
  'sence',
  'sen sec',
  'sen bil',
  'fark etmez',
  'farketmez',
  'ne dersin',
  'sen ne dersin',
  'ne onerirsin',
  'sen ne onerirsin',
  'hangisi',
  'hangisi iyi',
  'hangisi daha iyi',
  'sana kalmis',
  'bilmiyorum',
  'karar veremedim',
]);
const REPLY_FILLER = new Set([
  'ya',
  'peki',
  'hocam',
  'abi',
  'abla',
  'kanka',
  'dostum',
  'yani',
  'canim',
]);

function isReplyWord(folded: string): boolean {
  return REPLY_PHRASES.has(
    folded
      .split(' ')
      .filter((w) => w && !REPLY_FILLER.has(w))
      .join(' '),
  );
}

/** Words that make a sentence talk about the conversation, not about a food or a place. */
const CONVO_STRONG = new Set([
  'yani',
  'neden',
  'niye',
  'anlamadim',
  'anlamiyorum',
  'anlayamadim',
  'ciddi',
  'gercekten',
]);
const CONVO_WEAK = new Set([
  'mi',
  'mu',
  'misin',
  'musun',
  'misiniz',
  'emin',
  'tamam',
  'olur',
  'evet',
  'hayir',
  'tmm',
  'peki',
]);
/** Verb stems of "gireceğime", "gitmek", "bulamadım", "yapıyor", "dedin" (not "bulvar"). */
const CONVO_VERB = /^(gir|git|gid|bul|yap|dedi|dedim|diyor|demek|anla)/;

/** How a conversational sentence is answered when no AI reply is available. */
type ConvoKind = 'doubt' | 'howto' | 'generic';

function convoKind(folded: string): ConvoKind {
  const toks = folded.split(' ');
  if (toks.some((w) => ['emin', 'ciddi', 'gercekten'].includes(w))) return 'doubt';
  if (
    toks.some((w) => ['anlamadim', 'anlamiyorum', 'anlayamadim'].includes(w)) ||
    (toks.includes('nasil') && toks.includes('yani'))
  ) {
    return 'howto';
  }
  return 'generic';
}

/**
 * Conversational: no food, place or category was recognised and the words are about the chat
 * itself ("emin misin", "nasıl yani", "bir yere gireceğime ..."). A restaurant or place that is
 * really called that is no chit-chat, unless a strong word says so.
 */
function isConversational(text: string, it: QueryIntent, wishes: Wish[]): boolean {
  if (it.kind !== 'search') return false;
  if (it.cat || it.dish || it.food || it.district || it.nearMe || it.mentionsParking) return false;
  if (wishes.length > 0 || !it.placeQuery) return false;
  const toks = fold(text).split(' ').filter(Boolean);
  const qWords = it.placeQuery.split(' ').filter(Boolean);
  // A place or restaurant that is really called that ("Girne", "Bulgurlu", "Mado").
  const named = () => {
    const hit = searchPlacesStrict(it.placeQuery, 1)[0];
    if (hit && qWords.every((w) => hasWordStart(fold(hit.name), w))) return true;
    return allRestaurants(true).some((r) => qWords.every((w) => hasWordStart(fold(r.name), w)));
  };
  if (toks.some((w) => CONVO_STRONG.has(w))) return true;
  // A verb stem ("gireceğime", "bulamadım") is chit-chat, unless a name only starts like one.
  const verb = toks.some((w) => CONVO_VERB.test(w) && !w.startsWith('bulvar'));
  const weak = toks.filter((w) => CONVO_WEAK.has(w)).length;
  if (!verb && weak === 0) return false;
  if (weak >= 2) return true;
  // One weak word ("Mado var mı") or a verb stem: chit-chat only when nothing is called that.
  return !named();
}

/** Folded text of the pure "sen seç" family, and the rule or AI pick among the last cards. */
async function answerReplyWord(
  ctx: ChatContext,
  deps: AssistantDeps,
  useAi = true,
): Promise<Result> {
  const { t } = deps;
  const cards = ctx.lastCards ?? [];
  if (cards.length < 2) {
    return plain(
      {
        text: t('chat.askWhat'),
        cards: [],
        actions: [say(t, 'chat.exNear'), say(t, 'chat.exKofte'), say(t, 'chat.exAlsancak')],
      },
      ctx,
    );
  }
  let notice: string | undefined;
  if (deps.ai && useAi) {
    const res = await pickFromCards(cards, ctx.query ?? '', ctx, deps);
    if (res.reply.cards.length > 0) return res;
    notice = res.reply.notice;
  }
  const reply = rulePick(cards, ctx, deps);
  if (notice) reply.notice = notice;
  return plain(reply, { ...ctx, lastCards: reply.cards });
}

/** The top-ranked card, with only the reasons our own data proves; says it is the rule choice. */
function rulePick(cards: ChatCard[], ctx: ChatContext, deps: AssistantDeps): BotMessage {
  const { t } = deps;
  const food = cards.some((c) => c.kind === 'restaurant');
  let name: string;
  let reasons: string[];
  if (food) {
    const rest = cards.filter(
      (c): c is Extract<ChatCard, { kind: 'restaurant' }> => c.kind === 'restaurant',
    );
    const cands = rest.slice(0, MAX_CANDIDATES).map(pickCandidate);
    const top = cands[0]!;
    name = rest[0]!.name;
    const dish = ctx.dish ?? '';
    reasons = PICK_REASONS.filter(
      (c) => (c !== 'dish_named' || dish !== '') && pickReasonHolds(c, top, cands),
    )
      .slice(0, MAX_REASONS)
      .map((c) => reasonText(c, top, dish, t));
  } else {
    const now = deps.now ?? new Date();
    const rest: { card: Extract<ChatCard, { kind: 'parking' }>; p: Parking }[] = [];
    for (const card of cards) {
      if (card.kind !== 'parking' || rest.length >= MAX_CANDIDATES) continue;
      const p = deps.parkings.find((x) => x.id === card.id);
      if (p) rest.push({ card, p });
    }
    const cands: ParkPickCandidate[] = rest.map(({ card, p }, i) => ({
      i,
      kind: 'parking',
      walkMin: walkMinFromMeters(card.distanceM),
      distM: distMOf(card.distanceM),
      openState: parkOpenAt(p, now, now),
      nonstop: p.nonstop === true,
      free: p.isPaid === null ? null : !p.isPaid,
      tariffKnown: tariffFor(p.id) !== null,
      covered: p.isIndoor,
      freeSpots: freshFree(p, now),
      nearRail: isNearRail(p),
      capacity: p.capacity,
    }));
    const top = cands[0];
    name = rest[0]?.card.name ?? cards[0]!.name;
    reasons = top
      ? PARK_REASONS.filter((c) => parkReasonHolds(c, top, cands))
          .slice(0, MAX_REASONS)
          .map((c) =>
            t(`chat.whyPark.${c === 'closest' && top.walkMin > FAR_WALK_MIN ? 'closestFar' : c}`, {
              count:
                c === 'closest' ? top.walkMin : c === 'big_capacity' ? top.capacity : top.freeSpots,
            }),
          )
      : [];
  }
  return {
    text:
      reasons.length > 0
        ? t('chat.pickRule', { name, reasons: reasons.join(', ') })
        : t(
            food && !cards.some((c) => c.kind === 'restaurant' && c.parkAsked)
              ? 'chat.pickRuleNonePlain'
              : 'chat.pickRuleNone',
            { name },
          ),
    cards,
    actions: [],
  };
}

/**
 * The router said "chat": its words are shown only when they pass validateFreeText (zone 'chat');
 * its action is a code that rule code carries out. Null when the reply is not valid: the caller
 * then uses its own template.
 */
async function chatFromRouter(
  res: { reply: string; action: ChatReplyAction },
  ctx: ChatContext,
  deps: AssistantDeps,
): Promise<Result | null> {
  const { t } = deps;
  const cards = ctx.lastCards ?? [];
  const said = validateFreeText(
    'chat',
    res.reply,
    textContext(deps, ctx.place ?? activeCity().center, cards),
  );
  if (!said) return null;
  if (res.action === 'pick_from_last' && cards.length >= 2) {
    // Same message id as the router call: the pick costs no further use.
    const picked = await answerReplyWord(ctx, deps);
    return {
      reply: { ...picked.reply, text: `${said}\n${picked.reply.text}`, sparkle: true },
      ctx: picked.ctx,
    };
  }
  const actions =
    res.action === 'ask_food_or_park' || res.action === 'pick_from_last'
      ? [say(t, 'chat.exNear'), say(t, 'chat.exKofte'), say(t, 'chat.exAlsancak')]
      : examples(ctx.section, t);
  return plain({ text: said, cards: [], actions, sparkle: true }, ctx);
}

/** The promise's value, or null when it fails or takes longer than `ms`. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p.catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

type Routed =
  | { kind: 'search'; value: Extract<Understanding, { kind: 'search' }> }
  | { kind: 'chat'; value: { reply: string; action: ChatReplyAction } }
  // The AI read the message and could not tell what is wanted.
  | { kind: 'unknown' }
  | { kind: 'none' };

/**
 * The router. With the AI layer on and uses left, every new message is sent to Haiku first (one
 * call, a ROUTER_TIMEOUT_MS wait at most). 'none' means the rules answer: unknown, a timeout, an
 * error, no uses left, or no AI layer. A notice is set when the daily uses are (about to be) gone.
 */
async function route(
  text: string,
  ctx: ChatContext,
  deps: AssistantDeps,
): Promise<{ out: Routed; notice?: string }> {
  const ai = deps.ai;
  const none: Routed = { kind: 'none' };
  if (!ai) return { out: none };
  const { t } = deps;
  if ((ai.usesLeft?.() ?? 1) <= 0) {
    return { out: none, ...(ai.quotaNotice() ? { notice: t('chat.sparkleOut') } : {}) };
  }
  const cards = ctx.lastCards ?? [];
  const kind = cards.some((c) => c.kind === 'restaurant') ? 'restaurant' : 'parking';
  const res = await within(
    Promise.resolve().then(() =>
      ai.understand(
        text,
        cards.length > 0 ? { count: Math.min(cards.length, MAX_CARDS), kind } : undefined,
      ),
    ),
    ROUTER_TIMEOUT_MS,
  );
  // The router was tried and failed: say so, honestly and not on every message.
  const failed = (key: 'chat.aiLate' | 'chat.aiDown') => ({
    out: none,
    ...((ai.failNotice?.() ?? true) ? { notice: t(key) } : {}),
  });
  if (!res) return failed('chat.aiLate');
  if (!res.ok) {
    if (res.reason === 'quota') {
      return { out: none, ...(ai.quotaNotice() ? { notice: t('chat.sparkleOut') } : {}) };
    }
    if (res.reason === 'off') return { out: none };
    return failed(res.detail === 'timeout' ? 'chat.aiLate' : 'chat.aiDown');
  }
  const notice = res.remaining === 0 && ai.quotaNotice() ? { notice: t('chat.sparkleLast') } : {};
  const v = res.value;
  if (v.kind === 'search') return { out: { kind: 'search', value: v }, ...notice };
  if (v.kind === 'chat') return { out: { kind: 'chat', value: v }, ...notice };
  return { out: { kind: 'unknown' }, ...notice };
}

export async function answer(
  typed: string,
  ctx: ChatContext,
  deps: AssistantDeps,
): Promise<Result> {
  // The rules read what the AI reads: the first MAX_MESSAGE_CHARS (a long paste would also block
  // the JS thread while it is parsed).
  const text = clipText(typed, MAX_MESSAGE_CHARS);
  // What the question Yerim asked last left behind lasts one answer only.
  const { clarifyWishes, replyId, parkAsk, ...rest } = ctx;
  ctx = rest;
  // "Arabayla mı gidiyorsun?": a yes / no answer needs no router call, like a tapped chip.
  const parkWish = parkAsk ? parkAnswer(text) : null;
  if (parkAsk && parkWish) return answerParkAsk(parkAsk, parkWish, ctx, deps, text);
  const meta: AnswerMeta = {
    text,
    wishes: wishesIn(text),
    ai: null,
    planWhen: null,
    quotaOut: false,
    ...(clarifyWishes ? { carried: clarifyWishes } : {}),
    ...(deps.ai?.messageId ? { messageId: deps.ai.messageId() } : {}),
    ...(replyId ? { replyId } : {}),
  };
  // A typed answer to the question Yerim just asked ("balık", "hepsi") works like its chip: no
  // router call, the same search.
  const picked = ctx.ask ? choiceAnswer(text, ctx) : null;
  if (picked) {
    const res = await run({ ...ctx, ask: undefined, choice: picked }, deps, text);
    return remember(
      await finishAnswer(res, deps, { ...meta, wishes: ctx.wishes ?? [], quotaOut: true }),
    );
  }
  const res = await answerText(text, { ...ctx, ask: undefined }, deps, meta);
  return remember(await finishAnswer(res, deps, meta));
}

/** Folded words of a short yes / no answer to the "are you driving?" question. */
const PARK_YES = new Set([
  'evet',
  'olur',
  'tamam',
  'tmm',
  'ok',
  'okay',
  'okey',
  'yes',
  'yeah',
  'yep',
  'isterim',
  'goster',
  'gostersene',
  'arabayla',
  'arabayim',
]);
const PARK_NO = new Set([
  'hayir',
  'yok',
  'istemiyorum',
  'istemem',
  'gerek',
  'degil',
  'olmaz',
  'no',
  'nope',
  'yuruyerek',
  'yururum',
  'yaya',
]);
/** Words that may stand around the answer ("Evet, otopark göster", "Hayır, yol tarifini aç"). */
const PARK_FILLER = new Set([
  'otopark',
  'otoparki',
  'otoparklari',
  'otoparklar',
  'gidiyorum',
  'gidecegim',
  'yol',
  'tarifini',
  'tarifi',
  'ac',
  'ver',
  'lutfen',
  'peki',
  'ya',
  'hocam',
  'abi',
  'abla',
  'bakalim',
  'bi',
  'bir',
  'de',
  'da',
]);

/** A typed answer to the parking question: 'yes', 'no', or null when it is something else. */
function parkAnswer(text: string): 'yes' | 'no' | null {
  const toks = fold(text).split(' ').filter(Boolean);
  if (toks.length === 0 || toks.length > 6) return null;
  if (!toks.every((w) => PARK_YES.has(w) || PARK_NO.has(w) || PARK_FILLER.has(w))) return null;
  const yes = toks.some((w) => PARK_YES.has(w));
  const no = toks.some((w) => PARK_NO.has(w));
  return yes === no ? null : yes ? 'yes' : 'no';
}

/**
 * "Yol tarifi" on a food card of a chat whose ask did not include parking: Yerim asks first
 * whether the user drives and wants the car parks near the restaurant. Nothing is opened yet.
 */
export function askParking(
  card: Extract<ChatCard, { kind: 'restaurant' }>,
  ctx: ChatContext,
  deps: AssistantDeps,
): Result {
  const { t } = deps;
  const r = getRestaurant(card.id);
  if (!r) return plain({ text: t('chat.error'), cards: [], actions: [] }, ctx);
  const yes = t('chat.parkAskYes');
  const no = t('chat.parkAskNo');
  return plain(
    {
      text: t('chat.parkAsk', { name: r.name }),
      cards: [],
      actions: [
        { kind: 'say', label: yes, text: yes },
        { kind: 'say', label: no, text: no },
      ],
    },
    { ...ctx, parkAsk: { id: r.id, name: r.name, lat: r.lat, lng: r.lng } },
  );
}

/** Yes: the car parks near that restaurant. No: directions to it at once, with a short send-off. */
async function answerParkAsk(
  ask: NonNullable<ChatContext['parkAsk']>,
  wish: 'yes' | 'no',
  ctx: ChatContext,
  deps: AssistantDeps,
  text: string,
): Promise<Result> {
  const { t } = deps;
  if (wish === 'no') {
    return plain(
      {
        text: variant(t, 'chat.parkAskGo', 3, ask.id, { name: ask.name }),
        cards: [],
        actions: [],
        directions: { lat: ask.lat, lng: ask.lng, name: ask.name },
      },
      ctx,
    );
  }
  const near: ChatContext = {
    ...ctx,
    section: 'park',
    place: { label: ask.name, lat: ask.lat, lng: ask.lng },
    requireParking: false,
    freeParking: false,
    parkM: 300,
    wide: false,
    sort: 'parkEase',
    wishes: undefined,
    when: undefined,
    ask: undefined,
    choice: undefined,
  };
  return remember(await run(near, deps, text));
}

/** The member (or 'all') a typed answer picks from the question in `ctx.ask`, or null. */
function choiceAnswer(text: string, ctx: ChatContext): ChatContext['choice'] | null {
  const entry = ctx.ask ? choiceById(ctx.ask) : undefined;
  const hit = entry ? memberForAnswer(entry, fold(text)) : null;
  if (!entry || !hit) return null;
  return { id: entry.id, member: hit === 'all' ? 'all' : hit.id };
}

/** The reply's cards are what "sence" / "sen seç" refer to next. */
function remember(r: Result): Result {
  // The pick's wider pool never leaves the assistant (it is not shown and not stored).
  const { pool: _pool, explained: _explained, aiReply: _aiReply, ...reply } = r.reply;
  return {
    reply,
    ctx: { ...r.ctx, lastCards: r.reply.cards.length > 0 ? r.reply.cards : undefined },
  };
}

async function answerText(
  text: string,
  ctx: ChatContext,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<Result> {
  const { t } = deps;
  const foldedText = fold(text);
  // With AI uses left, every new message goes to Haiku first (the router). It answers with a
  // search (the rules run it below), a chat reply, or unknown; anything else is the rule path.
  const routed = await route(text, ctx, deps);
  let notice = routed.notice;
  const withNotice = (r: Result): Result =>
    notice && !r.reply.notice ? { ...r, reply: { ...r.reply, notice } } : r;
  const offTopicActions = () => [
    say(t, 'chat.exStadium'),
    say(t, 'chat.exNear'),
    say(t, 'chat.exKofte'),
  ];
  // The router ran or was not available: no second AI call for this message, except the pick /
  // plan of a search, which share the router call's message id.
  if (routed.out.kind !== 'search') meta.quotaOut = true;
  meta.routed = routed.out.kind !== 'none';
  let chatInvalid = false;
  if (routed.out.kind === 'chat') {
    // A hello: the AI words the greeting itself and offers the two jobs as chips.
    if (isHello(greetKind(foldedText))) {
      const hello = await wording('greeting', greetingFacts(deps), deps, meta);
      if (hello) {
        meta.settled = true;
        return withNotice(
          plain({ text: hello, cards: [], actions: greetChips(t), sparkle: true }, ctx),
        );
      }
    }
    const said = await chatFromRouter(routed.out.value, ctx, deps);
    if (said) {
      meta.settled = true;
      return withNotice(said);
    }
    // An unusable reply: the templates below answer.
    chatInvalid = true;
  }
  // A pure greeting, thanks or goodbye is answered in kind.
  const greet = greetKind(foldedText);
  if (greet) {
    meta.settled = true;
    return withNotice(
      plain(
        { text: greetReply(greet, text, t), cards: [], actions: examples(ctx.section, t) },
        ctx,
      ),
    );
  }
  // "Sence", "sen seç": the user hands the choice over; no search, no place lookup.
  if (isReplyWord(foldedText)) {
    meta.settled = true;
    return withNotice(await answerReplyWord(ctx, deps, !meta.quotaOut));
  }

  meta.planWhen = planWhenIn(text) ?? (parkTripIn(text) ? 'now' : null);
  let it = parseQuery(meta.planWhen ? withoutPlanWords(text) || text : text);

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
      const first = res.reply.cards[0];
      // "Sorted nearest first" is no lead for a list that starts over FAR_WALK_MIN minutes away.
      const farList = !!first && walkMinFromMeters(first.distanceM) > FAR_WALK_MIN;
      if (
        f.kind !== 'freePark' &&
        res.reply.cards.length > 0 &&
        !(f.kind === 'nearer' && farList)
      ) {
        res.reply.text = `${t(lead)} ${res.reply.text}`;
      }
      return withNotice(res);
    }
  }

  // The AI read the message and could not tell what is wanted: say so instead of guessing with
  // the rules (a guess shows unrelated places). Abuse keeps its own calm answer below.
  if (routed.out.kind === 'unknown' && !followUp && it.kind !== 'abuse') {
    meta.settled = true;
    return withNotice(
      plain(
        {
          text: variant(t, 'chat.unknown', 2, text, cityExamples()),
          cards: [],
          actions: examples(ctx.section, t),
        },
        ctx,
      ),
    );
  }

  // Talk about the conversation itself ("emin misin yani"): never a dish-or-place question.
  const convo = !followUp && isConversational(text, it, meta.wishes);
  // The router called it chat but its reply did not pass: the honest template, not a search.
  if (chatInvalid && !convo && it.kind !== 'abuse' && it.kind !== 'greeting') {
    return withNotice(
      plain(
        { text: variant(t, 'chat.offTopic', 2, text), cards: [], actions: offTopicActions() },
        ctx,
      ),
    );
  }
  // The router said search: the AI's reading is the search (aiLedIntent), also for words the rules
  // take for gibberish ("KFC nerede"). Follow-ups and abuse stay with the rules; so does
  // everything when the AI could not answer.
  if (routed.out.kind === 'search' && !followUp && it.kind !== 'abuse') {
    // The district against the city's own list: a typo fixed, a quarter moved to place.
    const found = settleDistrict(
      routed.out.value,
      text,
      activeCity().districts,
      quartersOf(activeCity().id),
      deps.ai?.earlier?.() ?? [],
    );
    it = aiLedIntent(it, intentFromUnderstanding(found, text), found);
    meta.ai = found;
    meta.wishes = [...new Set([...meta.wishes, ...(found.wishes ?? [])])];
    if ((found.partySize ?? 0) >= 3 && !meta.wishes.includes('group')) {
      meta.wishes.push('group');
    }
    meta.planWhen = found.plan?.when ?? meta.planWhen;
  }

  // The answer to a clarify question about a goal ("fit menü" -> "Yakınımda") keeps the goal.
  if (
    meta.carried &&
    it.kind === 'search' &&
    ctx.section === 'food' &&
    !it.cat &&
    !it.dish &&
    !it.requireParking
  ) {
    meta.wishes = [...new Set([...meta.wishes, ...meta.carried])];
  }
  // A goal said inside a food conversation ("onu boşver kaslıyım", "aslında fit bir şey olsun") is
  // a new ask: the dish and category of the conversation (which the router keeps on a follow-up)
  // go, the place stays. A dish or category the message itself names stays.
  if (
    it.kind === 'search' &&
    (ctx.cat || ctx.dish) &&
    !hasNoDataWish(meta.wishes) &&
    askEntryFor(meta.wishes)?.goal
  ) {
    const typed = parseQuery(text);
    if (!(typed.kind === 'search' && (typed.cat || typed.dish))) {
      const keepCat = !!it.cat && it.cat !== ctx.cat;
      const keepDish = !!it.dish && it.dish !== ctx.dish;
      it = {
        ...it,
        cat: keepCat ? it.cat : null,
        dish: keepDish ? it.dish : null,
        dishServes: keepDish ? (it.dishServes ?? null) : null,
        food: true,
      };
    }
  }

  // A goal or mood alone ("kaslıyım", "fit menü", "hızlı bir şey") is a food ask; its words are no place.
  if (it.kind === 'search' && followUp?.kind !== 'elsewhere') {
    it = goalAsFood(it, meta.wishes, ctx.section === 'food');
  }

  const aiAdded =
    !!meta.ai &&
    !!(
      meta.ai.cat ||
      meta.ai.dish ||
      meta.ai.district ||
      meta.ai.place ||
      meta.ai.food ||
      meta.ai.nearMe ||
      meta.ai.requireParking
    );
  if (convo && !aiAdded) {
    const kind = convoKind(foldedText);
    return withNotice(
      plain(
        {
          text:
            kind === 'doubt'
              ? t('chat.convoDoubt')
              : kind === 'howto'
                ? t('chat.convoHowTo', cityExamples())
                : variant(t, 'chat.offTopic', 2, text),
          cards: [],
          actions: kind === 'generic' ? offTopicActions() : examples(ctx.section, t),
        },
        ctx,
      ),
    );
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
    return withNotice(
      plain(
        {
          text: variant(t, 'chat.hello', 4, text, cityExamples()),
          cards: [],
          actions: examples(ctx.section, t),
        },
        ctx,
      ),
    );
  }
  if (it.kind === 'abuse') {
    return plain({ text: t('chat.calm_0'), cards: [], actions: examples(ctx.section, t) }, ctx);
  }
  // 'gibberish' (too short / no vowel) the AI did not read as a search: ask again, no search.
  if (it.kind === 'empty' || it.kind === 'gibberish') {
    return withNotice(
      plain(
        {
          text: variant(t, 'chat.unknown', 2, text, cityExamples()),
          cards: [],
          actions: [pickOnMap(text, t, ctx), ...examples(ctx.section, t)],
        },
        ctx,
      ),
    );
  }

  const folded = fold(text);
  // The start of a restaurant's name ("Köfteci Yusuf", "Tire Köftecisi"): those places, wherever
  // they are. Not when the words are only a dish our data knows ("adana kebap", "çiğ köfte"): the
  // dish search finds the places nearby that serve it, whatever a far business is called.
  const knownDish =
    it.kind === 'search' &&
    !it.placeQuery &&
    !!it.dish &&
    dishProfile(fold(it.dish), false) !== null;
  if (!knownDish && folded.split(' ').length >= 2) {
    const matches = allRestaurants(true).filter((r) => fold(r.name).startsWith(folded));
    const first = matches[0];
    if (first) {
      const target: LatLng = ctx.place ?? (await deps.here()) ?? activeCity().center;
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
        ...(ctx.requireParking ? { parkAsked: true as const } : {}),
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
      const nameText = foundNameReply(first.name, matches.length, t, text, i18n.language);
      const found: BotMessage = {
        text: nameText,
        cards,
        actions,
        aiReply: {
          kind: 'name',
          facts: {
            what: first.name,
            count: matches.length,
            ...(ctx.place ? { where: ctx.place.label } : {}),
          },
          template: nameText,
        },
      };
      return withNotice(plain(found, ctx));
    }
  }

  // A district plus a word nothing explained: never show the district's places as if the word
  // had been understood. With the AI, only the place it named counts (its own reading).
  const left = districtLeftover(it, text);
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
          ? pickOnMap(text, t, ctx)
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
          label: t('chat.actDistrictFood', {
            inDistrict: inDistrict(district.name, true),
            district: district.name,
          }),
          patch: { section: 'food', cat: null, dish: null, dishServes: null, place: here },
        },
      ];
      return withNotice(
        plain(
          {
            text: t('chat.districtUnknownThing', {
              inDistrict: inDistrict(district.name),
              district: district.name,
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
  // A new food search drops the kind picked before.
  if (it.cat || it.food || it.dish) next.choice = undefined;
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
  // The AI read the whole conversation: for a food search its reading also drops an exclusion or
  // the parking need said before ("kebap da olur", "otopark şart değil").
  if (meta.ai && (it.cat || it.food)) {
    next.notCat = it.notCat ?? null;
    next.requireParking = it.requireParking;
  }

  if (it.district) {
    // The AI named a place in the district as well ("Alsancak'ta balık"): search there, not at
    // the district's centre.
    const aiPlace =
      left?.kind !== 'place' && meta.ai?.place && it.placeQuery
        ? placeInDistrict(it.placeQuery, it.district)
        : null;
    next.place =
      left?.kind === 'place'
        ? left.place
        : (aiPlace ?? { label: it.district.name, lat: it.district.lat, lng: it.district.lng });
  } else if (it.placeQuery) {
    const typedRaw = typedPlaceText(text, it.placeQuery);
    // One to three unknown words: maybe a dish rather than a place. Not when the food is already
    // named ("Çukurcuma civarında kahvaltı"): then the words are the place.
    const qWords = it.placeQuery.split(' ').filter(Boolean);
    const maybeDish =
      !it.cat &&
      !it.dish &&
      qWords.length <= 3 &&
      it.placeQuery.length >= 4 &&
      !qWords.some((w) => PLACE_WORDS.some((p) => w.startsWith(p)));
    const h = searchPlacesStrict(it.placeQuery, 1)[0];
    // A place hit that does not carry the words in its name is only a fuzzy guess.
    const weakHit = !!h && !qWords.every((w) => hasWordStart(fold(h.name), w));
    if (maybeDish && (!h || weakHit)) {
      const from: LatLng = ctx.place ?? (await deps.here()) ?? activeCity().center;
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
    // The AI named a place we only know under a longer name ("Bebek" -> "Bebek Parkı" in İzmir):
    // ask before searching there; the chip sends the full name back, which then matches exactly.
    if (
      h &&
      meta.ai?.place &&
      meta.ai.clarify?.ask !== 'place' &&
      fold(h.name) !== fold(it.placeQuery)
    ) {
      return withNotice(
        await clarify('place', next, it.food, deps, {
          ...meta,
          ai: { ...meta.ai, place: h.name, clarify: { ask: 'place', text: null } },
        }),
      );
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
                  pickOnMap(text, t, ctx),
                ],
              },
              ctx,
            ),
          );
        }

        // 1. A dish or cuisine the user named: show restaurants matching it (a named category
        // makes the words a place: 1b below).
        const hasAll = (hay: string) => qWords.every((w) => hasWordStart(hay, w));
        const named = it.cat
          ? []
          : allRestaurants(true).filter(
              (r) =>
                hasAll(fold(r.name)) || r.cuisines.some((c) => hasAll(fold(c.replace(/_/g, ' ')))),
            );
        if (named.length > 0) {
          const target: LatLng = ctx.place ?? (await deps.here()) ?? activeCity().center;
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
            ...(ctx.requireParking ? { parkAsked: true as const } : {}),
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
                  pickOnMap(text, t, { section: 'food', cat: null }),
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
              actions: [pickOnMap(text, t, next), ...examples(next.section, t)],
            },
            ctx,
          ),
        );
      }
      // The place words, not the whole message: the AI's place as it wrote it, or the typed words.
      const shown = meta.ai?.place?.trim() || typedRaw;
      next.place = {
        label: shown.charAt(0).toLocaleUpperCase('tr') + shown.slice(1),
        lat: p.lat,
        lng: p.lng,
      };
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
      (ask === 'duration' && next.section === 'park') ||
      // A word that may be a place or not ("bebek", "kas"): ask before searching anywhere.
      (ask === 'place' && !!(meta.ai?.place ?? meta.ai?.district)))
  ) {
    return withNotice(await clarify(ask, next, it.food, deps, meta));
  }

  const question = await choiceQuestion(next, it, foldedText, deps, meta);
  if (question.kind === 'asked') return withNotice(question.result);
  return withNotice(await run(question.ctx, deps, text, it.quality, meta));
}

export async function refine(
  ctx: ChatContext,
  patch: Partial<ChatContext>,
  deps: AssistantDeps,
): Promise<Result> {
  // A chip answers the question: what the question left behind is spent.
  const { clarifyWishes: _wishes, replyId: _replyId, ...kept } = ctx;
  return remember(await run({ ...kept, ...patch }, deps, JSON.stringify(patch), false));
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
      ...(deps.ai ? { query: requestText(meta) } : {}),
      ...(meta.wishes.includes('quick') ? { sort: 'distance' as const } : {}),
    };
  }

  // A goal that reaches a plain food search without a picked kind is never an unfiltered list
  // (pastane first for "fit"): it is the "Hepsi" mix of its entry.
  if (ctx.section === 'food' && !ctx.cat && !ctx.dish && !ctx.choice) {
    const wishes = ctx.wishes ?? [];
    const entry = hasNoDataWish(wishes) ? undefined : askEntryFor(wishes);
    if (entry) ctx = { ...ctx, choice: { id: entry.id, member: 'all' } };
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
      target = activeCity().center;
      where = t('chat.center', { city: activeCity().name });
    }
  }

  // Parking was asked for: a parking word / chip, or a plan ("Park, walk, eat") that will be asked.
  const parkAsked =
    ctx.requireParking ||
    ctx.freeParking ||
    (!!meta?.planWhen && !meta.quotaOut && !!deps.ai?.plan);
  const reply =
    ctx.section === 'food'
      ? runFood(ctx, deps, seed, quality, target, where, now, parkAsked)
      : runPark(ctx, deps, seed, target, where, now);
  return { reply, ctx };
}

/** Card facts: only what the app itself would show as true. */
function cardNarr(row: RestaurantRow, deps: AssistantDeps, now: Date, hit?: DishHit): CardNarr {
  const r = row.r;
  const catKey = categoryOf(r);
  // deps.t is the plain i18n function; cuisineLabels wants i18next's TFunction type.
  const tf = deps.t as Parameters<typeof cuisineLabels>[1];
  const cuisine = cuisineLabels(r.cuisines, tf)[0];
  const label = cuisine ?? (catKey ? deps.t(`food.cats.${catKey}`) : '');
  // A category that is only the AI's estimate says so (a cuisine tag is data, no marker).
  const marked =
    !cuisine && label && isEstimatedKind(r) ? `${label} (${deps.t('food.estimatedKind')})` : label;
  const near = row.parking ? nearestParking(r, deps.parkings) : null;
  return {
    ...(label && label.length <= 20 ? { cat: marked } : {}),
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

/**
 * How a place fits a searched dish: 1 = the name or cuisine says it, 2 = it very likely serves it.
 * `common` (tier 2 only) is the shop type that usually also has the dish, not a specialist.
 */
type DishHit = { tier: 1 | 2; byName: boolean; common?: string };

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
    if (!profile) return null;
    if (likelyServes(profile, n, r.cuisines)) return { tier: 2, byName: false };
    const common = commonShop(profile, n);
    return common ? { tier: 2, byName: false, common } : null;
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
    .map((row, i) => ({
      row,
      i,
      tier: hits.get(row.r.id)?.tier ?? 0,
      common: hits.get(row.r.id)?.common ? 1 : 0,
      s: score(row),
    }))
    .sort((a, b) => a.tier - b.tier || a.common - b.common || b.s - a.s || a.i - b.i)
    .map((x) => x.row);
}

// --- Broad ask -> choices (choices.ts) -----------------------------------------------------------

/** A wish no entry covers and the app has no data for ("romantik", "manzaralı"): the honest note stays. */
function hasNoDataWish(wishes: Wish[]): boolean {
  return wishes.some((w) => w in NO_DATA_TOPIC && !CHOICES.some((e) => e.wishes?.includes(w)));
}

/** A goal or mood said alone ("kaslıyım", "fit menü", "hızlı bir şey") is a food ask; its words are no place. */
function goalAsFood(
  it: Extract<QueryIntent, { kind: 'search' }>,
  wishes: Wish[],
  inFoodChat: boolean,
): Extract<QueryIntent, { kind: 'search' }> {
  const entry = askEntryFor(wishes);
  if (!entry || (it.mentionsParking && !entry.goal) || hasNoDataWish(wishes)) return it;
  const words = it.placeQuery.split(' ').filter((w) => w && !isQualifierWord(w));
  const pq = words.join(' ');
  if (it.cat || it.dish) {
    // "fit balık", "proteinli kahvaltı": the goal's words are not part of the place either.
    return entry.goal ? { ...it, placeQuery: pq, uncertain: pq !== '' && it.uncertain } : it;
  }
  // Quick / cheap are not food words by themselves: "ucuz otopark" stays a car park ask.
  if (!entry.goal && !inFoodChat && !it.food) return it;
  // Words left over that are no known place ("olduğum ona göre", "menü arıyorum") are not one.
  const isPlace = pq !== '' && searchPlacesStrict(pq, 1).length > 0;
  return { ...it, food: true, placeQuery: isPlace ? pq : '', uncertain: false };
}

/** The members of the picked choice: one, or all of the entry's. */
function activeChoice(ctx: ChatContext): { entry: ChoiceEntry; members: Member[] } | null {
  const entry = ctx.choice ? choiceById(ctx.choice.id) : undefined;
  if (!entry || !ctx.choice) return null;
  if (ctx.choice.member === 'all') return { entry, members: entry.members };
  const one = entry.members.find((m) => m.id === ctx.choice!.member);
  return one ? { entry, members: [one] } : null;
}

/** The entry whose members come first inside a named category / dish ("fit balık"). */
function reorderEntry(ctx: ChatContext): ChoiceEntry | undefined {
  const w = ctx.wishes ?? [];
  return CHOICES.find((e) => e.reorder && e.wishes?.some((x) => w.includes(x)));
}

/** Places of the members around `target`, widening 1 -> 3 -> 6 km until a mix of kinds turns up. */
function choicePool(
  target: LatLng,
  members: Member[],
  wide: boolean,
): { items: NearbyRestaurant[]; radiusM: number } {
  const radii = wide ? WIDE_RADII_M : CATEGORY_RADII_M;
  let items: NearbyRestaurant[] = [];
  let radiusM = radii[0]!;
  for (const r of radii) {
    radiusM = r;
    items = restaurantsNear(target, r, 5000).filter((x) => members.some((m) => inMember(x, m)));
    const kinds = new Set(items.map((x) => memberOf(x, members)?.id));
    if (items.length >= 5 && kinds.size >= Math.min(3, members.length)) break;
  }
  return { items, radiusM };
}

/** Round-robin by member, the members in the order of their nearest place: variety on the first screen. */
function interleave(rows: RestaurantRow[], members: Member[]): RestaurantRow[] {
  const groups = new Map<string, RestaurantRow[]>();
  const rest: RestaurantRow[] = [];
  for (const row of rows) {
    const m = memberOf(row.r, members);
    if (!m) rest.push(row);
    else groups.set(m.id, [...(groups.get(m.id) ?? []), row]);
  }
  const queues = [...groups.values()];
  const out: RestaurantRow[] = [];
  for (let i = 0; out.length < rows.length - rest.length; i++) {
    for (const q of queues) if (q[i]) out.push(q[i]!);
  }
  return [...out, ...rest];
}

/** Rows of a member first, the others after, each in their order. */
function membersFirst(rows: RestaurantRow[], members: Member[]): RestaurantRow[] {
  const mine = rows.filter((row) => memberOf(row.r, members));
  return mine.length === 0 || mine.length === rows.length
    ? rows
    : [...mine, ...rows.filter((row) => !mine.includes(row))];
}

/** How many places of each member lie within reach of the target, members without any left out. */
function presentMembers(entry: ChoiceEntry, target: LatLng): Member[] {
  const around = restaurantsNear(target, CATEGORY_RADII_M[CATEGORY_RADII_M.length - 1]!, 5000);
  return entry.members.filter((m) => around.some((r) => inMember(r, m)));
}

const allChip = (patch: Partial<ChatContext>, t: AssistantDeps['t']): ChatAction => ({
  kind: 'refine',
  label: t('chat.choice.all'),
  patch,
});

/**
 * A goal or mood without a category ("kaslıyım", "fit", "hızlı bir şey", "tatlı bir şey"): Yerim asks
 * which kind first, with one chip per kind that has a place within reach and "Hepsi" last. With one
 * kind only there is nothing to ask: that kind is shown. A category named directly never asks.
 */
async function choiceQuestion(
  next: ChatContext,
  it: QueryIntent,
  foldedText: string,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<{ kind: 'asked'; result: Result } | { kind: 'run'; ctx: ChatContext }> {
  const go = (ctx: ChatContext) => ({ kind: 'run' as const, ctx });
  if (it.kind !== 'search' || next.section !== 'food' || next.notCat) return go(next);
  let entry: ChoiceEntry | undefined;
  if (!next.cat && !next.dish)
    entry = hasNoDataWish(meta.wishes) ? undefined : askEntryFor(meta.wishes);
  else if (next.cat) {
    const e = entryForCat(next.cat);
    const dish = next.dish ? fold(next.dish) : '';
    const namesMember = !!e && e.members.some((m) => m.words.includes(dish));
    if (e?.askWhenVague && isVague(foldedText) && !namesMember) entry = e;
  }
  if (!entry) return go(next);
  const here = (await deps.here()) ?? activeCity().center;
  const target = next.place ?? here;
  const present = presentMembers(entry, target);
  const base: ChatContext = { ...next, cat: null, dish: null, dishServes: null };
  if (present.length < 2) {
    // One kind or none: nothing to choose from, show that kind (or the category) as usual.
    return go(present.length === 1 ? { ...base, choice: { id: entry.id, member: 'all' } } : next);
  }
  const { t } = deps;
  const lang = i18n.language;
  const chips: ChatAction[] = present.map((m) => ({
    kind: 'refine',
    label: memberLabel(m, lang),
    patch: { choice: { id: entry.id, member: m.id }, ask: undefined },
  }));
  chips.push(allChip({ choice: { id: entry.id, member: 'all' }, ask: undefined }, t));
  // The AI may word the question; the chips stay as built.
  const worded = await wording(
    'choice_question',
    { where: next.place?.label, choices: chips.map((c) => c.label) },
    deps,
    meta,
  );
  const ctx: ChatContext = {
    ...base,
    wishes: meta.wishes.length > 0 ? meta.wishes : undefined,
    ...(deps.ai ? { query: requestText(meta) } : {}),
    ...(meta.wishes.includes('quick') ? { sort: 'distance' as const } : {}),
    ...pendingAsk(meta),
    ask: entry.id,
  };
  return {
    kind: 'asked',
    result: plain(
      {
        text: worded ?? t(`chat.choice.ask.${entry.id}`),
        cards: [],
        actions: chips,
        ...(worded ? { sparkle: true } : {}),
      },
      ctx,
    ),
  };
}

/** The honest sentence for a goal: no menu / price data, the kinds shown (up to 3) chosen by type of place. */
function choiceNote(
  entry: ChoiceEntry,
  rows: RestaurantRow[],
  t: AssistantDeps['t'],
): string | null {
  const seen: Member[] = [];
  for (const row of rows) {
    const m = memberOf(row.r, entry.members);
    if (m && !seen.some((x) => x.id === m.id)) seen.push(m);
  }
  if (seen.length === 0) return null;
  const lang = i18n.language;
  const labels = seen.map((m) =>
    memberLabel(m, lang).toLocaleLowerCase(lang.startsWith('en') ? 'en' : 'tr'),
  );
  const list = labels.slice(0, 3).join(', ') + (labels.length > 3 ? '…' : '.');
  return t(`chat.choice.note.${entry.id}`, { list });
}

function runFood(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  quality: boolean,
  target: LatLng,
  where: string,
  now: Date,
  parkAsked: boolean,
): BotMessage {
  const { t } = deps;
  const inCategory = ctx.cat
    ? restaurantsInCategory(target, ctx.cat, undefined, ctx.wide ? WIDE_RADII_M : undefined)
    : null;
  // A kind picked from a choices.ts entry: a mix of kinds (no category), or a narrowing of the category.
  const active = activeChoice(ctx);
  const mix = active && !ctx.cat ? choicePool(target, active.members, ctx.wide) : null;
  const searchRadiusM = mix?.radiusM ?? inCategory?.radiusM ?? (ctx.wide ? 15000 : 1000);
  const wholeCat = mix
    ? mix.items
    : inCategory
      ? inCategory.items
      : restaurantsNear(target, searchRadiusM, 600);
  const found =
    active && ctx.cat
      ? wholeCat.filter((r) => active.members.some((m) => inMember(r, m)))
      : wholeCat;
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
  /** The dish search looked wider than the first ring. */
  let dishWider = false;
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
      if (profile)
        t2 = ctx.sort !== 'distance' ? likelyFirst(t2, profile) : commonLast(t2, profile);
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
          dishWider = true;
        }
        if (total >= MIN_DISH_PLACES) break;
      }
    }
    if (t1.length + t2.length > 0) {
      ordered = [...t1, ...t2];
      const common = t2.filter((row) => hits.get(row.r.id)?.common);
      const specialists = t2.length - common.length;
      dishPrefix =
        (widened ? t('chat.dishWider', { dish: dishName }) + ' ' : '') +
        (t1.length > 0
          ? t('chat.dishNamed', { dish: dishName, count: t1.length })
          : specialists === 0
            ? t('chat.dishCommon', {
                dish: dishName,
                count: common.length,
                shop: hits.get(common[0]!.r.id)!.common,
              })
            : t('chat.dishLikely', {
                dish: dishName,
                count: specialists,
                label: profile?.label ?? '',
              })) +
        ' ';
    } else {
      // A whole sentence the rules took for a dish is not quoted back as one.
      dishPrefix =
        (dishName.trim().split(/\s+/).length > 3
          ? t('chat.dishUnknownLong')
          : t('chat.dishUnknown', { dish: dishName })) + ' ';
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
        if (ordered.length > 0) {
          dishPrefix = t('chat.dishWider', { dish: dishName }) + ' ' + dishPrefix;
          dishWider = true;
        }
      }
    }
  }
  const withPark = withParkingWithin(ordered, ctx.parkM);
  const freeOnly = ctx.requireParking && ctx.freeParking;
  const parked = freeOnly
    ? withPark.filter((row) => nearestParking(row.r, deps.parkings)?.parking.isPaid === false)
    : withPark;
  const shown0 = ctx.requireParking ? parked : ordered;
  // The goal's kinds: all of them side by side, or first inside the category / dish that was named.
  const goal = mix && active ? active.entry : active && ctx.cat ? null : reorderEntry(ctx);
  const goalMembers = mix && active ? active.members : (goal?.members ?? []);
  const shown =
    mix && goal && goalMembers.length > 1
      ? interleave(shown0, goalMembers)
      : goal && !mix
        ? membersFirst(shown0, goalMembers)
        : shown0;
  const noun = ctx.cat ? t(`chat.noun.${ctx.cat}`) : t('chat.noun.all');
  const what = notCat ? `${noun} (${t('chat.except', { cat: t(`food.cats.${notCat}`) })})` : noun;

  const prefs = preferences(ctx, now);
  const list = prefs ? preferRows(shown, prefs, hits) : shown;

  if (shown.length > 0) {
    // Facts for the reply come from the cards the user will see (the first MAX_CARDS of the list).
    const seen = list.slice(0, MAX_CARDS);
    const firstPark = seen[0]?.parking;
    const hoursStates = seen
      .filter((row) => !!row.r.openingHours)
      .map((row) => openState({ openingHoursText: row.r.openingHours }, now))
      .filter((s) => s !== 'unknown');
    // The first card is more than FAR_WALK_MIN minutes away: one honest sentence in front, in place
    // of the "looked wider" note when there is one (never a text that calls it near).
    const topWalk = seen[0] ? walkMinFromMeters(seen[0].r.distanceM) : 0;
    const farWalk = topWalk > FAR_WALK_MIN ? topWalk : null;
    if (farWalk !== null) {
      const wider = dishWider ? t('chat.dishWider', { dish: dishName }) + ' ' : '';
      const rest =
        wider && dishPrefix.startsWith(wider) ? dishPrefix.slice(wider.length) : dishPrefix;
      const note = dishWider
        ? t('chat.dishWiderFar', { dish: dishName, min: farWalk })
        : t('chat.farFirst', { min: farWalk });
      dishPrefix = note + ' ' + rest;
    }
    let text = foodReply(
      {
        where,
        what,
        count: ctx.requireParking ? shown.length : ordered.length,
        // Food and parking are separate jobs: without a parking ask the lead and the highlight
        // are about the food only (no car park clause, no walk to it, no free-park count).
        withPark: parkAsked ? withPark.length : 0,
        requireParking: ctx.requireParking,
        freeOnly,
        nearestWalkMin: parkAsked && firstPark ? walkMinFromMeters(firstPark.distanceM) : null,
        freeParkCount: parkAsked
          ? seen.filter((row) => nearestParking(row.r, deps.parkings)?.parking.isPaid === false)
              .length
          : null,
        openNowCount: hoursStates.filter((s) => s === 'open').length,
        knownHoursCount: hoursStates.length,
        daypart: daypartOf(istanbulClock(now).minutes),
        // Places matched to a dish are named by what you can get there, never by a shop type.
        dish: hits.size > 0 && dishName ? dishName : null,
        dishPrefix,
      },
      t,
      seed,
      i18n.language,
    );
    // The part of the text the AI may reword; the dish sentence in front is an honest note.
    const template = text.slice(dishPrefix.length);
    // No menu / price data: say which kinds were picked by type of place (not printed twice with the generic note).
    const explained: Wish[] = [];
    if (goal?.note) {
      const note = choiceNote(goal, seen, t);
      if (note) {
        text += '\n' + note;
        explained.push(...(goal.wishes ?? []));
      }
    }
    if (quality) text = t(parkAsked ? 'chat.noRatings' : 'chat.noRatingsPlain') + '\n' + text;
    if (prefs?.at) {
      const known = list.slice(0, MAX_CARDS).some((row) => openAt(row.r, prefs.at!) === 'open');
      text += ' ' + t(known ? 'chat.whenPrefer' : 'chat.whenNone', { time: clockLabel(prefs.at) });
    }
    const reasonOf = (id: string): string | undefined => {
      const hit = hits.get(id);
      if (!hit) {
        // The kind of place this card stands for: "balık · yüksek protein".
        const r = goal ? getRestaurant(id) : null;
        const m = goal && r ? memberOf(r, goalMembers) : null;
        return goal && m
          ? `${memberLabel(m, i18n.language).toLocaleLowerCase(i18n.language.startsWith('en') ? 'en' : 'tr')} · ${entryReason(goal, i18n.language)}`
          : undefined;
      }
      if (hit.byName) return t('chat.reasonNamed', { dish: dishName });
      if (hit.common) return t('chat.reasonCommon', { dish: dishName, shop: hit.common });
      // A cuisine-tag match is not "in the name": word it as a likely fit.
      return profile ? t('chat.reasonLikely', { dish: dishName, label: profile.label }) : undefined;
    };
    const far =
      deps.ai?.pick && !ctx.wide && hits.size === 0
        ? fartherRows(target, searchRadiusM, new Set(list.map((row) => row.r.id)), ctx, deps, now)
        : [];
    const poolRows = [...list.slice(0, MAX_PICK_CANDIDATES - far.length), ...far];
    const pool: ChatCard[] = poolRows.map((row) => {
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
        ...(parkAsked ? { parkAsked: true as const } : {}),
      };
    });
    const cards = pool.slice(0, MAX_CARDS);
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
        // What the chat ruled out and the free-parking wish go along, so the list shows the same.
        ...(ctx.notCat ? { notcat: ctx.notCat } : {}),
        ...(ctx.requireParking && ctx.freeParking ? { free: '1' } : {}),
      },
    });
    // A broad category named directly: the kinds inside it that have places here, one tap to narrow.
    const narrowEntry = ctx.cat && generic ? entryForCat(ctx.cat) : undefined;
    if (narrowEntry) {
      const have = narrowEntry.members.filter((m) => wholeCat.some((r) => inMember(r, m)));
      const picked = active?.members.length === 1 ? active.members[0]!.id : null;
      const chips = have.filter((m) => m.id !== picked);
      if (chips.length >= (picked ? 1 : 2)) {
        actions.push(
          ...chips.map((m): ChatAction => ({
            kind: 'refine',
            label: memberLabel(m, i18n.language),
            patch: { choice: { id: narrowEntry.id, member: m.id } },
          })),
        );
        if (picked) actions.push(allChip({ choice: undefined }, t));
      }
    }
    actions.push({
      kind: 'say',
      label: t('chat.actOther'),
      text: t(ctx.cat !== 'breakfast' ? 'chat.exBreakfast' : 'chat.exFish', cityExamples()),
    });
    return {
      text,
      cards,
      actions,
      ...(explained.length > 0 ? { explained } : {}),
      ...(deps.ai?.pick && pool.length > cards.length ? { pool } : {}),
      aiReply: {
        kind: 'food',
        facts: {
          where,
          what: hits.size > 0 && dishName ? dishName : what,
          count: ctx.requireParking ? shown.length : ordered.length,
          requireParking: ctx.requireParking,
          freeOnly,
          widened: ctx.wide || dishWider,
          ...(farWalk !== null ? { far: true, farWalkMin: farWalk } : {}),
          dishByNameOnly: hits.size > 0 && [...hits.values()].every((h) => h.byName),
          daypart: daypartOf(istanbulClock(now).minutes),
        },
        template,
      },
    };
  }

  if (freeOnly && withPark.length > 0) {
    const actions: ChatAction[] = [
      { kind: 'refine', label: t('chat.actDropFree'), patch: { freeParking: false } },
    ];
    if (!ctx.wide) {
      actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
    }
    const none = t('chat.foodNoFreePark', { where, what });
    return {
      text: none,
      cards: [],
      actions,
      aiReply: {
        kind: 'none_found',
        facts: {
          where,
          what,
          count: 0,
          requireParking: ctx.requireParking,
          freeOnly,
          widened: ctx.wide,
        },
        template: none,
      },
    };
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
    const none = t('chat.foodNoParking', { where, what });
    return {
      text: none,
      cards: [],
      actions,
      aiReply: {
        kind: 'none_found',
        facts: {
          where,
          what,
          count: 0,
          requireParking: ctx.requireParking,
          freeOnly,
          widened: ctx.wide,
        },
        template: none,
      },
    };
  }

  const actions: ChatAction[] = [];
  if (!ctx.wide) {
    actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
  }
  actions.push(...examples('food', t));
  const none = t('chat.foodNone', { where, what });
  return {
    text: none,
    cards: [],
    actions,
    aiReply: {
      kind: 'none_found',
      facts: {
        where,
        what,
        count: 0,
        requireParking: ctx.requireParking,
        freeOnly,
        widened: ctx.wide,
      },
      template: none,
    },
  };
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
    const nearest = list[0]!;
    let text = parkReply(
      {
        where,
        count: list.length,
        nearestName: nearest.p.name,
        nearestWalkMin: walkMinFromMeters(nearest.d),
        nearestFree: visibleFree(nearest.p, now),
        liveCount: list.filter((x) => visibleFree(x.p, now) !== null).length,
        freeOfChargeCount: list.filter((x) => x.p.isPaid === false).length,
      },
      t,
      seed,
      i18n.language,
    );
    const template = text;
    const fresh = list.filter((x) => visibleFree(x.p, now) !== null).length;
    // The live-spots highlight (fresh free count of the nearest) already says it: no second sentence.
    if (fresh > 0 && visibleFree(nearest.p, now) === null)
      text += ' ' + t('chat.parkFresh', { count: fresh });
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
    return {
      text,
      cards,
      actions,
      aiReply: {
        kind: 'park',
        facts: {
          where,
          count: list.length,
          parkSearch: true,
          ...(walkMinFromMeters(nearest.d) > FAR_WALK_MIN
            ? { far: true, farWalkMin: walkMinFromMeters(nearest.d) }
            : {}),
          daypart: daypartOf(istanbulClock(now).minutes),
        },
        template,
      },
    };
  }

  const actions: ChatAction[] = [];
  if (ctx.freeParking) {
    actions.push({ kind: 'refine', label: t('chat.actDropFree'), patch: { freeParking: false } });
  }
  if (!ctx.wide) {
    actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
  }
  const none = t(ctx.freeParking ? 'chat.parkNoFree' : 'chat.parkNone', { where });
  return {
    text: none,
    cards: [],
    actions,
    aiReply: {
      kind: 'none_found',
      facts: { where, count: 0, parkSearch: true, freeOnly: ctx.freeParking, widened: ctx.wide },
      template: none,
    },
  };
}

// --- Clarify (job 3) -------------------------------------------------------------------------

const CLARIFY_CATS: FoodCategory[] = ['breakfast', 'meat', 'fish', 'lokanta', 'cafe', 'dessert'];

/**
 * What a question leaves for its answer: the wishes of the message that asked (the answer is the
 * same ask, a goal such as "fit" must not be lost), and the routed message's id when its one
 * /reply is still unused (an answer without a router call of its own may use it for its wording).
 */
function pendingAsk(meta: AnswerMeta): Pick<ChatContext, 'clarifyWishes' | 'replyId'> {
  return {
    ...(meta.wishes.length > 0 ? { clarifyWishes: meta.wishes } : {}),
    ...(meta.routed && !meta.replyUsed && meta.messageId ? { replyId: meta.messageId } : {}),
  };
}

/** One question and its chips. The wording may come from the AI (checked); the chips never do. */
async function clarify(
  ask: ClarifyAsk,
  next: ChatContext,
  food: boolean,
  deps: AssistantDeps,
  meta: AnswerMeta,
): Promise<Result> {
  const { t } = deps;
  const here = (await deps.here()) ?? activeCity().center;
  const asked = validateFreeText('clarify', meta.ai?.clarify?.text, textContext(deps, here));
  const placeName = meta.ai?.place ?? meta.ai?.district ?? '';
  const text =
    asked ?? (ask === 'place' ? t('chat.ask_place', { place: placeName }) : t(`chat.ask_${ask}`));
  const group = [...new Set<Wish>([...meta.wishes, 'group'])];
  let actions: ChatAction[];
  if (ask === 'place') {
    // Yes sends the place as an answer (the AI reads it with the request before); no searches nearby.
    actions = [
      { kind: 'say', label: placeName, text: placeName },
      { kind: 'say', label: t('chat.clarifyNotPlace'), text: t('chat.clarifyNear') },
    ];
  } else if (ask === 'district') {
    const nearest = [...activeCity().districtCenters]
      .sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b))
      .slice(0, 3);
    // An answer to "where" or "what" is sent as a message, as if typed: it goes through the AI
    // with the conversation, so the request asked before ("vejetaryenim") still leads the search
    // and the pick. A chip that only patched the search would drop it.
    actions = [
      ...nearest.map((d): ChatAction => ({ kind: 'say', label: d.name, text: d.name })),
      { kind: 'say', label: t('chat.clarifyNear'), text: t('chat.clarifyNear') },
    ];
  } else if (ask === 'dish') {
    actions = CLARIFY_CATS.map((cat): ChatAction => {
      const label = t(`food.cats.${cat}`);
      return { kind: 'say', label, text: label };
    });
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
    ...(deps.ai ? { query: requestText(meta) } : {}),
    ...pendingAsk(meta),
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
  protein: 'menu',
  kids: 'kids',
  family: 'kids',
};

/** The honest note for wishes we cannot answer, or null when every wish is one we can use. */
function noInfoNote(
  wishes: Wish[],
  aiPicked: boolean,
  t: AssistantDeps['t'],
  section: 'park' | 'food' = 'food',
  /** Food only: the ask included parking, so the note may say the order followed the car park. */
  withPark = true,
): string | null {
  const table = section === 'park' ? PARK_NO_DATA_TOPIC : NO_DATA_TOPIC;
  const topics = [...new Set(wishes.flatMap((w) => table[w] ?? []))];
  if (topics.length === 0) return null;
  const names = topics.map((k) => t(`chat.noInfo_${k}`));
  const what =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} ${t('chat.and')} ${names[names.length - 1]}`;
  const key =
    section === 'park' ? 'chat.noInfoPark' : withPark ? 'chat.noInfo' : 'chat.noInfoPlain';
  // Capitalised only where the topics open the sentence (Turkish), not mid-sentence (English).
  const note = t(`${key}${aiPicked ? 'Ai' : 'Rule'}`, { what });
  return note.startsWith(what) ? note.charAt(0).toLocaleUpperCase('tr') + note.slice(1) : note;
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
    districts: [...activeCity().districts],
  };
}

function pickCandidate(card: Extract<ChatCard, { kind: 'restaurant' }>, i: number): PickCandidate {
  const n = card.narr;
  // Food and parking are separate jobs: the car park is a fact of the pick only when it was asked
  // for, so the AI cannot give it as a reason (verifyPick drops a reason the facts do not hold).
  const park = card.parkAsked === true;
  return {
    i,
    kind: 'restaurant',
    walkMin: walkMinFromMeters(card.distanceM),
    distM: distMOf(card.distanceM),
    openState: n?.open ?? card.open,
    closesLate: n?.closesLate ?? false,
    parkingM: park && card.parkingM != null ? Math.round(card.parkingM) : null,
    parkingFree: park && n?.parkingPaid != null ? !n.parkingPaid : null,
    freeSpots: park ? (n?.parkingFree ?? null) : null,
    dishMatch: n?.dish ?? 'none',
    outdoor: n?.outdoor ?? null,
  };
}

/**
 * What /pick and /plan see as the request: the router's own reading of the message with the
 * conversation so far, then the words themselves. A clarify answer ("Bornova") alone would lose
 * what was asked before ("vejetaryenim").
 */
function requestText(meta: AnswerMeta): string {
  const meaning = meta.ai?.meaning;
  return meaning ? clipText(`${meaning} ("${meta.text}")`, MAX_MESSAGE_CHARS) : meta.text;
}

/** A candidate's name and type in words, so the AI can judge whether it fits the request. */
function withLabel(c: PickCandidate, card: ChatCard, t: AssistantDeps['t']): PickCandidate {
  const r = getRestaurant(card.id);
  if (!r) return { ...c, name: clipText(card.name, MAX_LABEL_CHARS) };
  const cat = categoryOf(r);
  const tf = t as Parameters<typeof cuisineLabels>[1];
  const kind = kindLabel(r.kind, tf);
  // Diets come right after the category: they are data, not a guess, and must not be clipped.
  const parts = [
    ...(cat
      ? [t(`food.cats.${cat}`) + (isEstimatedKind(r) ? ` (${t('food.estimatedKind')})` : '')]
      : []),
    ...dietLabels(r.diets, tf),
    ...(kind ? [kind] : []),
    ...cuisineLabels(r.cuisines, tf),
  ].filter((p, k, all) => all.indexOf(p) === k);
  return {
    ...c,
    name: clipText(r.name, MAX_LABEL_CHARS),
    ...(parts.length > 0 ? { type: clipText(parts.join(', '), MAX_LABEL_CHARS) } : {}),
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
      // Over FAR_WALK_MIN minutes "the closest" would read as near: a neutral reason instead.
      return t(facts.walkMin > FAR_WALK_MIN ? 'chat.why.closestFar' : 'chat.why.closest', {
        count: facts.walkMin,
      });
    case 'parking_close':
      return facts.parkWalkMin !== undefined
        ? t('chat.why.parking_close_walk', { count: facts.parkWalkMin })
        : t('chat.why.parking_close', { m: facts.parkingM });
    case 'most_free_spots':
      return t('chat.why.most_free_spots', { count: facts.freeSpots });
    case 'dish_named':
      return t('chat.why.dish_named', { dish });
    case 'fits_request':
      return t('chat.why.fits_request');
    default:
      return t(`chat.why.${code}`);
  }
}

type AiFail = { ok: false; reason: 'quota' | 'error' | 'invalid'; remaining?: number };

type PickDone = {
  ok: true;
  /** The picked card first (flagged), the others the AI judged to fit next, then the rest. */
  cards: ChatCard[];
  line: string;
  tone: string | null;
  remaining: number;
};

/**
 * The nearest places beyond the search radius that pass the same filters (category, ruled-out
 * category, parking), for the pick only.
 */
function fartherRows(
  target: LatLng,
  radiusM: number,
  have: Set<string>,
  ctx: ChatContext,
  deps: AssistantDeps,
  now: Date,
): RestaurantRow[] {
  const notCat = ctx.notCat;
  const items = restaurantsNear(target, FAR_PICK_M, 3000)
    .filter(
      (r) =>
        r.distanceM > radiusM &&
        !have.has(r.id) &&
        categoryOf(r) !== null &&
        (!ctx.cat || matchesCategory(r, ctx.cat)) &&
        (!notCat || !matchesCategory(r, notCat)),
    )
    .slice(0, FAR_PICK * 4);
  let rows = buildRestaurantRows(items, deps.parkings, target, now);
  if (ctx.requireParking) {
    rows = withParkingWithin(rows, ctx.parkM);
    if (ctx.freeParking) {
      rows = rows.filter((row) => nearestParking(row.r, deps.parkings)?.parking.isPaid === false);
    }
  }
  return rows.slice(0, FAR_PICK);
}

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
    .slice(0, MAX_PICK_CANDIDATES);
  if (rest.length < 2) return { ok: false, reason: 'invalid' };
  const candidates = rest.map((c, k) => withLabel(pickCandidate(c, k), c, deps.t));
  const res = await ai.pick({ text, candidates });
  if (!res.ok) {
    return res.remaining === undefined
      ? { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error' }
      : { ok: false, reason: res.reason === 'quota' ? 'quota' : 'error', remaining: res.remaining };
  }
  const v = verifyPick(res.value, candidates, tctx);
  if (!v) return { ok: false, reason: 'invalid', remaining: res.remaining };
  const t = deps.t;
  // Asked for something none of the nearby places seems to offer: say so, pick nothing.
  if (v.noneFit) {
    return {
      ok: true,
      cards: cards.slice(0, MAX_CARDS),
      line: t('chat.pickNoneFit'),
      tone: v.tone,
      remaining: res.remaining,
    };
  }
  // What is shown: the pick, the others judged to fit, then the nearest of the rest.
  const shown = [
    v.pick,
    ...v.fit.filter((k) => k !== v.pick),
    ...rest.map((_, k) => k).filter((k) => k !== v.pick && !v.fit.includes(k)),
  ].slice(0, MAX_CARDS);
  if (v.runnerUp && !shown.includes(v.runnerUp.index)) v.runnerUp = null;
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
  const ordered: ChatCard[] = shown.map((k) =>
    k === v.pick ? { ...rest[k]!, picked: true } : rest[k]!,
  );
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
        distM: distMOf(card.distanceM),
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
            distM: distMOf(distanceMeters(r, x)),
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
    dest: { lat: park.lat, lng: park.lng, name: park.name, id: park.id, kind: 'p' },
    place: { id: e.r.id, name: e.r.name, lat: e.r.lat, lng: e.r.lng },
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
    distM: distMOf(card.distanceM),
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
  const v = verifyParkPick(res.value, candidates, tctx, when);
  if (!v) return { ok: false, reason: 'invalid', remaining: res.remaining };
  const { t } = deps;
  const why = (code: ParkReason, k: number) => {
    const c = candidates[k]!;
    return t(
      `chat.whyPark.${code === 'closest' && c.walkMin > FAR_WALK_MIN ? 'closestFar' : code}`,
      {
        count: code === 'closest' ? c.walkMin : code === 'big_capacity' ? c.capacity : c.freeSpots,
      },
    );
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
    dest: {
      lat: done.park.lat,
      lng: done.park.lng,
      name: done.park.name,
      id: done.park.id,
      kind: 'p',
    },
  };
}

/**
 * After a message was answered: the wishes we can and cannot use (L4), the AI's tone and dish
 * note (validated), and, when the AI understood the message, its pick or plan (verified).
 */
async function finishAnswer(res: Result, deps: AssistantDeps, meta: AnswerMeta): Promise<Result> {
  if (meta.settled) return res;
  const { t } = deps;
  const reply = res.reply;
  // A question is not a result: no pick line (or any pick) on the turn that asks which kind.
  if (res.ctx.ask) meta = { ...meta, quotaOut: true };
  // The AI understood this message as a search: mark the reply even when it has no cards.
  if (meta.ai) reply.sparkle = true;
  const restaurants = reply.cards.filter((c) => c.kind === 'restaurant');
  const parkings = reply.cards.filter((c) => c.kind === 'parking');
  if (restaurants.length === 0 && parkings.length === 0) {
    // Nothing found: the AI may still word the "nothing here" sentence.
    await wordReply(reply, deps, meta);
    return res;
  }
  const food = restaurants.length > 0;

  const lines: string[] = [];
  const first = food ? getRestaurant(restaurants[0]!.id) : null;
  const tctx = textContext(deps, first ?? res.ctx.place ?? activeCity().center, reply.cards);
  const dish = res.ctx.dish ?? '';
  let sparkle = false;

  let tone = validateFreeText('tone', meta.ai?.tone, tctx);
  let aiPicked = false;
  const after: string[] = [];
  const ai = deps.ai;

  if (food) {
    if (ai?.plan && !meta.quotaOut && meta.planWhen) {
      const plan = await askPlan(reply.cards, requestText(meta), meta.planWhen, dish, deps, tctx);
      noteQuota(reply, plan, deps);
      if (plan.ok) {
        reply.plan = plan.plan;
        after.push(t('chat.planIntro'));
        tone = plan.tone ?? tone;
        aiPicked = true;
        sparkle = true;
      }
    } else if (ai?.pick && !meta.quotaOut && meta.ai && restaurants.length >= 2) {
      const pick = await askPick(reply.pool ?? reply.cards, requestText(meta), dish, deps, tctx);
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

  // The cards are final (a pick may have reordered them): the AI words the lead around them.
  await wordReply(reply, deps, meta);
  if (reply.sparkle && reply.aiReply) sparkle = true;
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
  const said = reply.explained ?? [];
  const noInfo = noInfoNote(
    meta.wishes.filter((w) => !said.includes(w)),
    aiPicked,
    t,
    food ? 'food' : 'park',
    reply.cards.some((c) => c.kind === 'restaurant' && c.parkAsked),
  );
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
  const tctx = textContext(deps, around ?? ctx.place ?? activeCity().center, cards);
  const text = query.trim() || t('chat.noun.all');
  const pick = food
    ? await askPick(cards, text, ctx.dish ?? '', deps, tctx)
    : await askParkPick(cards, text, deps, tctx);
  if (!pick.ok) {
    const parkAsked = !food || cards.some((c) => c.kind === 'restaurant' && c.parkAsked);
    const reply: BotMessage = {
      text: t(parkAsked ? 'chat.pickUnavailable' : 'chat.pickUnavailablePlain'),
      cards: [],
      actions: [],
    };
    // The user asked for this on purpose: always say why, not only once a day.
    if (pick.reason === 'quota') reply.notice = t('chat.sparkleOut');
    return plain(reply, ctx);
  }
  const lines = [pick.tone, pick.line];
  const noInfo = noInfoNote(
    ctx.wishes ?? [],
    true,
    t,
    food ? 'food' : 'park',
    cards.some((c) => c.kind === 'restaurant' && c.parkAsked),
  );
  if (noInfo) lines.push(noInfo);
  const reply: BotMessage = {
    text: lines.filter(Boolean).join('\n'),
    cards: pick.cards,
    actions: [],
    sparkle: true,
  };
  noteQuota(reply, pick, deps);
  return plain(reply, { ...ctx, lastCards: pick.cards });
}
