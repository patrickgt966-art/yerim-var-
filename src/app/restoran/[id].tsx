import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ParkingCard } from '@/components/ParkingCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { appleMapsUrl, walkMinutes } from '@/data/geo';
import { cuisineLabels, getRestaurant, kindLabel, telUrl } from '@/data/restaurants';
import { useRanked } from '@/data/useParkings';
import { parkHere } from '@/lib/parkHere';
import { useColors } from '@/theme';

const NEAR_RADIUS_M = 1000;

function webUrl(w: string): string {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

/** OSM stores either a handle or a full URL. */
function instagramUrl(ig: string): string {
  if (/^https?:\/\//i.test(ig)) return ig;
  if (/instagram\.com\//i.test(ig)) return `https://${ig}`;
  return `https://instagram.com/${ig.replace(/^@/, '').replace(/^\/+/, '')}`;
}

export default function RestaurantDetail() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = getRestaurant(id ?? '');
  const target = useMemo(() => (r ? { lat: r.lat, lng: r.lng } : null), [r]);
  const tel = r?.phone ? telUrl(r.phone) : null;
  const { ranked, isLoading } = useRanked(target, NEAR_RADIUS_M);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert(t('food.openFailed')));
  };

  if (!r) {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          backgroundColor: c.bg,
        }}
      >
        <ScreenHeader title="" back />
        <Txt secondary>{t('food.notFound')}</Txt>
      </View>
    );
  }

  const meta = [kindLabel(r.kind, t), ...cuisineLabels(r.cuisines, t), r.address]
    .filter(Boolean)
    .join(' · ');
  const facts = [
    r.outdoorSeating != null ? t(r.outdoorSeating ? 'food.outdoor' : 'food.noOutdoor') : null,
    r.wheelchair != null ? t(r.wheelchair ? 'food.wheelchairYes' : 'food.wheelchairNo') : null,
  ].filter(Boolean);
  const nearest = ranked.slice(0, 3);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 32,
        gap: 14,
      }}
    >
      <ScreenHeader title={r.name} back />
      {!!meta && <Txt secondary>{meta}</Txt>}

      {!!r.openingHours && (
        <View style={{ gap: 2 }}>
          <Txt variant="label" secondary>
            {t('food.hours')}
          </Txt>
          <Txt>{r.openingHours}</Txt>
        </View>
      )}
      {facts.map((f) => (
        <Txt key={f} variant="caption" secondary>
          {f}
        </Txt>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {!!tel && <Button kind="secondary" label={t('food.call')} onPress={() => open(tel)} />}
        {!!r.website && (
          <Button
            kind="secondary"
            label={t('food.website')}
            onPress={() => open(webUrl(r.website!))}
          />
        )}
        {!!r.instagram && (
          <Button
            kind="secondary"
            label={t('food.instagram')}
            onPress={() => open(instagramUrl(r.instagram!))}
          />
        )}
        <Button
          kind="secondary"
          label={t('food.directions')}
          onPress={() => open(appleMapsUrl({ lat: r.lat, lng: r.lng }, r.name))}
        />
      </View>

      <Txt variant="title" accessibilityRole="header" style={{ marginTop: 6 }}>
        {t('food.parkTitle')}
      </Txt>
      {nearest.length === 0 ? (
        <Txt secondary>{isLoading ? t('food.parkLoading') : t('food.parkNone')}</Txt>
      ) : (
        nearest.map((p, i) => (
          <View key={p.id} style={{ gap: 6 }}>
            <ParkingCard
              parking={p}
              featured={i === 0}
              nearest={i === 0}
              onParkHere={() => parkHere(p)}
              onDetail={() => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
            />
            <Txt variant="caption" secondary style={{ paddingHorizontal: 4 }}>
              {t('food.parkWalk', { count: walkMinutes(p, r) })}
            </Txt>
          </View>
        ))
      )}

      <Txt variant="caption" secondary style={{ marginTop: 10 }}>
        {t('food.footer')}
      </Txt>
    </ScrollView>
  );
}
