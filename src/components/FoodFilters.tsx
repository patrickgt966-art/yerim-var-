import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { CATEGORY_ICON } from '@/components/foodCategory';
import type { FoodCategory } from '@/data/restaurants';

/** One row of chips: scrolls sideways, or wraps when the text size is large. */
export function ChipRow({ wrap, children }: { wrap: boolean; children: ReactNode }) {
  return wrap ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
  ) : (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Food level of the results: what to eat, then "Otoparklı". `allLabel` adds a first chip for "no
 * kind chosen" (the restaurant list); without it a kind is switched off by pressing it again.
 */
export function FoodKindChips({
  kinds,
  selected,
  onSelect,
  allLabel,
  parkOn,
  onToggleParking,
}: {
  kinds: FoodCategory[];
  selected: FoodCategory | null;
  onSelect: (cat: FoodCategory | null) => void;
  allLabel?: string;
  parkOn: boolean;
  onToggleParking: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {allLabel != null && (
        <Chip label={allLabel} selected={selected == null} onPress={() => onSelect(null)} />
      )}
      {kinds.map((cat) => (
        <Chip
          key={cat}
          label={t(`food.cats.${cat}`)}
          icon={CATEGORY_ICON[cat]}
          selected={selected === cat}
          onPress={() => onSelect(allLabel != null || selected !== cat ? cat : null)}
        />
      ))}
      <Chip label={t('food.withParking')} selected={parkOn} onPress={onToggleParking} />
    </>
  );
}

export type ParkSubFilters = {
  indoorOnly: boolean;
  freeOnly: boolean;
  railOnly: boolean;
  nonstopOnly: boolean;
};

/** Car park sub-filters of "Otoparklı" (food lists); they exist only while it is on. */
export function ParkSubChips({
  value,
  onChange,
}: {
  value: ParkSubFilters;
  onChange: (next: ParkSubFilters) => void;
}) {
  const { t } = useTranslation();
  const flip = (k: keyof ParkSubFilters) => onChange({ ...value, [k]: !value[k] });
  return (
    <>
      <Chip
        label={t('results.indoor')}
        selected={value.indoorOnly}
        onPress={() => flip('indoorOnly')}
      />
      <Chip label={t('results.free')} selected={value.freeOnly} onPress={() => flip('freeOnly')} />
      <Chip
        label={t('results.nearRail')}
        selected={value.railOnly}
        onPress={() => flip('railOnly')}
      />
      <Chip
        label={t('results.nonstop')}
        selected={value.nonstopOnly}
        onPress={() => flip('nonstopOnly')}
      />
    </>
  );
}
