import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ageSince, formatClock } from '@/data/freshness';
import type { ParkingResult } from '@/data/types';
import { useNow } from '@/lib/useNow';
import { asym, useColors } from '@/theme';

import { Txt } from './Txt';

/**
 * Says when the list is not a fresh download: sample data, or the last
 * result saved on the device. Renders nothing for fresh data.
 */
export function SampleBanner({ result }: { result: ParkingResult | undefined }) {
  const c = useColors();
  const nowMs = useNow(30_000);
  const { t } = useTranslation();
  if (!result) return null;
  let text: string | null = null;
  if (result.source === 'mock') text = t('freshness.sampleBanner');
  else if (result.offline)
    text = t('freshness.offlineBanner', {
      time: formatClock(new Date(result.fetchedAt)),
      age: ageSince(result.fetchedAt, new Date(nowMs)),
    });
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[asym(14, 4), { backgroundColor: c.warnBg, padding: 10 }]}
    >
      <Txt variant="caption" color={c.warnText}>
        {text}
      </Txt>
    </View>
  );
}
