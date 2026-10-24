import { useTranslation } from 'react-i18next';

import { activeCity, hasLiveParking } from '@/data/cities';
import { ageSince, formatClock, sourceName } from '@/data/freshness';
import type { ParkingResult } from '@/data/types';
import { useAnnounce } from '@/lib/a11y';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { useColors } from '@/theme';

import { Txt } from './Txt';
import { YerimNote } from './mascot/YerimNote';

/**
 * Says when the list is not a fresh download: sample data, or the last
 * result saved on the device. Renders nothing for fresh data. A city without a live parking API
 * (Ankara) gets a calm, non-alert note instead, because nothing has gone wrong there.
 */
export function SampleBanner({
  result,
  muted = false,
  updating = true,
}: {
  result: ParkingResult | undefined;
  /** Food lists: a small muted line, never the warning card (food leads there). */
  muted?: boolean;
  /** False where the screen shows its own "live data is coming" line. */
  updating?: boolean;
}) {
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
  // A failed load only means the city source did not answer; it says nothing about the internet.
  else if (result.offline)
    text = t('freshness.sourceDownBanner', {
      source: sourceName(result.source),
      time: formatClock(new Date(result.fetchedAt)),
      age: ageSince(result.fetchedAt, new Date(nowMs)),
    });
  // Saved data on screen while the live load runs: calm, nothing has failed.
  else if (result.fromCache && updating) text = t('freshness.updating');
  // iOS does not read a banner that appears by itself.
  // Keyed by kind: the offline text's age changes every minute.
  // The calm "updating" line is not announced; it is no news.
  const announced = result?.fromCache && updating ? null : text;
  useAnnounce(
    announced,
    0,
    announced ? `${result?.source}|${result?.offline ?? false}` : undefined,
  );
  if (!text) {
    return noLive ? (
      <NoLiveNote text={t('freshness.noLiveBanner', { place: city.locative, city: city.name })} />
    ) : null;
  }
  // Calm lines: the saved data is being refreshed; or a food list, where food comes first.
  if (muted || (result?.fromCache && updating)) {
    return (
      <Txt variant="caption" secondary>
        {text}
      </Txt>
    );
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
