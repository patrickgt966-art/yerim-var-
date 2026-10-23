import { useTranslation } from 'react-i18next';

import { activeCity, hasLiveParking } from '@/data/cities';
import { ageSince, formatClock } from '@/data/freshness';
import type { ParkingResult } from '@/data/types';
import { useAnnounce } from '@/lib/a11y';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { useColors } from '@/theme';

import { YerimNote } from './mascot/YerimNote';

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
  // How Yerim looks saying it: worried when something failed, thinking for sample data.
  let eyes: 'sad' | 'up' = 'sad';
  const noLive =
    result?.source === 'static-only' && !result.fallbackReason && !hasLiveParking(city);
  if (!result) text = null;
  else if (result.source === 'mock') {
    text = t('freshness.sampleBanner');
    eyes = 'up';
  }
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
    <YerimNote accessibilityRole="alert" text={text} eyes={eyes} bg={c.warnBg} fg={c.warnText} />
  );
}

/** Informational, not an alert: this city never had live counts. */
function NoLiveNote({ text }: { text: string }) {
  const c = useColors();
  return <YerimNote text={text} bg={c.badgeInfoBg} fg={c.badgeInfoText} />;
}
