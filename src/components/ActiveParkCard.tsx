import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';

import { appleWalkingUrl, appleWalkToUrl, walkMinutes } from '@/data/geo';
import { estimateCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import { currentLocation } from '@/lib/location';
import { needsStillParkedPrompt } from '@/lib/park';
import { useApp, type ActivePark } from '@/store/app';
import { asym, fonts, useColors } from '@/theme';

import { Button } from './Button';
import { PBadge } from './PBadge';
import { Txt } from './Txt';
import { useNow } from '@/lib/useNow';

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

async function walkToCar(active: ActivePark, failed: string) {
  const from = await currentLocation(false, 3000);
  const url = from
    ? appleWalkingUrl(from, active, active.name)
    : appleWalkToUrl(active, active.name);
  await Linking.openURL(url).catch(() => Alert.alert(failed));
}

export function ActiveParkCard({ active }: { active: ActivePark }) {
  const c = useColors();
  const { t } = useTranslation();
  const now = useNow();
  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = estimateCost(active.hourly, elapsed / 60000);
  const duration = durationText(elapsed, t);
  const sub = [active.note, duration].filter(Boolean).join(' · ');
  const dest = active.destination;
  const endPark = useApp((s) => s.endPark);
  const stale = needsStillParkedPrompt(active, now);
  const [busy, setBusy] = useState(false);
  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('search.active')}: ${active.name}, ${duration}${cost != null ? `, ${t('favorites.estCost')} ${t('common.a11yLira', { price: cost })}` : ''}`}
      onPress={() => router.push('/favoriler')}
      style={[
        asym(22, 6),
        {
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      <PBadge size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
          {active.name}
        </Txt>
        <Txt variant="caption" secondary>
          {sub}
        </Txt>
      </View>
      {cost != null && (
        <Txt style={{ fontFamily: fonts.display, fontSize: 22 }} color={c.plenty}>
          ₺{cost}
        </Txt>
      )}
    </Pressable>
  );
  const actions = (
    <View style={{ gap: 8, paddingHorizontal: 4 }}>
      {stale && <StillParkedPrompt />}
      <Button
        label={t('search.goToCar')}
        disabled={busy}
        onPress={() => {
          if (busy) return;
          setBusy(true);
          void walkToCar(active, t('food.openFailed')).finally(() => setBusy(false));
        }}
      />
      {!stale && (
        <Button
          kind="danger"
          label={t('favorites.end')}
          onPress={() => confirmEndPark(t, endPark)}
        />
      )}
    </View>
  );
  if (!dest)
    return (
      <View style={{ gap: 8 }}>
        {card}
        {actions}
      </View>
    );
  const minutes = walkMinutes(active, dest);
  const summary = t('food.routeSummary', { park: active.name, count: minutes, name: dest.name });
  return (
    <View style={{ gap: 8 }}>
      {card}
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        <Txt
          variant="caption"
          accessibilityLabel={t('food.a11yRouteSummary', {
            park: active.name,
            count: minutes,
            name: dest.name,
          })}
        >
          {summary}
        </Txt>
        <View style={{ flexDirection: 'row' }}>
          <Button
            kind="secondary"
            label={t('food.walkingRoute')}
            onPress={() =>
              Linking.openURL(appleWalkingUrl(active, dest, dest.name)).catch(() =>
                Alert.alert(t('food.openFailed')),
              )
            }
          />
        </View>
      </View>
      {actions}
    </View>
  );
}
