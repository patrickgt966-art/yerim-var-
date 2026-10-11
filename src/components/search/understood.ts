import { typedPlaceText, type QueryIntent } from '@/data/intent';
import type { FoodCategory } from '@/data/restaurants';

export type UnderstoodChip = { key: string; emoji: string; label: string };

export type UnderstoodLabels = {
  cat: (cat: FoodCategory) => string;
  nearMe: string;
  parking: string;
  exclude: (what: string) => string;
};

const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);

/**
 * The "Anladığım:" chips for a typed query: dish or category, place, near me,
 * car park required, ruled-out category. Empty when nothing was understood
 * (greeting, gibberish, off-topic, or a search with no usable part).
 */
export function understoodChips(
  intent: QueryIntent,
  raw: string,
  labels: UnderstoodLabels,
): UnderstoodChip[] {
  if (intent.kind !== 'search') return [];
  const chips: UnderstoodChip[] = [];
  if (intent.dish) chips.push({ key: 'dish', emoji: '🍽️', label: intent.dish });
  else if (intent.cat) chips.push({ key: 'cat', emoji: '🍽️', label: labels.cat(intent.cat) });
  if (intent.district) {
    chips.push({ key: 'district', emoji: '📍', label: intent.district.name });
  }
  // Leftover words we could not place are not "understood".
  if (intent.placeQuery && !intent.uncertain) {
    chips.push({
      key: 'place',
      emoji: '📍',
      label: capitalize(typedPlaceText(raw, intent.placeQuery)),
    });
  }
  if (intent.nearMe) chips.push({ key: 'nearMe', emoji: '📍', label: labels.nearMe });
  if (intent.requireParking) chips.push({ key: 'parking', emoji: '🅿️', label: labels.parking });
  if (intent.notCat) {
    chips.push({ key: 'notCat', emoji: '🚫', label: labels.exclude(labels.cat(intent.notCat)) });
  }
  return chips;
}

/** Which chat section a typed query belongs to: food when it asks for a category or food. */
export function sectionFor(intent: QueryIntent): 'food' | 'park' {
  return intent.kind === 'search' && (intent.cat || intent.food) ? 'food' : 'park';
}
