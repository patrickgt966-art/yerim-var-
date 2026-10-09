import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNow } from '@/components/ActiveParkCard';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PBadge } from '@/components/PBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Row, Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { formatClock } from '@/data/freshness';
import {
  cuisineLabels,
  getRestaurant,
  kindLabel,
  parkingInfo,
  type Restaurant,
} from '@/data/restaurants';
import { estimateCost } from '@/data/tariffs';
import { useParkings } from '@/data/useParkings';
import { durationText } from '@/lib/format';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';

function ActiveSection() {
  const { t } = useTranslation();
  const active = useApp((s) => s.active);
  const endPark = useApp((s) => s.endPark);
  const now = useNow(15_000);
  if (!active) {
    return (
      <Section title={t('favorites.activeTitle')}>
        <Txt secondary>{t('favorites.noActive')}</Txt>
      </Section>
    );
  }
  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = estimateCost(active.hourly, elapsed / 60000);
  return (
    <Section title={t('favorites.activeTitle')}>
      <Txt style={{ fontFamily: fonts.display, fontSize: 20 }}>{active.name}</Txt>
      <Row label={t('favorites.elapsed')} value={durationText(elapsed, t)} />
      <Row label={t('favorites.estCost')} value={cost != null ? `₺${cost}` : t('common.unknown')} />
      <Button
        kind="danger"
        label={t('favorites.end')}
        onPress={() =>
          Alert.alert(t('favorites.end'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('favorites.end'), style: 'destructive', onPress: endPark },
          ])
        }
      />
    </Section>
  );
}

type FavTab = 'parkings' | 'restaurants';

function FavTabs({ tab, onChange }: { tab: FavTab; onChange: (t: FavTab) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const options: { id: FavTab; label: string }[] = [
    { id: 'parkings', label: t('favorites.tabParkings') },
    { id: 'restaurants', label: t('favorites.tabRestaurants') },
  ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('favorites.tabsLabel')}
      style={{ flexDirection: 'row', gap: 8 }}
    >
      {options.map((o) => {
        const selected = tab === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            style={[
              asym(HIT / 2, 6),
              {
                minHeight: HIT,
                minWidth: 112,
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? c.text : c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Txt variant="bodyBold" color={selected ? c.bg : c.text} style={{ fontSize: 15 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function RestaurantFavorites() {
  const c = useColors();
  const { t } = useTranslation();
  const ids = useApp((s) => s.favoriteRestaurants);
  const toggle = useApp((s) => s.toggleFavoriteRestaurant);
  const { data } = useParkings();
  // Ids no longer in the bundled data are skipped silently.
  const items = useMemo(
    () => ids.map((id) => getRestaurant(id)).filter((r): r is Restaurant => r != null),
    [ids],
  );
  if (items.length === 0) return <Txt secondary>{t('favorites.emptyRestaurants')}</Txt>;
  const parkings = data?.parkings ?? [];
  const now = new Date();
  return (
    <>
      {items.map((r) => {
        const meta = [kindLabel(r.kind, t), ...cuisineLabels(r.cuisines, t).slice(0, 2)]
          .filter(Boolean)
          .join(' · ');
        const { parking, nearbyCount } = parkingInfo(r, parkings, now);
        const near = parking
          ? t('food.nearbyParkings', {
              count: Math.max(nearbyCount, 1),
              distance: parking.distanceM,
            })
          : data
            ? t('food.noParking')
            : '';
        const free =
          parking && parking.free != null && parking.at
            ? t('food.freeSpotsAt', { count: parking.free, time: formatClock(parking.at) })
            : null;
        const parkText = [near, free].filter(Boolean).join(' · ');
        return (
          <View
            key={r.id}
            style={[
              asym(22, 6),
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('favorites.a11yRestaurant', {
                name: r.name,
                meta,
                parking: parkText,
              })}
              onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
              style={{ flex: 1, minHeight: HIT, gap: 3, justifyContent: 'center' }}
            >
              <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
                {r.name}
              </Txt>
              {!!meta && (
                <Txt variant="caption" secondary numberOfLines={2}>
                  {meta}
                </Txt>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }}>
                <PBadge size={18} />
                <Txt variant="caption" style={{ flex: 1 }} numberOfLines={3}>
                  {parkText}
                </Txt>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('favorites.a11yRemoveRestaurant', { name: r.name })}
              onPress={() => toggle(r.id)}
              style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="starFilled" color={c.accent} />
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

export default function FavoritesScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const [tab, setTab] = useState<FavTab>('parkings');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 14,
      }}
    >
      <ScreenHeader title={t('favorites.title')} />
      <ActiveSection />
      <FavTabs tab={tab} onChange={setTab} />
      {tab === 'restaurants' ? (
        <RestaurantFavorites />
      ) : favorites.length === 0 ? (
        <Txt secondary>{t('favorites.empty')}</Txt>
      ) : (
        favorites.map((f) => (
          <View
            key={f.id}
            style={[
              asym(22, 6),
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={f.name}
              onPress={() => router.push({ pathname: '/otopark/[id]', params: { id: f.id } })}
              style={{
                flex: 1,
                minHeight: HIT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <PBadge size={32} />
              <Txt style={{ flex: 1, fontFamily: fonts.display, fontSize: 17 }}>{f.name}</Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('favorites.a11yRemove', { name: f.name })}
              onPress={() => toggleFavorite(f)}
              style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="starFilled" color={c.accent} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}
