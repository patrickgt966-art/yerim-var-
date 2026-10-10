import { dishProfile, likelyServes, type DishProfile } from '@/data/dishes';
import { IZMIR_CENTER } from '@/data/places';
import { visibleFree } from '@/data/freshness';
import { distanceMeters, type LatLng } from '@/data/geo';
import { IZMIR_DISTRICTS, parseQuery, typedPlaceText, type QueryIntent } from '@/data/intent';
import {
  allRestaurants,
  categoryOf,
  cuisineLabels,
  dishStem,
  matchesCategory,
  nearestParking,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
  type Restaurant,
  type RestaurantRow,
} from '@/data/restaurants';
import { fold, searchPlaces } from '@/data/search';
import type { Parking } from '@/data/types';
import { openState, type OpenState } from '@/lib/openNow';
import type { AiResult } from '@/lib/ai/client';
import {
  fillPlaceholders,
  isGroundedReply,
  type NarrateRequest,
  type Understanding,
} from '@/lib/ai/protocol';
import { buildRestaurantRows } from '@/lib/restaurantRows';

export type ChatPlace = { label: string; lat: number; lng: number };

export type ChatContext = {
  /** null = near the user. */
  place: ChatPlace | null;
  cat: FoodCategory | null;
  /** A category the user ruled out ("köfte değil balık"). */
  notCat: FoodCategory | null;
  dish: string | null;
  section: 'park' | 'food';
  requireParking: boolean;
  /** Only car parks known to be free ("otopark ücretsiz"). */
  freeParking: boolean;
  parkM: 300 | 500;
  wide: boolean;
  /** 'distance' after "daha yakın". */
  sort: 'parkEase' | 'distance';
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
  | { kind: 'open'; label: string; pathname: string; params: Record<string, string> };

/** True facts about a restaurant card that only the AI narration uses. */
export type CardNarr = {
  cat?: string;
  open: OpenState;
  parkingPaid: boolean | null;
  parkingFree: number | null;
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
    }
  | {
      kind: 'parking';
      id: string;
      name: string;
      distanceM: number;
      free: number | null;
      capacity: number | null;
      open: 'open' | 'closed' | 'unknown';
    };

export type BotMessage = {
  text: string;
  cards: ChatCard[];
  actions: ChatAction[];
  /** The text was written by the AI layer. */
  sparkle?: boolean;
  /** Small note under the text (e.g. the daily AI quota is used up). */
  notice?: string;
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
    narrate(
      req: Omit<NarrateRequest, 'deviceId' | 'messageId' | 'text'>,
    ): Promise<AiResult<string>>;
    /** True the first time per day, so the "out of quota" notice shows once. */
    quotaNotice(): boolean;
  };
};

type Result = { reply: BotMessage; ctx: ChatContext };

const MAX_CARDS = 5;
/** A dish search with fewer places than this looks in the wider rings. */
const MIN_DISH_PLACES = 3;

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

/** Facts about a found result list, handed to the AI narration. */
type Facts = { where: string; what: string; total: number; withParking: number };

/** A search intent from the AI's understanding of the text. */
function intentFromUnderstanding(
  u: Extract<Understanding, { kind: 'search' }>,
  text: string,
): Extract<QueryIntent, { kind: 'search' }> {
  const district = u.district
    ? (IZMIR_DISTRICTS.find((d) => fold(d.name) === fold(u.district!)) ?? null)
    : null;
  return {
    kind: 'search',
    text: fold(text),
    cat: u.cat,
    dish: u.dish,
    district,
    placeQuery: u.place ? fold(u.place) : '',
    requireParking: u.requireParking,
    quality: false,
    uncertain: false,
    food: u.food || u.cat !== null,
    nearMe: false,
    mentionsParking: u.requireParking || (!u.food && u.cat === null),
  };
}

type SearchIntent = Extract<QueryIntent, { kind: 'search' }>;

