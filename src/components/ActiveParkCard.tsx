import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { parkCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import { needsStillParkedPrompt } from '@/lib/park';
import { useNow } from '@/lib/useNow';
import { useApp, type ActivePark } from '@/store/app';
import { brand, fonts } from '@/theme';

import { Button } from './Button';
import { ParkReminder } from './ParkReminder';
import { Txt } from './Txt';

/** Shared by home and Favoriler so the wording and the confirm are identical. */
export function confirmEndPark(t: TFunction, endPark: () => void) {
  Alert.alert(t('favorites.endConfirmTitle'), t('favorites.endConfirmBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('favorites.endConfirmYes'), style: 'destructive', onPress: endPark },
  ]);
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
        </>
      )}
    </View>
  );
}
