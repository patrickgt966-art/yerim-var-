import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { occupancyLevel } from '@/data/freshness';
import { useColors } from '@/theme';

import { freeCells, SLOT_COUNT } from './slots';
import { Txt } from './Txt';

type Props = { free: number | null; capacity: number | null };

/** "Yer şeridi": 10 mini bays; filled bays grey, free bays dashed. */
export function SlotStrip({ free, capacity }: Props) {
  const c = useColors();
  const { t } = useTranslation();
  const n = freeCells(free, capacity);
  const level = occupancyLevel(free, capacity);
  const dashColor = level === 'plenty' ? c.plenty : c.few;
  const label =
    free == null || n == null
      ? t('results.a11yStripUnknown')
      : capacity
        ? t('results.a11yStrip', { capacity, free })
        : `${free} ${t('common.free')}`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
    >
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const isFree = n != null && i >= SLOT_COUNT - n;
        return (
          <View
            key={i}
            style={{
              width: 9,
              height: 15,
              borderRadius: 3,
              ...(isFree
                ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: dashColor }
                : { backgroundColor: n == null ? c.chipBg : c.slotFilled }),
            }}
          />
        );
      })}
      <Txt variant="label" secondary style={{ marginLeft: 6 }}>
        {free == null ? '— / ' + (capacity ?? '—') : `${free} / ${capacity ?? '—'}`}
      </Txt>
    </View>
  );
}
