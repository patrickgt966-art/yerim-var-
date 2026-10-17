import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { occupancyLevel } from '@/data/freshness';
import { brand, fonts, statusTone, useColors } from '@/theme';

import { Txt } from './Txt';

/**
 * Map pin: a white "P 24" pill whose count uses the shared status colour.
 * `quiet`: a car park without a live count; a smaller brand-navy bay with
 * just the P, so live pins stand out and no "?" suggests an error.
 */
export function PPin({
  free,
  capacity,
  selected,
  quiet,
}: {
  free: number | null;
  capacity: number | null;
  selected?: boolean;
  quiet?: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();
  if (quiet) {
    const s = selected ? 1.15 : 1;
    // Transparent 44 pt box: the visible bay is small, the tap target is not.
    return (
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 26 * s,
            height: 34 * s,
            borderRadius: 8,
            backgroundColor: brand.navy,
            borderWidth: 2,
            borderColor: brand.white,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: brand.navy,
            shadowOpacity: 0.22,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Txt
            allowFontScaling={false}
            style={{ fontFamily: fonts.display, fontSize: 14, lineHeight: 17 }}
            color={brand.white}
          >
            P
          </Txt>
        </View>
      </View>
    );
  }
  const level = occupancyLevel(free, capacity);
  const { fg } = statusTone(level);
  const k = selected ? 1.15 : 1;
  // White pill "P 24" (design V5.1): the count carries the status colour, "Dolu" says full in
  // words as well. The selected pin gets a navy ring.
  return (
    <View style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          minHeight: 30 * k,
          paddingHorizontal: 9 * k,
          borderRadius: 12 * k,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: brand.white,
          borderWidth: selected ? 2.5 : 1,
          borderColor: selected ? brand.navy : c.chipBg,
          shadowColor: brand.navy,
          shadowOpacity: 0.2,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 13 * k, lineHeight: 17 * k }}
          color={brand.navy}
        >
          P
        </Txt>
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 15 * k, lineHeight: 19 * k }}
          color={fg}
        >
          {level === 'full' ? t('a11y.levelFull') : free == null ? '?' : String(free)}
        </Txt>
      </View>
    </View>
  );
}
