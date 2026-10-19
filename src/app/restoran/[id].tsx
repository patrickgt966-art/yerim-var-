import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Tag } from '@/components/FreshnessBadge';
import { ParkingCard } from '@/components/ParkingCard';
import { ParkingMap } from '@/components/ParkingMap';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { distanceMeters, walkMinutes } from '@/data/geo';
import {
  cuisineLabels,
  dietLabels,
  getRestaurant,
  isEstimatedKind,
  placeTypeLabel,
  telUrl,
} from '@/data/restaurants';
import { ReportPlace } from '@/components/ReportPlace';
import { reportWrongRestaurant } from '@/lib/report';
import { placeShareText, shareText } from '@/lib/share';
import { useRanked } from '@/data/useParkings';
import { useScreenReader } from '@/lib/a11y';
import { openState } from '@/lib/openNow';
import { formatOpeningHours } from '@/lib/openingHours';
import { firstParam } from '@/lib/params';
import { useSharedPlaceCity } from '@/lib/useSharedPlaceCity';
import { openDirections } from '@/lib/directions';
import { parkHere } from '@/lib/parkHere';
import { useApp, useIsFavoriteRestaurant } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';

const NEAR_RADIUS_M = 1000;

/** Top bar (52) plus its 8 pt gaps above and below. */
const TOP_BAR_SPACE = 68;

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
  const params = useLocalSearchParams<{
    id: string | string[];
    n?: string | string[];
    ll?: string | string[];
  }>();
  // `?id=a&id=b` arrives as an array.
  const id = firstParam(params.id);
  const r = getRestaurant(id ?? '');
  // A shared link of another city: switch to the city its `ll` lies in.
  useSharedPlaceCity(!r, firstParam(params.ll));
  const target = useMemo(() => (r ? { lat: r.lat, lng: r.lng } : null), [r]);
  const tel = r?.phone ? telUrl(r.phone) : null;
  const { ranked, isLoading, isPlaceholderData, isFetching } = useRanked(target, NEAR_RADIUS_M);
  // Only the bundled car parks are known while the first live download runs: not yet "none".
  const parkingsLoading = isLoading || (isPlaceholderData && isFetching);
  const isFav = useIsFavoriteRestaurant(id ?? '');
  const toggleFavorite = useApp((s) => s.toggleFavoriteRestaurant);
  const mapRef = useRef<MapView>(null);
  const screenReader = useScreenReader();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const snapPoints = useMemo(() => ['32%', '60%', '100%'], []);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert(t('food.openFailed')));
  };
  const openRoute = async (dest: { lat: number; lng: number; name: string }) => {
    if ((await openDirections(dest, dest.name)) === 'failed') Alert.alert(t('food.openFailed'));
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
        <ScreenHeader title={firstParam(params.n) ?? ''} back />
        <Txt secondary>{t('food.notFound')}</Txt>
      </View>
    );
  }

  const meta = [
    placeTypeLabel(r, t),
    isEstimatedKind(r) ? t('food.estimatedKind') : null,
    ...dietLabels(r.diets, t),
    ...cuisineLabels(r.cuisines, t),
    r.address,
  ]
    .filter(Boolean)
    .join(' · ');
  const facts = [
    r.outdoorSeating != null ? t(r.outdoorSeating ? 'food.outdoor' : 'food.noOutdoor') : null,
    r.wheelchair != null ? t(r.wheelchair ? 'food.wheelchairYes' : 'food.wheelchairNo') : null,
  ].filter(Boolean);
  const nearest = ranked.slice(0, 3);
  const selected = selectedId ? ranked.find((p) => p.id === selectedId) : undefined;
  const list = selected
    ? [selected, ...nearest.filter((p) => p.id !== selected.id)].slice(
        0,
        nearest.some((p) => p.id === selected.id) ? 3 : 4,
      )
    : nearest;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* With a screen reader on, the list below is the way in; the map is skipped. */}
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={screenReader}
        importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
      >
        <ParkingMap
          ref={mapRef}
          parkings={ranked}
          center={{ lat: r.lat, lng: r.lng }}
          restaurants={[r]}
          selectedRestaurantId={r.id}
          selectedId={selectedId}
          onSelect={(p) => {
            setSelectedId(p.id);
            mapRef.current?.animateToRegion(
              {
                latitude: (r.lat + p.lat) / 2,
                longitude: (r.lng + p.lng) / 2,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              },
              300,
            );
          }}
          bottomInset={300}
          delta={0.008}
        />
      </View>

      <BottomSheet
        index={1}
        snapPoints={snapPoints}
        // The fully open sheet stops below the floating top bar, so "back" never hides.
        topInset={insets.top + TOP_BAR_SPACE}
        backgroundStyle={{
          backgroundColor: c.card,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
        }}
        handleIndicatorStyle={{ backgroundColor: c.line, width: 44 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 32,
            gap: 14,
          }}
        >
          {(!!meta || !r.verified) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {!!meta && <Txt secondary>{meta}</Txt>}
              {!r.verified && (
                <View accessible accessibilityLabel={t('food.a11yUnverified')}>
                  <Tag text={t('food.unverified')} bg={c.badgeInfoBg} fg={c.badgeInfoText} />
                </View>
              )}
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button
              kind="accent"
              style={{ flexGrow: 1 }}
              label={t('food.directions')}
              onPress={() => void openRoute(r)}
            />
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
          </View>

          <Txt variant="title" accessibilityRole="header">
            {t('food.parkTitle')}
          </Txt>
          {list.length === 0 ? (
            <Txt secondary>{parkingsLoading ? t('food.parkLoading') : t('food.parkNone')}</Txt>
          ) : (
            list.map((p, i) => (
              <View key={p.id} style={{ gap: 6 }}>
                <ParkingCard
                  parking={p}
                  featured={i === 0}
                  nearest={p.id === ranked[0]?.id && openState(p) !== 'closed'}
                  onParkHere={() =>
                    parkHere(p, {
                      kind: 'restaurant',
                      id: r.id,
                      name: r.name,
                      lat: r.lat,
                      lng: r.lng,
                    })
                  }
                  onDetail={() => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
                />
                <Txt
                  variant="caption"
                  secondary
                  style={{ paddingHorizontal: 4 }}
                  accessibilityLabel={t('food.a11yRouteLine', {
                    distance: Math.round(distanceMeters(p, r)),
                    count: walkMinutes(p, r),
                  })}
                >
                  {t('food.routeLine', {
                    distance: Math.round(distanceMeters(p, r)),
                    count: walkMinutes(p, r),
                  })}
                </Txt>
              </View>
            ))
          )}

          {!!r.openingHours && (
            <View style={{ gap: 2 }}>
              <Txt variant="label" secondary>
                {t('food.hours')}
              </Txt>
              {formatOpeningHours(r.openingHours, (k) => t(k)).map((line, i) => (
                <Txt key={i}>{line}</Txt>
              ))}
            </View>
          )}
          {facts.map((f) => (
            <Txt key={f} variant="caption" secondary>
              {f}
            </Txt>
          ))}

          <Txt variant="caption" secondary style={{ marginTop: 10 }}>
            {t(r.source === 'overture' ? 'food.footerOverture' : 'food.footer')}
          </Txt>
          <ReportPlace
            placeId={r.id}
            place="food"
            name={r.name}
            label={t('food.report')}
            onDetails={() => void reportWrongRestaurant(r)}
          />
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Top bar: after the sheet so it always stays on top and reachable. */}
      <View
        style={[
          asym(26, 7),
          {
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            minHeight: 52,
            paddingLeft: 4,
            paddingRight: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: c.card,
            shadowColor: '#0B3C49',
            shadowOpacity: 0.14,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="back" size={22} color={c.text} strokeWidth={2.2} />
        </Pressable>
        <Txt
          accessibilityRole="header"
          style={{ flex: 1, fontFamily: fonts.display, fontSize: 17 }}
          numberOfLines={1}
        >
          {r.name}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('share.a11y', { name: r.name })}
          onPress={() => void shareText(placeShareText('r', r, t))}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="share" size={24} color={c.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFav ? t('food.favoriteRemove') : t('food.favoriteAdd')}
          accessibilityState={{ selected: isFav }}
          onPress={() => toggleFavorite(r.id)}
          style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon
            name={isFav ? 'starFilled' : 'star'}
            size={26}
            color={isFav ? c.accentStrong : c.text}
          />
        </Pressable>
      </View>
    </View>
  );
}
