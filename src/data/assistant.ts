import { IZMIR_CENTER } from '@/data/places';
import { visibleFree } from '@/data/freshness';
import { distanceMeters, type LatLng } from '@/data/geo';
import { parseQuery } from '@/data/intent';
import {
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
} from '@/data/restaurants';
import { searchPlaces } from '@/data/search';
import type { Parking } from '@/data/types';
import { openState } from '@/lib/openNow';
import { buildRestaurantRows } from '@/lib/restaurantRows';

export type ChatPlace = { label: string; lat: number; lng: number };

export type ChatContext = {
  /** null = near the user. */
  place: ChatPlace | null;
  cat: FoodCategory | null;
  dish: string | null;
  section: 'park' | 'food';
  requireParking: boolean;
  parkM: 300 | 500;
  wide: boolean;
};

export const emptyContext = (section: 'park' | 'food'): ChatContext => ({
  place: null,
  cat: null,
  dish: null,
  section,
  requireParking: false,
  parkM: 300,
  wide: false,
});

export type ChatAction =
  | { kind: 'say'; label: string; text: string }
  | { kind: 'refine'; label: string; patch: Partial<ChatContext> }
  | { kind: 'open'; label: string; pathname: string; params: Record<string, string> };

export type ChatCard =
  | {
      kind: 'restaurant';
      id: string;
      name: string;
      distanceM: number;
      parkingM: number | null;
      open: 'open' | 'closed' | 'unknown';
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

export type BotMessage = { text: string; cards: ChatCard[]; actions: ChatAction[] };

export type AssistantDeps = {
  here: () => Promise<LatLng | null>;
  geocode: (q: string) => Promise<LatLng | null>;
  parkings: Parking[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  now?: Date;
};

type Result = { reply: BotMessage; ctx: ChatContext };

const MAX_CARDS = 5;

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

export async function answer(
  text: string,
  ctx: ChatContext,
  deps: AssistantDeps,
): Promise<Result> {
  const { t } = deps;
  const it = parseQuery(text);

  if (it.kind === 'greeting') {
    const msg = variant(t, 'chat.hello', 2, text);
    return plain({ text: msg, cards: [], actions: examples(ctx.section, t) }, ctx);
  }
  if (it.kind === 'abuse') {
    return plain(
      { text: t('chat.calm_0'), cards: [], actions: examples(ctx.section, t) },
      ctx,
    );
  }
  if (it.kind === 'empty') {
    return plain(
      {
        text: variant(t, 'chat.unknown', 2, text),
        cards: [],
        actions: [pickOnMap(text, t), ...examples(ctx.section, t)],
      },
      ctx,
    );
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
  if (it.mentionsParking) {
    if (next.section === 'food') next.requireParking = true;
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
        return plain(
          {
            text: t('chat.placeNotFound', { q: it.placeQuery }),
            cards: [],
            actions: [pickOnMap(text, t), ...examples(next.section, t)],
          },
          ctx,
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
  }

  return run(next, deps, text, it.quality);
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

  const reply = ctx.section === 'food'
    ? runFood(ctx, deps, seed, quality, target, where, now)
    : runPark(ctx, deps, seed, target, where, now);
  return { reply, ctx };
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
  const items = ctx.cat
    ? restaurantsInCategory(target, ctx.cat, undefined, ctx.wide ? WIDE_RADII_M : undefined).items
    : restaurantsNear(target, ctx.wide ? 15000 : 1000, 600);
  const rows = rankRestaurants(
    buildRestaurantRows(items, deps.parkings, target, now),
    'parkEase',
    ctx.cat ?? undefined,
  );
  const withPark = withParkingWithin(rows, ctx.parkM);
  const shown = ctx.requireParking ? withPark : rows;
  const what = ctx.cat ? t(`chat.noun.${ctx.cat}`) : t('chat.noun.all');

  if (shown.length > 0) {
    let text = ctx.requireParking
      ? t('chat.foodFoundPark', { where, count: shown.length, what })
      : variant(t, 'chat.foodFound', 2, seed, {
          where,
          count: rows.length,
          what,
          withPark: withPark.length,
        });
    if (quality) text += ' ' + t('chat.noRatings');
    const cards: ChatCard[] = shown.slice(0, MAX_CARDS).map((row) => ({
      kind: 'restaurant',
      id: row.r.id,
      name: row.r.name,
      distanceM: row.r.distanceM,
      parkingM: row.parking?.distanceM ?? null,
      open: 'unknown',
    }));
    const actions: ChatAction[] = [];
    if (!ctx.requireParking) {
      actions.push({
        kind: 'refine',
        label: t('chat.actOnlyParking'),
        patch: { requireParking: true },
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

  if (ctx.requireParking && rows.length > 0) {
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
): BotMessage {
  const { t } = deps;
  const radius = ctx.wide ? 5000 : 1500;
  const list = deps.parkings
    .map((p) => ({ p, d: distanceMeters(target, p) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d);

  if (list.length > 0) {
    let text = variant(t, 'chat.parkFound', 2, seed, { where, count: list.length });
    const fresh = list.filter((x) => visibleFree(x.p, now) !== null).length;
    if (fresh > 0) text += ' ' + t('chat.parkFresh', { count: fresh });
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
  if (!ctx.wide) {
    actions.push({ kind: 'refine', label: t('chat.actWider'), patch: { wide: true } });
  }
  return { text: t('chat.parkNone', { where }), cards: [], actions };
}
