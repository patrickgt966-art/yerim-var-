import type { FoodCategory } from '@/data/restaurants';

import type { IconName } from './Icon';

/** Icon per food category; `cutlery` is the fallback for uncategorised places. */
export const CATEGORY_ICON: Record<FoodCategory, IconName> = {
  breakfast: 'egg',
  soup: 'bowl',
  meat: 'flame',
  lokanta: 'cutlery',
  fish: 'fish',
  cafe: 'cup',
  meyhane: 'glass',
  fast: 'burger',
  dessert: 'icecream',
};
