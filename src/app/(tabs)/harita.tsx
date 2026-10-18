import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { FreshnessBadge, freshnessText, Tag } from '@/components/FreshnessBadge';
import { PBadge } from '@/components/PBadge';
import { ParkingMap } from '@/components/ParkingMap';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { cityAt, cityById, hasLiveParking, isInCityArea, type City } from '@/data/cities';
import { formatClock, getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import { appleMapsUrl, distanceMeters, type LatLng } from '@/data/geo';
import {
  cuisineLabels,
  kindLabel,
  nearestParking,
  parkingSummary,
  restaurantsForMap,
  type Restaurant,
} from '@/data/restaurants';
import { rankByDistance, useParkings, type RankedParking } from '@/data/useParkings';
import { levelWord, useAnnounce, useScreenReader } from '@/lib/a11y';
import { disabledInfo } from '@/lib/disabledSpots';
import { metaLine } from '@/lib/format';
import { currentLocation } from '@/lib/location';
import { parseLatLng } from '@/lib/params';
import { parkedHere } from '@/lib/parkHere';
import { isStatic } from '@/lib/staticInfo';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { asym, brand, fonts, HIT, statusTone, useColors, useTabBarSpace } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHiddenPlaceIds } from '@/store/reports';

/** Same short wait as the pin picker; the next visit checks again. */
const LOCATION_TIMEOUT_MS = 3000;

type Mode = 'parkings' | 'food';

