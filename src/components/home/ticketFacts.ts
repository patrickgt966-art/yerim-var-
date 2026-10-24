import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import { matchesCategory, type FoodCategory, type NearbyRestaurant } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import { meal } from '@/lib/nudge';
import { isClosedNow, openState } from '@/lib/openNow';

/** "Within a short walk" on the Home tickets: about ten minutes. */
export const TICKET_WALK_MIN = 10;
/** The nearest car park counts only this close, as on the rest of Home. */
export const TICKET_PARK_RADIUS_M = 2000;
/** Places of a category counted for the meal-time line (same radius as Yerim's suggestion). */
export const TICKET_MEAL_RADIUS_M = 1000;

/**
 * What the "Otopark bul" / "Yemek bul" tickets may say besides a live free count. Every field is
 * a count or name taken from data already loaded, or null when it is not known (or zero): the
 * ticket then falls to the next fact, it never invents one.
 */
export type TicketFacts = {
  /** Car parks (not closed now) within about ten minutes' walk. */
  parkWithin: number | null;
  /** The nearest car park (an open one when there is any) within 2 km, with its walk. */
  nearestPark: { name: string; walk: number } | null;
  /** All car parks of the city in the list. */
  cityParks: number | null;
  /** Places known to be open now within about ten minutes' walk. */
  foodOpenNow: number | null;
  /** All places within about ten minutes' walk. */
  foodWithin: number | null;
  /** The meal of the hour with the most places around (see `meal` in nudge). */
  mealNear: { cat: FoodCategory; count: number } | null;
  /** All places of the city. */
  cityFood: number | null;
};

export const NO_TICKET_FACTS: TicketFacts = {
  parkWithin: null,
  nearestPark: null,
  cityParks: null,
  foodOpenNow: null,
  foodWithin: null,
  mealNear: null,
  cityFood: null,
};

const orNull = (n: number) => (n > 0 ? n : null);

/**
 * `around`: restaurants within TICKET_MEAL_RADIUS_M of `here` (nearest first); `cityFood`: how
 * many places the city has. Without a position only the city counts remain.
 */
export function ticketFacts(d: {
  here: LatLng | null;
  parkings: readonly Parking[] | undefined;
  around: readonly NearbyRestaurant[];
  cityFood: number;
  now: Date;
}): TicketFacts {
  const { here, parkings, around, now } = d;
  const facts: TicketFacts = {
    ...NO_TICKET_FACTS,
    cityParks: orNull(parkings?.length ?? 0),
    cityFood: orNull(d.cityFood),
  };
  if (!here) return facts;

  const open = (parkings ?? []).filter((p) => !isClosedNow(p, now));
  facts.parkWithin = orNull(open.filter((p) => walkMinutes(here, p) <= TICKET_WALK_MIN).length);
  // An open car park first; when all around are closed, the nearest closed one still names the area.
  let best: Parking | null = null;
  let bestD = Infinity;
  for (const p of open.length > 0 ? open : (parkings ?? [])) {
    const dist = distanceMeters(here, p);
    if (dist <= TICKET_PARK_RADIUS_M && dist < bestD) {
      best = p;
      bestD = dist;
    }
  }
  if (best) facts.nearestPark = { name: best.name, walk: walkMinutes(here, best) };

  const within = around.filter((r) => walkMinutes(here, r) <= TICKET_WALK_MIN);
  facts.foodWithin = orNull(within.length);
  facts.foodOpenNow = orNull(
    within.filter((r) => openState({ openingHoursText: r.openingHours }, now) === 'open').length,
  );
  const m = meal(here, now, (cat) => around.filter((r) => matchesCategory(r, cat)).length);
  if (m && m.kind === 'meal') facts.mealNear = { cat: m.cat, count: m.count };
  return facts;
}
