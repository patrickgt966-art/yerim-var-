import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ParkingCard } from '@/components/ParkingCard';
import { ParkingMap } from '@/components/ParkingMap';
import { isBest, RestaurantRowCard } from '@/components/RestaurantRowCard';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { lacksFreshCounts, visibleFree } from '@/data/freshness';
import type { LatLng } from '@/data/geo';
import { isInIzmirArea, IZMIR_CENTER } from '@/data/places';
import { rankRestaurants, restaurantsNear, type RestaurantRow } from '@/data/restaurants';
import { promoteFree, useRanked, type RankedParking } from '@/data/useParkings';
import { useAnnounce, useScreenReader } from '@/lib/a11y';
import { disabledInfo } from '@/lib/disabledSpots';
import { currentLocation } from '@/lib/location';
import { isClosedNow } from '@/lib/openNow';
import { firstParam, parseLatLng } from '@/lib/params';
import { parkHere } from '@/lib/parkHere';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { asym, fonts, HIT, useColors } from '@/theme';

type Filter = 'all' | 'food' | 'indoor' | 'nearPier' | 'disabled' | 'free' | 'nonstop' | 'rail';
type Notice = 'outside' | 'failed' | 'denied';

const LOCATION_TIMEOUT_MS = 6000;

/** Top bar (52) plus its 8 pt gaps above and below. */
const TOP_BAR_SPACE = 68;

