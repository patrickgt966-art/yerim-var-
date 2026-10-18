import type { QueryIntent } from '@/data/intent';
import type { Restaurant } from '@/data/restaurants';
import { fold, type SearchHit } from '@/data/search';

export type SubmitTarget =
  { kind: 'restaurant'; id: string } | { kind: 'place'; hit: SearchHit } | { kind: 'ask' };

const ASK: SubmitTarget = { kind: 'ask' };

/**
 * What the keyboard's "Ara" key opens: the obvious place or restaurant when the text is just a
 * name, the chat for anything that asks for more. `restaurants` and `places` are the suggestions
 * for the text, best first.
 */
export function submitTarget(
  query: string,
  intent: QueryIntent,
  restaurants: Restaurant[],
  places: SearchHit[],
): SubmitTarget {
  if (intent.kind !== 'search') return ASK;
  const q = fold(query);
  const place = places[0];
  const restaurant = restaurants[0];
  // An exact name wins, even when it holds a food word ("Köfteci Yusuf"); a place before a restaurant.
  if (place && fold(place.name) === q) return { kind: 'place', hit: place };
  if (restaurant && fold(restaurant.name) === q) return { kind: 'restaurant', id: restaurant.id };
  // "balık", "yakınımda", "otoparklı", "ucuz": more than a name.
  if (
    intent.cat ||
    intent.notCat ||
    intent.dish ||
    intent.food ||
    intent.nearMe ||
    intent.requireParking ||
    intent.quality ||
    intent.uncertain
  ) {
    return ASK;
  }
  if (place) return { kind: 'place', hit: place };
  if (restaurant && q) {
    const nameWords = fold(restaurant.name).split(' ');
    if (q.split(' ').every((w) => nameWords.includes(w))) {
      return { kind: 'restaurant', id: restaurant.id };
    }
  }
  return ASK;
}