/** Rule intent + AI intent: AI fills what the rules left empty; rule-found values stay. */
function mergeIntents(rule: SearchIntent, ai: SearchIntent): SearchIntent {
  const cat = rule.cat ?? ai.cat;
  const food = rule.food || ai.food || cat !== null;
  const requireParking = rule.requireParking || ai.requireParking;
  return {
    ...rule,
    cat,
    dish: rule.cat ? rule.dish : ai.dish,
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

export async function answer(text: string, ctx: ChatContext, deps: AssistantDeps): Promise<Result> {
  const { t } = deps;
  let it = parseQuery(text);
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

  if (
    deps.ai &&
    !followUp &&
    (it.kind === 'offtopic' || it.kind === 'empty' || (it.kind === 'search' && it.uncertain))
  ) {
    const res = await deps.ai.understand(text);
    if (res.ok) {
      if (res.remaining === 0 && deps.ai.quotaNotice()) notice = t('chat.sparkleLast');
      if (res.value.kind === 'offtopic') {
        return withNotice(
          plain(
            { text: res.value.reply, cards: [], actions: offTopicActions(), sparkle: true },
            ctx,
          ),
        );
      }
      if (res.value.kind === 'search') {
        const fromAi = intentFromUnderstanding(res.value, text);
        it = it.kind === 'search' ? mergeIntents(it, fromAi) : fromAi;
      }
    } else if (res.reason === 'quota' && deps.ai.quotaNotice()) {
      notice = t('chat.sparkleOut');
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
  if (it.kind === 'empty') {
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
      if (deps.ai && cards.length > 0) {
        const facts: Facts = {
          where: ctx.place?.label ?? t('chat.nearYou'),
          what: t('chat.noun.all'),
          total: matches.length,
          withParking: cards.filter(
            (c) => c.kind === 'restaurant' && c.parkingM != null && c.parkingM <= 300,
          ).length,
        };
        await narrate(found, facts, false, deps, deps.ai);
      }
      return withNotice(plain(found, ctx));
    }
  }

  const next: ChatContext = { ...ctx };
  if (it.cat) {
    next.cat = it.cat;
    next.dish = it.dish;
    next.section = 'food';
  } else if (it.food) {
    next.cat = null;
    next.dish = null;
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
    next.place = { label: it.district.name, lat: it.district.lat, lng: it.district.lng };
  } else if (it.placeQuery) {
    const h = searchPlaces(it.placeQuery, 1)[0];
    if (h) {
      next.place = { label: h.name, lat: h.lat, lng: h.lng };
    } else {
      const p = await deps.geocode(it.placeQuery);
      if (!p) {
        const typedRaw = typedPlaceText(text, it.placeQuery);
        const typed = typedRaw.charAt(0).toLocaleUpperCase('tr') + typedRaw.slice(1);

        // 1. A dish or cuisine the user named: show restaurants matching it.
        const qWords = it.placeQuery.split(' ').filter(Boolean);
        const hasAll = (hay: string) => qWords.every((w) => hay.includes(w));
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

  return withNotice(await run(next, deps, text, it.quality));
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
): Promise<Result> {
  const { t } = deps;
  const now = deps.now ?? new Date();

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

  const facts: Partial<Facts> = {};
  const reply =
    ctx.section === 'food'
      ? runFood(ctx, deps, seed, quality, target, where, now, facts)
      : runPark(ctx, deps, seed, target, where, now, facts);
  if (deps.ai && reply.cards.length > 0 && facts.where !== undefined) {
    await narrate(reply, facts as Facts, quality, deps, deps.ai);
  }
  return { reply, ctx };
}

/** Card facts for the narration: only what the app itself would show as true. */
function cardNarr(row: RestaurantRow, deps: AssistantDeps, now: Date): CardNarr {
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
  };
}

/** Replaces the template text with the AI's sentence when it passes the grounding check. */
async function narrate(
  reply: BotMessage,
  facts: Facts,
  quality: boolean,
  deps: AssistantDeps,
  ai: NonNullable<AssistantDeps['ai']>,
): Promise<void> {
  const results: NarrateRequest['results'] = reply.cards.map((c, i) => {
    const item: NarrateRequest['results'][number] = {
      n: i + 1,
      kind: c.kind,
      distanceM: Math.round(c.distanceM),
      parkingM: c.kind === 'restaurant' && c.parkingM != null ? Math.round(c.parkingM) : null,
    };
    if (c.kind === 'restaurant') {
      if (c.narr) {
        if (c.narr.cat) item.cat = c.narr.cat;
        item.open = c.narr.open;
        item.parkingPaid = c.narr.parkingPaid;
        item.parkingFree = c.narr.parkingFree;
      }
    } else {
      item.open = c.open;
      item.parkingPaid = deps.parkings.find((p) => p.id === c.id)?.isPaid ?? null;
      item.parkingFree = c.free;
    }
    return item;
  });
  const res = await ai.narrate({ ...facts, results });
  if (!res.ok) {
    if (res.reason === 'quota' && ai.quotaNotice()) reply.notice = deps.t('chat.sparkleOut');
    return;
  }
  if (res.remaining === 0 && !reply.notice && ai.quotaNotice()) {
    reply.notice = deps.t('chat.sparkleLast');
  }
  const allowed = [
    facts.total,
    facts.withParking,
    300,
    500,
    ...results.flatMap((r) => (r.parkingM != null ? [r.distanceM, r.parkingM] : [r.distanceM])),
    ...results.flatMap((r) => (r.parkingFree != null ? [r.parkingFree] : [])),
  ];
  const replyFacts = {
    anyOpen: results.some((r) => r.open === 'open'),
    anyClosed: results.some((r) => r.open === 'closed'),
    anyFree: results.some((r) => r.parkingFree != null),
  };
  if (!isGroundedReply(res.value, allowed, reply.cards.length, replyFacts)) return;
  reply.text =
    fillPlaceholders(
      res.value,
      reply.cards.map((c) => c.name),
    ) + (quality ? '\n' + deps.t('chat.noRatings') : '');
  reply.sparkle = true;
}

const GENERIC_DISH_STEMS = new Set([
  'et',
  'balik',
  'kahvalti',
  'corba',
  'lokanta',
  'kafe',
  'meyhane',
  'tatli',
  'restoran',
  'cafe',
  'kahve',
  'coffee',
  'balikci',
  'fast food',
  'hizli yemek',
  'ev yemegi',
  'esnaf lokantasi',
  'kahvalti salonu',
  'bar',
  'pub',
  'meat',
  'grill',
  'fish',
  'soup',
  'seafood',
  'breakfast',
  'brunch',
  'dessert',
  'pastane',
  'kahvehane',
  'cay bahcesi',
  'deniz urunleri',
]);

/** How a place fits a searched dish: 1 = the name or cuisine says it, 2 = it very likely serves it. */
type DishHit = { tier: 1 | 2; byName: boolean };

function dishClassifier(stem: string, profile: DishProfile | null) {
  const stemWords = stem.split(' ');
  const kebab = (x: string) => x.replace(/kebap/g, 'kebab');
  const stemKebab = kebab(stem);
  return (r: Restaurant): DishHit | null => {
    const n = fold(r.name);
    const byName = stemWords.every((w) => n.includes(w));
    if (byName || r.cuisines.some((c) => kebab(fold(c.replace(/_/g, ' '))).includes(stemKebab))) {
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

function runFood(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  quality: boolean,
  target: LatLng,
  where: string,
  now: Date,
  facts: Partial<Facts>,
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
  let ordered = rows;
  let dishPrefix = '';
  const hits = new Map<string, DishHit>();
  let profile: DishProfile | null = null;
  const stem = ctx.dish ? dishStem(ctx.dish) : '';
  const dishName = ctx.dish ? shownDish(ctx.dish, stem) : '';
  if (ctx.dish && stem && !GENERIC_DISH_STEMS.has(stem)) {
    profile = dishProfile(stem);
    const classify = dishClassifier(stem, profile);
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
      const t2: RestaurantRow[] = [];
      for (const row of ranked) {
        const hit = classify(row.r)!;
        hits.set(row.r.id, hit);
        (hit.tier === 1 ? t1 : t2).push(row);
      }
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
    Object.assign(facts, {
      where,
      what,
      total: ctx.requireParking ? shown.length : ordered.length,
      withParking: withPark.length,
    });
    const reasonOf = (id: string): string | undefined => {
      const hit = hits.get(id);
      if (!hit) return undefined;
      if (hit.byName) return t('chat.reasonNamed', { dish: dishName });
      // A cuisine-tag match is not "in the name": word it as a likely fit.
      return profile ? t('chat.reasonLikely', { dish: dishName, label: profile.label }) : undefined;
    };
    const cards: ChatCard[] = shown.slice(0, MAX_CARDS).map((row) => {
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
        narr: cardNarr(row, deps, now),
      };
    });
    const actions: ChatAction[] = [];
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

function runPark(
  ctx: ChatContext,
  deps: AssistantDeps,
  seed: string,
  target: LatLng,
  where: string,
  now: Date,
  facts: Partial<Facts>,
): BotMessage {
  const { t } = deps;
  const radius = ctx.wide ? 5000 : 1500;
  const list = deps.parkings
    .map((p) => ({ p, d: distanceMeters(target, p) }))
    .filter((x) => x.d <= radius && (!ctx.freeParking || x.p.isPaid === false))
    .sort((a, b) => a.d - b.d);

  if (list.length > 0) {
    let text = variant(t, 'chat.parkFound', 2, seed, { where, count: list.length });
    const fresh = list.filter((x) => visibleFree(x.p, now) !== null).length;
    if (fresh > 0) text += ' ' + t('chat.parkFresh', { count: fresh });
    Object.assign(facts, { where, what: 'otopark', total: list.length, withParking: 0 });
    const cards: ChatCard[] = list.slice(0, MAX_CARDS).map(({ p, d }) => ({
      kind: 'parking',
      id: p.id,
      name: p.name,
      distanceM: Math.round(d),
      free: visibleFree(p, now),
      capacity: p.capacity,
      open: openState(p, now),
    }));
    const actions: ChatAction[] = [
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
    ];
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