export default function ResultsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{
    lat?: string | string[];
    lng?: string | string[];
    label?: string | string[];
    near?: string | string[];
  }>();
  const mapRef = useRef<MapView>(null);

  // Any target (typed, saved Ev/İş, params) outside İzmir falls back to the city centre.
  const [initial] = useState(() => {
    const parsed = parseLatLng(params.lat, params.lng);
    return { parsed, outside: !!parsed && !isInIzmirArea(parsed) };
  });
  const [target, setTarget] = useState<LatLng | null>(() =>
    initial.outside ? IZMIR_CENTER : initial.parsed,
  );
  const [label, setLabel] = useState(() =>
    initial.outside ? t('common.izmir') : (firstParam(params.label) ?? ''),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(initial.outside ? 'outside' : null);

  // "Hemen bul" / locate: resolve the user's position, falling back to the city centre.
  useEffect(() => {
    if (target) return;
    let cancelled = false;
    void (async () => {
      const loc = await currentLocation(true, LOCATION_TIMEOUT_MS);
      let denied = false;
      if (!loc) {
        try {
          denied = !(await Location.getForegroundPermissionsAsync()).granted;
        } catch {
          denied = false;
        }
      }
      if (cancelled) return;
      const inside = !!loc && isInIzmirArea(loc);
      setTarget(inside ? loc : IZMIR_CENTER);
      setLabel(inside ? t('results.myLocation') : t('common.izmir'));
      setNotice(inside ? null : loc ? 'outside' : denied ? 'denied' : 'failed');
    })();
    return () => {
      cancelled = true;
    };
  }, [target, t]);

  const nearMode = firstParam(params.near) === '1';
  const { ranked, data, isLoading, isPlaceholderData, isError, isFetching, refetch, widenedKm } =
    useRanked(target);
  // Own flag so the spinner shows only for pull-to-refresh, not the 120 s poll.
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = () => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  };

  const filtered = useMemo(() => {
    let list: RankedParking[] = ranked;
    if (filter === 'indoor') list = list.filter((p) => p.isIndoor === true);
    if (filter === 'free') list = list.filter((p) => p.isPaid === false);
    if (filter === 'nonstop') list = list.filter((p) => p.nonstop === true);
    if (filter === 'rail') list = list.filter((p) => p.nearRail);
    if (filter === 'nearPier') list = list.filter((p) => p.nearPier);
    if (filter === 'disabled') list = list.filter((p) => disabledInfo(p) != null);
    // "Hemen bul": put the nearest open parking with a visible free space first,
    // unless it is much farther than the nearest one.
    if (nearMode) list = promoteFree(list);
    if (selectedId) {
      const i = list.findIndex((p) => p.id === selectedId);
      if (i > 0) list = [list[i]!, ...list.filter((_, j) => j !== i)];
    }
    return list;
  }, [ranked, filter, nearMode, selectedId]);
  const foodRows = useMemo<RestaurantRow[]>(() => {
    if (filter !== 'food' || !target) return [];
    let list = rankRestaurants(
      buildRestaurantRows(
        restaurantsNear(target, 1000, 600),
        data?.parkings ?? [],
        target,
        new Date(),
      ),
      isPlaceholderData ? 'distance' : 'parkEase',
    ).slice(0, 60);
    if (selectedRestaurantId) {
      const i = list.findIndex((x) => x.r.id === selectedRestaurantId);
      if (i > 0) list = [list[i]!, ...list.filter((_, j) => j !== i)];
    }
    return list;
  }, [filter, target, data, isPlaceholderData, selectedRestaurantId]);
  // Only the truly nearest open card is tagged "En yakın" (a promoted one is not).
  const nearestId = useMemo(() => {
    let best: RankedParking | null = null;
    for (const p of filtered) {
      if (!isClosedNow(p) && (!best || p.distance < best.distance)) best = p;
    }
    return best?.id ?? null;
  }, [filtered]);

  const totalFree = filtered.reduce<number | null>((sum, p) => {
    const f = visibleFree(p);
    return f == null || sum == null ? sum : sum + f;
  }, 0);
  // Cached counts are too old and the download is still running.
  // While only the bundled car parks show (first download running), say live counts are coming.
  const liveIncoming =
    isFetching &&
    !!data &&
    data.source !== 'mock' &&
    ((isPlaceholderData && ranked.length > 0) || lacksFreshCounts(ranked));
  const anyIndoorKnown = ranked.some((p) => p.isIndoor != null);
  const anyNearPier = ranked.some((p) => p.nearPier);
  const anyFree = ranked.some((p) => p.isPaid === false);
  const anyNonstop = ranked.some((p) => p.nonstop === true);
  const anyNearRail = ranked.some((p) => p.nearRail);
  const anyDisabled = ranked.some((p) => disabledInfo(p) != null);

  // Screen reader: the map is hidden (the list is the way in) and changes are spoken.
  const screenReader = useScreenReader();
  const resultsReady = !!target && !isLoading && !isPlaceholderData && !isError;
  useAnnounce(
    resultsReady
      ? t('a11y.resultsSummary', {
          place: label || t('common.izmir'),
          summary: [
            t('results.summaryUnknown', { count: filtered.length }),
            widenedKm != null ? t('results.widened', { km: widenedKm }) : null,
          ]
            .filter(Boolean)
            .join('. '),
        })
      : null,
    400,
  );
  useAnnounce(liveIncoming ? t('results.liveIncoming') : null);
  useAnnounce(
    notice ? t(notice === 'outside' ? 'results.outsideIzmir' : 'results.locationFailed') : null,
  );

  const snapPoints = useMemo(() => ['30%', '58%', '100%'], []);

  const chips = (
    <>
      <Chip label={t('results.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
      {/* Restaurants sit right after "Tümü" so they are not lost at the end. */}
      {target && (
        <Chip
          label={t('food.nearby')}
          selected={filter === 'food'}
          onPress={() => {
            setFilter(filter === 'food' ? 'all' : 'food');
            setSelectedId(null);
            setSelectedRestaurantId(null);
          }}
        />
      )}
      {anyIndoorKnown && (
        <Chip
          label={t('results.indoor')}
          selected={filter === 'indoor'}
          onPress={() => setFilter('indoor')}
        />
      )}
      {anyFree && (
        <Chip
          label={t('results.free')}
          selected={filter === 'free'}
          onPress={() => setFilter('free')}
        />
      )}
      {anyNonstop && (
        <Chip
          label={t('results.nonstop')}
          selected={filter === 'nonstop'}
          onPress={() => setFilter('nonstop')}
        />
      )}
      {anyNearRail && (
        <Chip
          label={t('results.nearRail')}
          selected={filter === 'rail'}
          onPress={() => setFilter('rail')}
        />
      )}
      {anyNearPier && (
        <Chip
          label={t('results.nearPier')}
          selected={filter === 'nearPier'}
          onPress={() => setFilter('nearPier')}
        />
      )}
      {anyDisabled && (
        <Chip
          label={t('a11y.disabledFilter')}
          selected={filter === 'disabled'}
          onPress={() => setFilter('disabled')}
        />
      )}
      {/* "Şarj" is hidden until the data source reports charging points. */}
    </>
  );

  const header = (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
      <View>
        <Txt variant="title" accessibilityRole="header">
          {filter === 'food'
            ? t('results.foodSummary', { count: foodRows.length })
            : totalFree == null
              ? t('results.summaryUnknown', { count: filtered.length })
              : t('results.summary', { count: filtered.length, free: totalFree })}
        </Txt>
        {!!label && (
          <Txt variant="caption" secondary>
            {t('results.subtitle', { place: label })}
            {/* Saved data stays on screen while the slow API answers. */}
            {isFetching && !!data && !pulling && !liveIncoming
              ? ` · ${t('results.refreshing')}`
              : ''}
          </Txt>
        )}
        {widenedKm != null && (
          <Txt variant="caption" secondary>
            {t('results.widened', { km: widenedKm })}
          </Txt>
        )}
        {liveIncoming && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('results.liveIncoming')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}
          >
            <ActivityIndicator size="small" color={c.text} />
            <Txt variant="caption" secondary>
              {t('results.liveIncoming')}
            </Txt>
          </View>
        )}
      </View>
      {notice && (
        <View style={{ gap: 8 }}>
          <Txt variant="caption" secondary>
            {t(notice === 'outside' ? 'results.outsideIzmir' : 'results.locationFailed')}
          </Txt>
          {notice === 'denied' && (
            <Button
              kind="secondary"
              label={t('results.locationPermission')}
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>
      )}
      <SampleBanner result={data} />
      {fontScale > 1.2 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>
      ) : (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {chips}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {target ? (
        // With a screen reader on, the list below is the way in; the map is skipped.
        <View
          style={{ flex: 1 }}
          accessibilityElementsHidden={screenReader}
          importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
        >
          <ParkingMap
            ref={mapRef}
            parkings={filtered}
            center={target}
            targetLabel={label}
            selectedId={selectedId}
            onSelect={(p) => setSelectedId(p.id)}
            restaurants={filter === 'food' ? foodRows.map((x) => x.r) : undefined}
            selectedRestaurantId={selectedRestaurantId}
            onSelectRestaurant={(r) => setSelectedRestaurantId(r.id)}
            quietParkings={filter === 'food'}
            bottomInset={260}
          />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.text} accessibilityLabel={t('a11y.loading')} />
        </View>
      )}

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
        accessibilityLabel={t('results.a11yList')}
      >
        {filter === 'food' ? (
          <BottomSheetFlatList
            data={foodRows}
            keyExtractor={(x: RestaurantRow) => x.r.id}
            ListHeaderComponent={header}
            refreshing={pulling}
            onRefresh={onPullRefresh}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item, index }: { item: RestaurantRow; index: number }) => (
              <View style={{ paddingHorizontal: 20 }}>
                <RestaurantRowCard
                  row={item}
                  target={target}
                  best={index === 0 && !selectedRestaurantId && isBest(item.parking)}
                  widened={false}
                  parkPending={isPlaceholderData}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={{ padding: 20 }}>
                <Txt secondary>{t('food.empty')}</Txt>
              </View>
            }
            ListFooterComponent={
              target && foodRows.length > 0 ? (
                <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                  <Button
                    kind="secondary"
                    label={t('results.foodFullList')}
                    onPress={() =>
                      router.push({
                        pathname: '/restoranlar',
                        params: { lat: String(target.lat), lng: String(target.lng), label },
                      })
                    }
                  />
                </View>
              ) : null
            }
          />
        ) : (
          <BottomSheetFlatList
            data={filtered}
            keyExtractor={(p: RankedParking) => p.id}
            ListHeaderComponent={header}
            refreshing={pulling}
            onRefresh={onPullRefresh}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item, index }: { item: RankedParking; index: number }) => (
              <View style={{ paddingHorizontal: 20 }}>
                <ParkingCard
                  parking={item}
                  featured={index === 0}
                  nearest={item.id === nearestId && !selectedId}
                  freeTag={
                    index === 0 &&
                    !selectedId &&
                    item.id !== nearestId &&
                    (visibleFree(item) ?? 0) > 0
                  }
                  onParkHere={() => parkHere(item)}
                  onDetail={() =>
                    router.push({ pathname: '/otopark/[id]', params: { id: item.id } })
                  }
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={{ padding: 20, gap: 12 }}>
                {isLoading || isPlaceholderData || !target ? (
                  <Txt secondary>{t('results.loading')}</Txt>
                ) : isError ? (
                  <>
                    <Txt secondary>{t('results.error')}</Txt>
                    <Button label={t('common.retry')} onPress={() => void refetch()} />
                  </>
                ) : (
                  <Txt secondary>{t('results.empty')}</Txt>
                )}
              </View>
            }
          />
        )}
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
          {label || t('common.izmir')}
        </Txt>
      </View>
    </View>
  );
}
