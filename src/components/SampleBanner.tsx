import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ageSince, formatClock } from '@/data/freshness';
import type { ParkingResult } from '@/data/types';
import { useAnnounce } from '@/lib/a11y';
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
  let text: string | null = null;
  if (!result) text = null;
  else if (result.source === 'mock') text = t('freshness.sampleBanner');
  // No fallbackReason: the first download is still running, nothing has failed yet.
  else if (result.source === 'static-only' && result.fallbackReason)
    text = t('freshness.staticOnlyBanner');
  else if (result.offline)
    text = t('freshness.offlineBanner', {
      time: formatClock(new Date(result.fetchedAt)),
      age: ageSince(result.fetchedAt, new Date(nowMs)),
    });
  // iOS does not read a banner that appears by itself.
  useAnnounce(text);
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
