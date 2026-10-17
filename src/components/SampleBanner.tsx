import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { activeCity, hasLiveParking } from '@/data/cities';
import { ageSince, formatClock } from '@/data/freshness';
import type { ParkingResult } from '@/data/types';
import { useAnnounce } from '@/lib/a11y';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { asym, useColors } from '@/theme';

import { Txt } from './Txt';

/**
 * Says when the list is not a fresh download: sample data, or the last
 * result saved on the device. Renders nothing for fresh data. A city without a live parking API
 * (Ankara) gets a calm, non-alert note instead, because nothing has gone wrong there.
 */
export function SampleBanner({ result }: { result: ParkingResult | undefined }) {
  const c = useColors();
  const nowMs = useNow(30_000);
  const { t } = useTranslation();
  useApp((s) => s.city); // re-render when the city changes
  const city = activeCity();
  let text: string | null = null;
  const noLive =
    result?.source === 'static-only' && !result.fallbackReason && !hasLiveParking(city);
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
  // Keyed by kind: the offline text's age changes every minute.
  useAnnounce(text, 0, text ? `${result?.source}|${result?.offline ?? false}` : undefined);
  if (!text) {
    return noLive ? (
      <NoLiveNote text={t('freshness.noLiveBanner', { place: city.locative, city: city.name })} />
    ) : null;
  }
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

/** Informational, not an alert: this city never had live counts. */
function NoLiveNote({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={[asym(14, 4), { backgroundColor: c.badgeInfoBg, padding: 10 }]}>
      <Txt variant="caption" color={c.badgeInfoText}>
        {text}
      </Txt>
    </View>
  );
}
