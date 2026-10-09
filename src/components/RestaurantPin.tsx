import { View } from 'react-native';

import type { Restaurant } from '@/data/restaurants';
import { categoryOf } from '@/data/restaurants';
import { brand } from '@/theme';

import { Icon } from './Icon';
import { CATEGORY_ICON } from './foodCategory';

/**
 * Small round restaurant pin, clearly different from the P bay: orange disc
 * with the category icon (cutlery when uncategorised).
 */
export function RestaurantPin({
  restaurant,
  selected,
}: {
  restaurant: Restaurant;
  selected?: boolean;
}) {
  const cat = categoryOf(restaurant);
  const size = selected ? 34 : 28;
  // Transparent 44 pt box keeps the tap target large.
  return (
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: brand.orange,
          borderWidth: 2,
          borderColor: brand.white,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: brand.navy,
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Icon name={cat ? CATEGORY_ICON[cat] : 'cutlery'} size={size - 12} color={brand.navy} />
      </View>
    </View>
  );
}