export default function MapTab() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Overlays at the bottom must clear the floating tab bar.
  const tabSpace = useTabBarSpace(12);
  const city = cityById(useApp((s) => s.city));
  const setCity = useApp((s) => s.setCity);
  const { data } = useParkings();
  const { fontScale } = useWindowDimensions();
  const screenReader = useScreenReader();
  const params = useLocalSearchParams<{
    mode?: string;
    lat?: string | string[];
    lng?: string | string[];
    ts?: string;
  }>();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<Mode>(params.mode === 'food' ? 'food' : 'parkings');
  const [selected, setSelected] = useState<Restaurant | null>(null);
  /** The car park whose card is open (tap a P pin); its detail is one more tap away. */
  const [selectedPark, setSelectedPark] = useState<RankedParking | null>(null);
  const [paramCity, setParamCity] = useState<string | null>(city.id);

  const [outside, setOutside] = useState(false);
  /** Another open city the device is in while this one is selected. */
  const [elsewhere, setElsewhere] = useState<City | undefined>(undefined);
  const wasInside = useRef<boolean | null>(null);
  // Another city: the centre, the open card and the outside notice belonged to the old one.
  const [seenCity, setSeenCity] = useState(city.id);
  if (seenCity !== city.id) {
    setSeenCity(city.id);
    setCenter(null);
    setSelected(null);
    setSelectedPark(null);
    setParamCity(null);
    setOutside(false);
    setElsewhere(undefined);
  }

  // Re-check on every visit (permission or position may have changed). Do not
  // prompt here; onboarding asks once.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Never wait long for a fix: without one the map opens at the city centre.
      void currentLocation(false, LOCATION_TIMEOUT_MS).then((loc) => {
        if (cancelled) return;
        const inside = !!loc && isInCityArea(loc, city);
        setOutside(!!loc && !inside);
        setElsewhere(loc && !inside ? cityAt(loc) : undefined);
        // Keep the same object when the fix is unchanged so the map is not rebuilt.
        // Only move the map for a real change (> 300 m, or inside/outside the city),
        // so a remount does not drop the user's pan.
        const switched = wasInside.current !== inside;
        wasInside.current = inside;
        setCenter((prev) => {
          const next = inside ? loc : city.center;
          return prev && !switched && distanceMeters(prev, next) <= 300 ? prev : next;
        });
      });
      return () => {
        cancelled = true;
      };
    }, [city]),
  );

  // Params from "Haritada gör" override the centre and mode; `ts` makes a repeat visit count.
  const parsedCenter = useMemo<LatLng | null>(
    () => parseLatLng(params.lat, params.lng),
    [params.lat, params.lng],
  );
  // Adjust state while rendering when the params change (no effect needed).
  const paramKey = `${params.mode ?? ''}|${params.ts ?? ''}|${params.lat ?? ''}|${params.lng ?? ''}`;
  const [seenKey, setSeenKey] = useState(paramKey);
  if (seenKey !== paramKey) {
    setSeenKey(paramKey);
    setParamCity(city.id);
    if (params.mode === 'food') setMode('food');
    else if (params.mode === 'parkings') setMode('parkings');
    setSelected(null);
    setSelectedPark(null);
  }

  const paramCenter = paramCity === city.id ? parsedCenter : null;
  const mapCenter = paramCenter ?? center;

  // ~1,600 car parks in the province: draw only those around the centre.
  const nearby = useMemo(
    () => (data && mapCenter ? rankByDistance(data.parkings, mapCenter, 4000) : []),
    [data, mapCenter],
  );
  const hidden = useHiddenPlaceIds();
  const restaurants = useMemo(
    () => (mode === 'food' && mapCenter && hidden ? restaurantsForMap(mapCenter) : undefined),
    [mode, mapCenter, hidden],
  );

  useAnnounce(
    outside && !paramCenter
      ? elsewhere
        ? t('map.inOtherCity', { here: elsewhere.name, city: city.name })
        : t('map.outsideCity', { city: city.name })
      : null,
  );

  if (!mapCenter) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.text} accessibilityLabel={t('results.loading')} />
      </View>
    );
  }

  const bigText = fontScale > 1.2;
  const showBanner =
    data?.source === 'mock' ||
    (data?.source === 'static-only' && !!data.fallbackReason) ||
    // A calm note, not an outage: this city has no live counts.
    (data?.source === 'static-only' && !hasLiveParking(city)) ||
    data?.offline;
  const pick = (m: Mode) => {
    setMode(m);
    setSelected(null);
    setSelectedPark(null);
    // A manual choice ends the "Haritada gör" visit: back to the user's own centre.
    if (paramCenter)
      router.setParams({ mode: undefined, lat: undefined, lng: undefined, ts: undefined });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Screen reader on: the map is skipped and "Listeyi göster" opens the list instead. */}
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={screenReader}
        importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
      >
        <ParkingMap
          key={`${mapCenter.lat},${mapCenter.lng},${params.ts ?? ''}`}
          parkings={nearby}
          center={mapCenter}
          delta={0.06}
          onSelect={(p) => {
            setSelected(null);
            setSelectedPark(nearby.find((x) => x.id === p.id) ?? null);
          }}
          selectedId={selectedPark?.id}
          restaurants={restaurants}
          selectedRestaurantId={selected?.id}
          onSelectRestaurant={(r) => {
            setSelectedPark(null);
            setSelected(r);
          }}
          quietParkings={mode === 'food'}
        />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 8 }}>
        <View
          accessibilityRole="tablist"
          accessibilityLabel={t('map.modeLabel')}
          style={[
            asym(16, 5),
            {
              flexDirection: bigText ? 'column' : 'row',
              padding: 3,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.line,
            },
          ]}
        >
          {(['parkings', 'food'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => pick(m)}
                style={{
                  flex: 1,
                  minHeight: HIT - 6,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? c.primary : 'transparent',
                }}
              >
                <Txt
                  style={{ fontFamily: on ? fonts.display : fonts.bodyBold, fontSize: 15 }}
                  color={on ? c.onPrimary : c.text}
                >
                  {t(m === 'parkings' ? 'map.modeParkings' : 'map.modeFood')}
                </Txt>
              </Pressable>
            );
          })}
        </View>
        {((outside && !paramCenter) || showBanner) && (
          <View style={{ gap: 8 }}>
            {outside && !paramCenter && (
              <View
                style={[
                  asym(14, 4),
                  {
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.line,
                  },
                ]}
              >
                <Txt variant="caption">
                  {elsewhere
                    ? t('map.inOtherCity', { here: elsewhere.name, city: city.name })
                    : t('map.outsideCity', { city: city.name })}
                </Txt>
                {elsewhere && (
                  <Button
                    kind="secondary"
                    label={t('map.switchCity', { here: elsewhere.name })}
                    onPress={() => setCity(elsewhere.id)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </View>
            )}
            {showBanner && <SampleBanner result={data} />}
          </View>
        )}
      </View>
      {screenReader && (
        <Button
          label={t('a11y.showList')}
          onPress={() =>
            router.push(
              mode === 'food'
                ? {
                    pathname: '/restoranlar',
                    params: { lat: String(mapCenter.lat), lng: String(mapCenter.lng) },
                  }
                : {
                    pathname: '/sonuc',
                    params: { lat: String(mapCenter.lat), lng: String(mapCenter.lng) },
                  },
            )
          }
          style={{ position: 'absolute', left: 16, right: 16, bottom: tabSpace }}
        />
      )}
      {selectedPark && (
        <ParkingSheetCard
          parking={selectedPark}
          // Walking minutes only make sense from the user's own position.
          fromYou={!paramCenter && !outside}
          onClose={() => setSelectedPark(null)}
        />
      )}
      {mode === 'food' && selected && (
        <RestaurantCard
          restaurant={selected}
          parkings={data?.parkings}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

function RestaurantCard({
  restaurant: r,
  parkings,
  onClose,
}: {
  restaurant: Restaurant;
  /** Undefined while car parks are still loading. */
  parkings: NonNullable<ReturnType<typeof useParkings>['data']>['parkings'] | undefined;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  // The floating tab bar overlaps the map, so lift the card above it.
  const tabSpace = useTabBarSpace(12);
  const near = useMemo(() => (parkings ? nearestParking(r, parkings) : null), [r, parkings]);
  const summary = useMemo(() => (near ? parkingSummary(r, [near.parking]) : null), [r, near]);
  const meta = [kindLabel(r.kind, t), ...cuisineLabels(r.cuisines, t).slice(0, 2)]
    .filter(Boolean)
    .join(' · ');
  const free =
    summary && summary.free != null && summary.at
      ? t('food.freeSpotsAt', { count: summary.free, time: formatClock(summary.at) })
      : null;
  const parkText = summary
    ? [t('map.nearestParking', { distance: summary.distanceM }), free].filter(Boolean).join(' · ')
    : parkings
      ? t('food.noParking')
      : null;

  return (
    <View
      style={[
        asym(22, 6),
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: tabSpace,
          padding: 14,
          gap: 10,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          shadowColor: '#0B3C49',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
            {r.name}
          </Txt>
          {!!meta && (
            <Txt variant="caption" secondary numberOfLines={2}>
              {meta}
            </Txt>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.closeA11y')}
          onPress={onClose}
          hitSlop={4}
          style={{
            width: HIT,
            height: HIT,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -8,
            marginRight: -8,
          }}
        >
          <Txt style={{ fontSize: 26, lineHeight: 30 }} secondary>
            ×
          </Txt>
        </Pressable>
      </View>
      {!!parkText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <PBadge size={18} />
          <Txt variant="caption" style={{ flex: 1 }} numberOfLines={3}>
            {parkText}
          </Txt>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          kind="secondary"
          label={t('map.detail')}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
        />
        {near && (
          <Button
            label={t('map.goParking')}
            style={{ flex: 1 }}
            onPress={() =>
              router.push({ pathname: '/otopark/[id]', params: { id: near.parking.id } })
            }
          />
        )}
      </View>
    </View>
  );
}

/**
 * The tapped car park (design V5.1): name, meta, the free count big in its status colour,
 * freshness, then "Yol tarifi" and "Buraya park ettim". Tapping the info opens the detail.
 */
function ParkingSheetCard({
  parking: p,
  fromYou,
  onClose,
}: {
  parking: RankedParking;
  fromYou: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const tabSpace = useTabBarSpace(12);
  const mode = useApp((s) => s.mode);
  const now = new Date(useNow());
  const shown = fromYou ? p : { ...p, walk: undefined };
  const meta = metaLine(shown, t, mode);
  const staticCard = isStatic(p);
  const freshness = getFreshness(p, now);
  const free = visibleFree(p, now);
  const level = occupancyLevel(free, p.capacity);
  const disabled = disabledInfo(p, now);
  const word = staticCard ? null : levelWord(level, t);
  const count = staticCard || free == null ? null : free;
  const openDetail = () => router.push({ pathname: '/otopark/[id]', params: { id: p.id } });
  const directions = () =>
    Linking.openURL(appleMapsUrl(p, p.name)).catch(() => Alert.alert(t('food.openFailed')));

  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: tabSpace,
        padding: 14,
        gap: 10,
        borderRadius: 22,
        backgroundColor: c.bg,
        shadowColor: brand.navy,
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[
            p.name,
            metaLine(shown, t, mode, true),
            staticCard
              ? freshnessText(freshness, t)
              : `${count == null ? t('common.unknown') : `${count} ${t('common.free')}`}${word ? `, ${word}` : ''}`,
          ]
            .filter(Boolean)
            .join('. ')}
          accessibilityHint={t('map.a11yOpenDetail')}
          onPress={openDetail}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: brand.mintSoft,
            }}
          >
            <Txt
              allowFontScaling={false}
              style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 26 }}
              color={brand.mintText}
            >
              P
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt
              style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}
              numberOfLines={2}
            >
              {p.name}
            </Txt>
            {!!meta && (
              <Txt variant="caption" secondary numberOfLines={2}>
                {meta}
              </Txt>
            )}
          </View>
          {!staticCard && (
            <View style={{ alignItems: 'flex-end' }}>
              <Txt
                style={{
                  fontFamily: fonts.display,
                  fontSize: count == null || level === 'full' ? 17 : 30,
                  lineHeight: count == null || level === 'full' ? 22 : 34,
                  letterSpacing: -0.5,
                }}
                color={statusTone(level).fg}
                maxFontSizeMultiplier={1.4}
              >
                {count == null
                  ? t('common.unknown')
                  : level === 'full'
                    ? (word ?? '')
                    : String(count)}
              </Txt>
              {count != null && level !== 'full' && (
                <Txt variant="label" color={statusTone(level).fg}>
                  {t('map.freeUnit')}
                </Txt>
              )}
            </View>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.closeParkingA11y')}
          onPress={onClose}
          style={{
            width: HIT,
            height: HIT,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -8,
            marginRight: -8,
          }}
        >
          <Txt style={{ fontSize: 26, lineHeight: 30 }} secondary>
            ×
          </Txt>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {staticCard ? (
          <Tag text={t('freshness.noData')} bg={c.badgeInfoBg} fg={c.badgeInfoText} />
        ) : (
          <FreshnessBadge freshness={freshness} />
        )}
        {disabled && (
          <Tag
            text={
              disabled.kind === 'count'
                ? t('a11y.disabledCount', { free: disabled.free, capacity: disabled.capacity })
                : t('a11y.disabledExists')
            }
            bg={c.chipBg}
            fg={c.text}
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          kind="secondary"
          label={t('map.directions')}
          accessibilityLabel={t('map.a11yDirections', { name: p.name })}
          onPress={() => void directions()}
          style={{ flex: 1 }}
        />
        <Button
          kind="accent"
          label={t('map.parkedHere')}
          accessibilityLabel={t('map.a11yParkedHere', { name: p.name })}
          onPress={() => parkedHere(p)}
          style={{ flex: 1.4 }}
        />
      </View>
    </View>
  );
}
