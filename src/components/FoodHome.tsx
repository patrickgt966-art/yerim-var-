import { router } from 'expo-router';

import { activeCity, isInCityArea } from '@/data/cities';
import { dishProfile } from '@/data/dishes';
import { distanceMeters, type LatLng } from '@/data/geo';
import { popularPlaces } from '@/data/places';
import {
  allRestaurants,
  hasWordForm,
  type FoodCategory,
  type Restaurant,
} from '@/data/restaurants';
import { fold } from '@/data/search';
import { currentLocation } from '@/lib/location';

export type FoodOpts = { park?: boolean; dish?: string; quality?: boolean };

/** Opens the restaurant list around a point. */
export function openFood(target: LatLng, label: string, cat?: FoodCategory, opts?: FoodOpts) {
  router.push({
    pathname: '/restoranlar',
    params: {
      lat: String(target.lat),
      lng: String(target.lng),
      label,
      ...(cat ? { cat } : {}),
      ...(opts?.park ? { park: '1' } : {}),
      ...(opts?.dish ? { dish: opts.dish } : {}),
      ...(opts?.quality ? { quality: '1' } : {}),
    },
  });
}

/** Kordon in İzmir; a city without popular places falls back to its own centre. */
function fallbackPlace(): { name: string } & LatLng {
  const places = popularPlaces();
  return (
    places.find((p) => p.id === 'kordon') ??
    places[0] ?? { name: activeCity().name, ...activeCity().center }
  );
}

const LOCATION_TIMEOUT_MS = 5000;

/** The user's location if known quickly and inside the city, else the city's fallback place. */
async function foodCenter(
  ask: boolean,
  myLabel: string,
): Promise<{ target: LatLng; label: string }> {
  const here = await currentLocation(ask, LOCATION_TIMEOUT_MS);
  if (here && isInCityArea(here)) return { target: here, label: myLabel };
  const fallback = fallbackPlace();
  return { target: fallback, label: fallback.name };
}

/** Around the user when location is already granted (or `ask`), else the city fallback (Kordon in İzmir). */
export async function openFoodNearMe(
  label: string,
  cat?: FoodCategory,
  ask = false,
  opts?: FoodOpts,
) {
  const { target, label: shown } = await foodCenter(ask, label);
  openFood(target, shown, cat, opts);
}

// Keyed by city id: a switch must never serve the old city's restaurants.
let folded: { city: string; list: { r: Restaurant; key: string }[] } | null = null;

/** Same-name chain branches kept in the suggestions (the nearest ones). */
const MAX_SAME_NAME = 2;

/**
 * Up to `limit` restaurants whose name contains the query (min 2 characters;
 * a complete dish word must be a whole name word),
 * names that start with it first, each group nearest to `from` first (the
 * user, else the search target; the city's fallback place when neither is known). A chain keeps
 * only its nearest branches.
 */
export function matchRestaurants(
  query: string,
  limit = 5,
  from: LatLng = fallbackPlace(),
): Restaurant[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const city = activeCity().id;
  if (folded?.city !== city) {
    folded = { city, list: allRestaurants().map((r) => ({ r, key: fold(r.name) })) };
  }
  // A complete dish ("pişi") only matches names that carry it as a word, not "Balık Pişiricisi".
  const wholeWord = dishProfile(q)?.dish === q;
  const starts: { r: Restaurant; d: number }[] = [];
  const inside: { r: Restaurant; d: number }[] = [];
  for (const x of folded.list) {
    if (wholeWord && !hasWordForm(x.key, q)) continue;
    const hit = x.key.startsWith(q) ? starts : x.key.includes(q) ? inside : null;
    if (hit) hit.push({ r: x.r, d: distanceMeters(from, x.r) });
  }
  const perName = new Map<string, number>();
  const out: Restaurant[] = [];
  for (const { r } of [starts, inside].flatMap((g) => g.sort((a, b) => a.d - b.d))) {
    const key = fold(r.name);
    const n = perName.get(key) ?? 0;
    if (n >= MAX_SAME_NAME) continue;
    perName.set(key, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
