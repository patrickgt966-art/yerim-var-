import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { PBadge } from '@/components/PBadge';
import { ParkingMap } from '@/components/ParkingMap';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { formatClock } from '@/data/freshness';
import { distanceMeters, type LatLng } from '@/data/geo';
import { isInIzmirArea, IZMIR_CENTER } from '@/data/places';
import {
  cuisineLabels,
  kindLabel,
  nearestParking,
  parkingSummary,
  restaurantsForMap,
  type Restaurant,
} from '@/data/restaurants';
import { rankByDistance, useParkings } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { parseLatLng } from '@/lib/params';
import { asym, fonts, HIT, useColors } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mode = 'parkings' | 'food';

const SWITCH_GAP = 8;

export default function MapTab() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data } = useParkings();
  const params = useLocalSearchParams<{
    mode?: string;
    lat?: string | string[];
    lng?: string | string[];
    ts?: string;
  }>();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<Mode>(params.mode === 'food' ? 'food' : 'parkings');
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const [outside, setOutside] = useState(false);
  const wasInside = useRef<boolean | null>(null);

  // Re-check on every visit (permission or position may have changed). Do not
  // prompt here; onboarding asks once.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void currentLocation(false).then((loc) => {
        if (cancelled) return;
        const inside = !!loc && isInIzmirArea(loc);
        setOutside(!!loc && !inside);
        // Keep the same object when the fix is unchanged so the map is not rebuilt.
        // Only move the map for a real change (> 300 m, or inside/outside İzmir),
        // so a remount does not drop the user's pan.
        const switched = wasInside.current !== inside;
        wasInside.current = inside;
        setCenter((prev) => {
          const next = inside ? loc : IZMIR_CENTER;
          return prev && !switched && distanceMeters(prev, next) <= 300 ? prev : next;
        });
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Params from "Haritada gör" override the centre and mode; `ts` makes a repeat visit count.
  const paramCenter = useMemo<LatLng | null>(
    () => parseLatLng(params.lat, params.lng),
    [params.lat, params.lng],
  );
  // Adjust state while rendering when the params change (no effect needed).
  const paramKey = `${params.mode ?? ''}|${params.ts ?? ''}|${params.lat ?? ''}|${params.lng ?? ''}`;
  const [seenKey, setSeenKey] = useState(paramKey);
  if (seenKey !== paramKey) {
    setSeenKey(paramKey);
    if (params.mode === 'food') setMode('food');
    else if (params.mode === 'parkings') setMode('parkings');
    setSelected(null);
  }

  const mapCenter = paramCenter ?? center;

  // ~1,600 car parks in the province: draw only those around the centre.
  const nearby = useMemo(
    () => (data && mapCenter ? rankByDistance(data.parkings, mapCenter, 4000) : []),
    [data, mapCenter],
  );
  const restaurants = useMemo(
    () => (mode === 'food' && mapCenter ? restaurantsForMap(mapCenter) : undefined),
    [mode, mapCenter],
  );

  if (!mapCenter) return <View style={{ flex: 1 }} />;

  const switchTop = insets.top + 8;
  const bannerTop = switchTop + HIT + SWITCH_GAP;
  const showBanner =
    data?.source === 'mock' ||
    (data?.source === 'static-only' && !!data.fallbackReason) ||
    data?.offline;
  const pick = (m: Mode) => {
    setMode(m);
    setSelected(null);
    // A manual choice ends the "Haritada gör" visit: back to the user's own centre.
    if (paramCenter)
      router.setParams({ mode: undefined, lat: undefined, lng: undefined, ts: undefined });
  };

  return (
    <View style={{ flex: 1 }}>
      <ParkingMap
        key={`${mapCenter.lat},${mapCenter.lng},${params.ts ?? ''}`}
        parkings={nearby}
        center={mapCenter}
        delta={0.06}
        onSelect={(p) => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
        restaurants={restaurants}
        selectedRestaurantId={selected?.id}
        onSelectRestaurant={setSelected}
        quietParkings={mode === 'food'}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('map.modeLabel')}
        style={[
          asym(16, 5),
          {
            position: 'absolute',
            top: switchTop,
            left: 16,
            right: 16,
            flexDirection: 'row',
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
                numberOfLines={1}
              >
                {t(m === 'parkings' ? 'map.modeParkings' : 'map.modeFood')}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {((outside && !paramCenter) || showBanner) && (
        <View style={{ position: 'absolute', top: bannerTop, left: 16, right: 16, gap: 8 }}>
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
              <Txt variant="caption">{t('map.outsideIzmir')}</Txt>
            </View>
          )}
          {showBanner && <SampleBanner result={data} />}
        </View>
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
  // The tab bar sits below this screen, so only a small gap is needed.
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
          bottom: 12,
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
