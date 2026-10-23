import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { cityOfPlace, findFavoriteRestaurant, openInCity } from '@/components/favoriteCity';
import { Icon } from '@/components/Icon';
import { PBadge } from '@/components/PBadge';
import { TabHint } from '@/components/mascot/TabHint';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { useNow } from '@/lib/useNow';
import { formatClock, getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import { cuisineLabels, kindLabel, parkingInfo } from '@/data/restaurants';
import { useParkings } from '@/data/useParkings';
import { resolveFavoriteParking } from '@/lib/favoriteIds';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, statusTone, useColors, useTabBarSpace } from '@/theme';

function confirmRemove(t: TFunction, name: string, remove: () => void) {
  Alert.alert(t('favorites.removeConfirmTitle', { name }), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('favorites.removeConfirmYes'), style: 'destructive', onPress: remove },
  ]);
}

function ActiveSection() {
  const { t } = useTranslation();
  const active = useApp((s) => s.active);
  if (active) return <ActiveParkCard active={active} />;
  return (
    <Section title={t('favorites.activeTitle')}>
      <Txt secondary>{t('favorites.noActive')}</Txt>
    </Section>
  );
}

/** Mint "P" tile, as on the home list (car parks are green). */
function ParkTile() {
  const c = useColors();
  return (
    <View
      accessible={false}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.mintSoft,
      }}
    >
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 23 }}
        color={c.mintText}
      >
        P
      </Txt>
    </View>
  );
}

type FavTab = 'parkings' | 'restaurants';

function FavTabs({ tab, onChange }: { tab: FavTab; onChange: (t: FavTab) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const options: { id: FavTab; label: string }[] = [
    { id: 'parkings', label: t('favorites.tabParkings') },
    { id: 'restaurants', label: t('favorites.tabRestaurants') },
  ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('favorites.tabsLabel')}
      style={{ flexDirection: 'row', flexWrap: fontScale > 1.2 ? 'wrap' : 'nowrap', gap: 8 }}
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
  const cityId = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const { data, isPlaceholderData } = useParkings({ withHidden: true });
  // Saved restaurants of every city stay listed with their city; ids no longer in any bundled
  // data are skipped. Recomputed on a city switch: the active city's data changes with it.
  const items = useMemo(
    () =>
      ids
        .map((id) => findFavoriteRestaurant(id))
        .filter((x): x is NonNullable<typeof x> => x != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the lookup reads the active city
    [ids, cityId],
  );
  if (items.length === 0) return <Txt secondary>{t('favorites.emptyRestaurants')}</Txt>;
  const parkings = data?.parkings ?? [];
  const now = new Date();
  return (
    <>
      {items.map(({ r, city }) => {
        const meta = [kindLabel(r.kind, t), ...cuisineLabels(r.cuisines, t).slice(0, 2)]
          .filter(Boolean)
          .join(' · ');
        // Another city's car parks are not loaded: say where the place is instead.
        const elsewhere = city.id !== cityId;
        const { parking, nearbyCount } = elsewhere
          ? { parking: null, nearbyCount: 0 }
          : parkingInfo(r, parkings, now);
        const near = parking
          ? t('food.nearbyParkings', {
              count: Math.max(nearbyCount, 1),
              distance: parking.distanceM,
            })
          : data && !isPlaceholderData
            ? t('food.noParking')
            : '';
        const free =
          parking && parking.free != null && parking.at
            ? t('food.freeSpotsAt', { count: parking.free, time: formatClock(parking.at) })
            : null;
        const parkText = elsewhere
          ? t('favorites.otherCity', { city: city.name, cityLoc: city.locative })
          : [near, free].filter(Boolean).join(' · ');
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
              onPress={() =>
                openInCity(city, r.name, t, setCity, () =>
                  router.push({ pathname: '/restoran/[id]', params: { id: r.id } }),
                )
              }
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
              onPress={() => confirmRemove(t, r.name, () => toggle(r.id))}
              style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="starFilled" color={c.accentStrong} />
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
  const tabSpace = useTabBarSpace();
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const replaceFavoriteId = useApp((s) => s.replaceFavoriteId);
  const cityId = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const { data } = useParkings({ withHidden: true });
  const now = new Date(useNow(30_000));
  const [tab, setTab] = useState<FavTab>('parkings');

  // Saved ids from before the stable İzelman ids are re-keyed to the matching car park.
  useEffect(() => {
    if (!data) return;
    for (const f of favorites) {
      const p = resolveFavoriteParking(f, data.parkings);
      if (p && p.id !== f.id) replaceFavoriteId(f.id, p.id);
    }
  }, [data, favorites, replaceFavoriteId]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: tabSpace,
        gap: 14,
      }}
    >
      <ScreenHeader title={t('favorites.title')} />
      <TabHint tab="favoriler" />
      <ActiveSection />
      <FavTabs tab={tab} onChange={setTab} />
      {tab === 'restaurants' ? (
        <RestaurantFavorites />
      ) : favorites.length === 0 ? (
        <Txt secondary>{t('favorites.empty')}</Txt>
      ) : (
        favorites.map((f) => {
          // A car park saved in another city: listed with its city, opened after switching to it.
          const savedIn = cityOfPlace(f);
          const elsewhere = savedIn && savedIn.id !== cityId ? savedIn : undefined;
          const p = data && !elsewhere ? resolveFavoriteParking(f, data.parkings) : null;
          const fresh = p ? getFreshness(p, now) : null;
          const free = p ? visibleFree(p, now) : null;
          // Only fresh counts are shown; anything else reads as no count / unknown, in grey.
          const live =
            free != null && fresh && (fresh.kind === 'live' || fresh.kind === 'updated')
              ? fresh
              : null;
          const level = live && p ? occupancyLevel(free, p.capacity) : 'unknown';
          const status = elsewhere
            ? t('favorites.otherCity', { city: elsewhere.name, cityLoc: elsewhere.locative })
            : live
              ? level === 'full'
                ? t('favorites.fullAt', { time: formatClock(live.at) })
                : t('favorites.freeAt', { count: free ?? 0, time: formatClock(live.at) })
              : fresh?.kind === 'noData'
                ? t('favorites.noCount')
                : t('common.unknown');
          return (
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
                accessibilityLabel={t('favorites.a11yFav', { name: f.name, status })}
                onPress={() =>
                  openInCity(elsewhere, f.name, t, setCity, () =>
                    router.push({ pathname: '/otopark/[id]', params: { id: p?.id ?? f.id } }),
                  )
                }
                style={{
                  flex: 1,
                  minHeight: HIT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <ParkTile />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontFamily: fonts.display, fontSize: 17 }}>{f.name}</Txt>
                  <Txt
                    style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 }}
                    color={statusTone(level).fg}
                  >
                    {status}
                  </Txt>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('favorites.a11yRemove', { name: f.name })}
                onPress={() => confirmRemove(t, f.name, () => toggleFavorite(f))}
                style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="starFilled" color={c.accentStrong} />
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
