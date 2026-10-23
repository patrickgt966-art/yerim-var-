import { getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import type { FoodCategory } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import { mealSlot, type MealSlot } from '@/components/home/cravingOrder';

/**
 * Yerim's daily suggestion: at most one a day, picked by urgency. Everything here is pure, so the
 * rules are tested without a screen; `MascotNudge` feeds it the live data.
 */
export type Nudge =
  | {
      kind: 'favFilling';
      fav: { id: string; name: string; free: number };
      alt: { id: string; name: string; free: number; distanceM: number };
    }
  | { kind: 'favNearby'; place: { id: string; name: string; distanceM: number } }
  | {
      kind: 'hardParking';
      station: { name: string; walkMin: number } & LatLng;
    }
  | {
      kind: 'meal';
      slot: MealSlot;
      cat: FoodCategory;
      count: number;
      here: LatLng;
    };
export type NudgeKind = Nudge['kind'];

/** Most urgent first: what will not wait, then where you are, then the hour. */
export const NUDGE_ORDER: readonly NudgeKind[] = ['favFilling', 'favNearby', 'hardParking', 'meal'];

/** Kinds that may come back the next day: they are about something happening right now. */
const URGENT: readonly NudgeKind[] = ['favFilling'];

export type NudgeMemory = {
  enabled: boolean;
  /** Local day (YYYY-MM-DD) of the last suggestion shown. */
  lastDay: string | null;
  lastKind: NudgeKind | null;
  /** ISO time until which Yerim stays quiet (two "Sonra" in a row). */
  mutedUntil: string | null;
};

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether a suggestion may come at all now: on, not muted, none shown today. Cheap; check it first. */
export function nudgeAllowed(memory: NudgeMemory, now: Date): boolean {
  if (!memory.enabled) return false;
  if (memory.mutedUntil && now.getTime() < new Date(memory.mutedUntil).getTime()) return false;
  return memory.lastDay !== dayKey(now);
}

/** The one suggestion to show now, or null: off, muted, already one today, or nothing worth it. */
export function chooseNudge(
  candidates: readonly Nudge[],
  memory: NudgeMemory,
  now: Date,
): Nudge | null {
  if (!nudgeAllowed(memory, now)) return null;
  const byOrder = [...candidates].sort(
    (a, b) => NUDGE_ORDER.indexOf(a.kind) - NUDGE_ORDER.indexOf(b.kind),
  );
  return byOrder.find((n) => n.kind !== memory.lastKind || URGENT.includes(n.kind)) ?? null;
}

const LIVE = (p: Parking, now: Date) => {
  const f = getFreshness(p, now);
  return (f.kind === 'live' || f.kind === 'updated') && visibleFree(p, now) != null;
};

/** How far from a favourite car park it still matters that it is filling up. */
export const FAV_RELEVANT_M = 3000;
/** Where to look for an alternative to a full favourite. */
export const ALT_RADIUS_M = 600;

/** A favourite car park near the user is (almost) full, and a roomy one is close to it. */
export function favFilling(
  favorites: readonly { id: string }[],
  parkings: readonly Parking[],
  here: LatLng | null,
  now: Date,
): Nudge | null {
  if (!here) return null;
  for (const fav of favorites) {
    const p = parkings.find((x) => x.id === fav.id);
    if (!p || !LIVE(p, now) || distanceMeters(here, p) > FAV_RELEVANT_M) continue;
    const free = visibleFree(p, now)!;
    const level = occupancyLevel(free, p.capacity);
    if (level !== 'few' && level !== 'full') continue;
    let alt: Extract<Nudge, { kind: 'favFilling' }>['alt'] | null = null;
    for (const q of parkings) {
      if (q.id === p.id || !LIVE(q, now)) continue;
      const qFree = visibleFree(q, now)!;
      if (occupancyLevel(qFree, q.capacity) !== 'plenty' || qFree < 10) continue;
      const d = distanceMeters(p, q);
      if (d <= ALT_RADIUS_M && (!alt || d < alt.distanceM))
        alt = { id: q.id, name: q.name, free: qFree, distanceM: d };
    }
    if (alt) return { kind: 'favFilling', fav: { id: p.id, name: p.name, free }, alt };
  }
  return null;
}

/** How close a saved restaurant has to be to say "it's right here". */
export const FAV_NEAR_M = 400;

/** A saved restaurant is within a few minutes' walk. */
export function favNearby(
  places: readonly ({ id: string; name: string } & LatLng)[],
  here: LatLng | null,
): Nudge | null {
  if (!here) return null;
  let best: Extract<Nudge, { kind: 'favNearby' }>['place'] | null = null;
  for (const r of places) {
    const d = distanceMeters(here, r);
    if (d <= FAV_NEAR_M && (!best || d < best.distanceM))
      best = { id: r.id, name: r.name, distanceM: d };
  }
  return best ? { kind: 'favNearby', place: best } : null;
}

/** Car parks this close count as "here" for the hard-parking check. */
export const HARD_RADIUS_M = 500;

/**
 * Every car park around with a live count is full or nearly full (at least two of them, so one
 * busy car park does not make a whole area "hard"), and a station is a short walk away.
 */
export function hardParking(
  parkings: readonly Parking[],
  here: LatLng | null,
  station: ({ name: string; distanceM: number } & LatLng) | null,
  now: Date,
): Nudge | null {
  if (!here || !station) return null;
  const live = parkings.filter((p) => distanceMeters(here, p) <= HARD_RADIUS_M && LIVE(p, now));
  if (live.length < 2) return null;
  const tight = live.every((p) => {
    const level = occupancyLevel(visibleFree(p, now), p.capacity);
    return level === 'few' || level === 'full';
  });
  if (!tight) return null;
  return {
    kind: 'hardParking',
    station: {
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      walkMin: walkMinutes(here, station),
    },
  };
}

/** Categories that suit each part of the day, in the order they are tried. */
export const MEAL_CATS: Record<MealSlot, FoodCategory[]> = {
  morning: ['breakfast', 'cafe'],
  noon: ['lokanta', 'meat', 'soup'],
  evening: ['fish', 'meyhane', 'meat'],
  night: ['soup', 'dessert', 'fast'],
};
/** Fewer than this nearby is not worth a suggestion. */
export const MEAL_MIN = 3;

/** The category of the hour with the most places around (at least MEAL_MIN). */
export function meal(
  here: LatLng | null,
  now: Date,
  countIn: (cat: FoodCategory) => number,
): Nudge | null {
  if (!here) return null;
  const slot = mealSlot(now.getHours());
  let best: { cat: FoodCategory; count: number } | null = null;
  for (const cat of MEAL_CATS[slot]) {
    const count = countIn(cat);
    if (count >= MEAL_MIN && (!best || count > best.count)) best = { cat, count };
  }
  return best ? { kind: 'meal', slot, cat: best.cat, count: best.count, here } : null;
}

/**
 * A count said the way a person would: the category of a place is often a guess, so above a
 * handful Yerim rounds down ("10'dan fazla") instead of naming an exact number.
 */
export function roundedCount(n: number): { key: 'few' | 'over'; count: number } {
  if (n >= 50) return { key: 'over', count: 50 };
  if (n >= 20) return { key: 'over', count: 20 };
  if (n >= 10) return { key: 'over', count: 10 };
  return { key: 'few', count: n };
}
