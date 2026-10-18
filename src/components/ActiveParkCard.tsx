import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { parkCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import { needsStillParkedPrompt } from '@/lib/park';
import { backToCar } from '@/lib/parkHere';
import { maybeAskForRating } from '@/lib/rating';
import { useNow } from '@/lib/useNow';
import { useApp, type ActivePark } from '@/store/app';
import { brand, fonts, HIT } from '@/theme';

import { Button } from './Button';
import { ParkReminder } from './ParkReminder';
import { Txt } from './Txt';

/** A park ended with "Bitir" counts as a done park (for the rating prompt) after this long. */
const COUNTS_AS_DONE_MS = 10 * 60_000;
/** Lets the end confirm close before the rating sheet may appear. */
const RATING_DELAY_MS = 1500;

/** Shared by home and Favoriler so the wording and the confirm are identical. */
export function confirmEndPark(t: TFunction, endPark: () => void) {
  const end = () => {
    const active = useApp.getState().active;
    const lasted = active ? Date.now() - new Date(active.startedAt).getTime() : 0;
    endPark();
    if (lasted < COUNTS_AS_DONE_MS) return;
    useApp.setState((s) => ({ parksDone: s.parksDone + 1 }));
    setTimeout(() => void maybeAskForRating(), RATING_DELAY_MS);
  };
  Alert.alert(t('favorites.endConfirmTitle'), t('favorites.endConfirmBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('favorites.endConfirmYes'), style: 'destructive', onPress: end },
  ]);
}

/** A park started by mistake can be undone for this long. */
const UNDO_MS = 10 * 60_000;

/** "Yanlışlıkla mı? Geri al": ends the park without asking, for the first 10 minutes (key it by the start time). */
export function UndoPark({ active }: { active: ActivePark }) {
  const { t } = useTranslation();
  const endPark = useApp((s) => s.endPark);
  const started = new Date(active.startedAt).getTime();
  const [expired, setExpired] = useState(() => Date.now() - started >= UNDO_MS);
  useEffect(() => {
    if (expired) return;
    const id = setTimeout(() => setExpired(true), Math.max(0, UNDO_MS - (Date.now() - started)));
    return () => clearTimeout(id);
  }, [expired, started]);
  if (expired || active.confirmedAt) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('park.undo')}
      onPress={endPark}
      hitSlop={4}
      style={{ minHeight: HIT, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 14 }} color={brand.navy}>
        {t('park.undo')}
      </Txt>
    </Pressable>
  );
}

/** "Hâlâ park hâlinde misin?" with Evet / Bitir; shown for parks older than 12 h. */
export function StillParkedPrompt() {
  const { t } = useTranslation();
  const endPark = useApp((s) => s.endPark);
  const confirmPark = useApp((s) => s.confirmPark);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyBold">{t('search.stillParkedTitle')}</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          kind="secondary"
          label={t('search.stillParkedYes')}
          accessibilityLabel={t('a11y.stillParkedYes')}
          onPress={confirmPark}
          style={{ flex: 1 }}
        />
        <Button
          kind="danger"
          label={t('favorites.end')}
          onPress={() => confirmEndPark(t, endPark)}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

/** One big figure with its small green label ("Geçen süre", "Tahmini ücret"). */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt
        style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 17 }}
        color={brand.mintText}
      >
        {label}
      </Txt>
      <Txt
        style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }}
        maxFontSizeMultiplier={1.6}
      >
        {value}
      </Txt>
    </View>
  );
}

/**
 * The active park on Favoriler (design V5.1): mint card with a green edge, elapsed time and the
 * estimated cost in big figures, the reminder chips and "Parkı bitir". After 12 h the reminder
 * and the end button give way to "Hâlâ park hâlinde misin?".
 */
export function ActiveParkCard({ active }: { active: ActivePark }) {
  const { t } = useTranslation();
  const now = useNow(15_000);
  const endPark = useApp((s) => s.endPark);
  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = parkCost(active.parkingId, active.hourly, elapsed / 60000);
  const duration = durationText(elapsed, t);
  const stale = needsStillParkedPrompt(active, now);
  return (
    <View
      testID="active-park-card"
      style={{
        borderRadius: 22,
        borderLeftWidth: 4,
        borderLeftColor: brand.mintText,
        padding: 16,
        gap: 12,
        backgroundColor: brand.mintSoft,
      }}
    >
      <View
        accessible
        accessibilityLabel={`${t('favorites.activeTitle')}: ${active.name}. ${t('favorites.elapsed')} ${duration}${cost != null ? `. ${t('favorites.estCost')} ${t('common.a11yLira', { price: cost })}` : ''}`}
        style={{ gap: 10 }}
      >
        <View style={{ gap: 2 }}>
          <Txt
            style={{
              fontFamily: fonts.bodyExtraBold,
              fontSize: 12,
              lineHeight: 16,
              letterSpacing: 1,
            }}
            color={brand.mintText}
          >
            {t('favorites.activeLabel')}
          </Txt>
          <Txt
            style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 25 }}
            numberOfLines={2}
          >
            {active.name}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 8 }}>
          <Figure label={t('favorites.elapsed')} value={duration} />
          {cost != null && (
            <Figure label={t('favorites.estCost')} value={t('home.activeCost', { cost })} />
          )}
        </View>
      </View>
      <Button
        kind="secondary"
        label={t('park.backToCar')}
        onPress={() => void backToCar(active)}
        style={{ alignSelf: 'stretch' }}
      />
      {stale ? (
        <StillParkedPrompt />
      ) : (
        <>
          <ParkReminder active={active} />
          <Button
            label={t('favorites.end')}
            onPress={() => confirmEndPark(t, endPark)}
            style={{ alignSelf: 'stretch' }}
          />
          <UndoPark key={active.startedAt} active={active} />
        </>
      )}
    </View>
  );
}
