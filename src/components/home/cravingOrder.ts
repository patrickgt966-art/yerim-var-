import type { CravingId } from './CravingIcon';

/** Part of the day the craving tiles are ordered for. */
export type MealSlot = 'morning' | 'noon' | 'evening' | 'night';

/** Tiles that lead in each slot (design V5.1 "saate göre sıralama"); the rest keep their order. */
const FIRST: Record<MealSlot, CravingId[]> = {
  morning: ['breakfast', 'coffee', 'soup'],
  noon: ['chickenRice', 'kebab', 'lahmacun', 'soup'],
  evening: ['meyhane', 'fish', 'kebab', 'world'],
  night: ['lahmacun', 'soup', 'dessert', 'kebab'],
};

/** 05–11 morning, 11–16 noon, 16–22 evening, 22–05 night (local hour, 0–23). */
export function mealSlot(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'noon';
  if (hour >= 16 && hour < 22) return 'evening';
  return 'night';
}

/** `ids` reordered for the hour: the slot's leading tiles first, then the others as given. */
export function orderCravings(ids: readonly CravingId[], hour: number): CravingId[] {
  const first = FIRST[mealSlot(hour)].filter((id) => ids.includes(id));
  return [...first, ...ids.filter((id) => !first.includes(id))];
}
