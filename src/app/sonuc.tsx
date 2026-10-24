import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ChipRow, FoodKindChips, ParkSubChips } from '@/components/FoodFilters';
import { Icon } from '@/components/Icon';
import { HandNote } from '@/components/lively/Hand';
import { PaperSheet } from '@/components/lively/PaperSheet';
import { Segmented } from '@/components/lively/Segmented';
import { AskYerim } from '@/components/mascot/AskYerim';
import { ParkingCard } from '@/components/ParkingCard';
import { ParkingMap } from '@/components/ParkingMap';
import { RestaurantRowCard } from '@/components/RestaurantRowCard';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { cityById, isInCityArea } from '@/data/cities';
import { lacksFreshCounts, visibleFree } from '@/data/freshness';
import type { LatLng } from '@/data/geo';
import { isNearRail } from '@/data/places';
import {
  FOOD_CATEGORIES,
  matchesCategory,
  nearestParking,
  rankRestaurants,
  restaurantsNear,
  withParkingWithin,
  type FoodCategory,
  type RestaurantRow,
} from '@/data/restaurants';
import { promoteFree, useRanked, type RankedParking } from '@/data/useParkings';
import { useAnnounce, useScreenReader } from '@/lib/a11y';
import { disabledInfo } from '@/lib/disabledSpots';
import { currentLocation } from '@/lib/location';
import { isClosedNow } from '@/lib/openNow';
import { firstParam, parseLatLng } from '@/lib/params';
import { parkHere } from '@/lib/parkHere';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { entryMode, rememberMode, startMode, type ResultsMode } from '@/lib/resultsMode';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';
import { useHiddenPlaceIds } from '@/store/reports';

// Car park sub-filters: they exist only in the Otopark mode.
type Filter = 'all' | 'indoor' | 'nearPier' | 'disabled' | 'free' | 'nonstop' | 'rail' | 'hasCount';
type ResultItem =
  | { key: string; kind: 'park'; p: RankedParking }
  | { key: string; kind: 'food'; row: RestaurantRow };
type Notice = 'outside' | 'failed' | 'denied';

const LOCATION_TIMEOUT_MS = 6000;

/** Top bar (52) plus its 8 pt gaps above and below. */
const TOP_BAR_SPACE = 68;

export default function ResultsScreen() {
  // A new city starts the screen over: its target, label and filters belong to the old one.
  const city = useApp((s) => s.city);
  return <Results key={city} />;
}

function Results() {
  const city = cityById(useApp((s) => s.city));
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{
    lat?: string | string[];
    lng?: string | string[];
    label?: string | string[];
    near?: string | string[];
    mode?: string | string[];
  }>();
  const mapRef = useRef<MapView>(null);

  // Any target (typed, saved Ev/İş, params) outside the city falls back to its centre.
  const [initial] = useState(() => {
    const parsed = parseLatLng(params.lat, params.lng);
    return { parsed, outside: !!parsed && !isInCityArea(parsed, city) };
  });
  const [target, setTarget] = useState<LatLng | null>(() =>
    initial.outside ? city.center : initial.parsed,
  );
  const [label, setLabel] = useState(() =>
    initial.outside ? city.name : (firstParam(params.label) ?? ''),
  );
  // Entry decides the start (locate / typed place: Tümü, "Otopark bul": Otopark, food: Restoran);
  // what was chosen last after the same entry is remembered until the app closes.
  const [entry] = useState(() => entryMode(params));
  const [mode, setModeState] = useState<ResultsMode>(() => startMode(entry));
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  // Food results: a kind, and "Otoparklı" with its car park sub-filters (all off by default).
  const [foodKind, setFoodKind] = useState<FoodCategory | null>(null);
  const [parkOn, setParkOn] = useState(false);
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [railOnly, setRailOnly] = useState(false);
  const [nonstopOnly, setNonstopOnly] = useState(false);
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
      const inside = !!loc && isInCityArea(loc, city);
      setTarget(inside ? loc : city.center);
      setLabel(inside ? t('results.myLocation') : city.name);
      setNotice(inside ? null : loc ? 'outside' : denied ? 'denied' : 'failed');
    })();
    return () => {
      cancelled = true;
    };
  }, [target, t, city]);

  // Back from the Settings app with location turned on: look again for the user's position.
  useEffect(() => {
    if (notice !== 'denied' || initial.parsed) return;
    const sub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      Location.getForegroundPermissionsAsync()
        .then((perm) => {
          if (perm.granted) setTarget(null);
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [notice, initial.parsed]);

  const nearMode = firstParam(params.near) === '1';
  const { ranked, data, isLoading, isPlaceholderData, isError, isFetching, refetch, widenedKm } =
    useRanked(target);
  // Own flag so the spinner shows only for pull-to-refresh, not the 120 s poll.
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = () => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  };

  const setMode = (next: ResultsMode) => {
    rememberMode(entry, next);
    setModeState(next);
    setSelectedId(null);
    setSelectedRestaurantId(null);
  };
  const showPark = mode !== 'food';
  const showFood = mode !== 'park';
  // The sub-filters belong to the Otopark mode; the other modes list every car park.
  const parkFilter: Filter = mode === 'park' ? filter : 'all';

  const filtered = useMemo(() => {
    let list: RankedParking[] = ranked;
    if (parkFilter === 'indoor') list = list.filter((p) => p.isIndoor === true);
    if (parkFilter === 'free') list = list.filter((p) => p.isPaid === false);
    if (parkFilter === 'nonstop') list = list.filter((p) => p.nonstop === true);
    if (parkFilter === 'rail') list = list.filter((p) => p.nearRail);
    if (parkFilter === 'nearPier') list = list.filter((p) => p.nearPier);
    if (parkFilter === 'disabled') list = list.filter((p) => disabledInfo(p) != null);
    if (parkFilter === 'hasCount') list = list.filter((p) => visibleFree(p) != null);
    // "Hemen bul": put the nearest open parking with a visible free space first,
    // unless it is much farther than the nearest one. Only in the Otopark mode: Tümü is nearest first.
    if (nearMode && mode === 'park') list = promoteFree(list);
    if (selectedId) {
      const i = list.findIndex((p) => p.id === selectedId);
      if (i > 0) list = [list[i]!, ...list.filter((_, j) => j !== i)];
    }
    return list;
  }, [ranked, parkFilter, nearMode, mode, selectedId]);
  const hidden = useHiddenPlaceIds();
  const nearbyFood = useMemo(
    () => (showFood && target && hidden ? restaurantsNear(target, 1000, 600) : []),
    [showFood, target, hidden],
  );
  // Food kinds present in the nearby list, most places first.
  const foodKinds = useMemo(
    () =>
      FOOD_CATEGORIES.map((cat, i) => ({
        cat,
        i,
        n: nearbyFood.filter((r) => matchesCategory(r, cat)).length,
      }))
        .filter((x) => x.n > 0 || x.cat === foodKind)
        .sort((a, b) => b.n - a.n || a.i - b.i)
        .map((x) => x.cat),
    [nearbyFood, foodKind],
  );
  // Kind chips and "Otoparklı" belong to the Restoran mode; Tümü lists every place nearest first.
  const parkAsked = mode === 'food' && parkOn;
  const foodRows = useMemo<RestaurantRow[]>(() => {
    if (!showFood || !target || !hidden) return [];
    const kind = mode === 'food' ? foodKind : null;
    const items = kind ? nearbyFood.filter((r) => matchesCategory(r, kind)) : nearbyFood;
    const parkings = data?.parkings ?? [];
    let list = rankRestaurants(
      buildRestaurantRows(items, parkings, target, new Date()),
      'distance',
      kind ?? undefined,
    );
    if (parkAsked) {
      list = withParkingWithin(list, 300);
      if (indoorOnly || freeOnly || railOnly || nonstopOnly) {
        list = list.filter((row) => {
          const p = nearestParking(row.r, parkings)?.parking;
          return (
            !!p &&
            (!indoorOnly || p.isIndoor === true) &&
            (!freeOnly || p.isPaid === false) &&
            (!railOnly || isNearRail(p)) &&
            (!nonstopOnly || p.nonstop === true)
          );
        });
      }
    }
    list = list.slice(0, 60);
    if (selectedRestaurantId) {
      const i = list.findIndex((x) => x.r.id === selectedRestaurantId);
      if (i > 0) list = [list[i]!, ...list.filter((_, j) => j !== i)];
    }
    return list;
  }, [
    showFood,
    mode,
    target,
    data,
    selectedRestaurantId,
    hidden,
    nearbyFood,
    foodKind,
    parkAsked,
    indoorOnly,
    freeOnly,
    railOnly,
    nonstopOnly,
  ]);
  // What the list shows: car parks, restaurants, or both mixed, nearest first.
  const items = useMemo<ResultItem[]>(() => {
    const parks = filtered.map((p) => ({ key: `p-${p.id}`, kind: 'park' as const, p }));
    const foods = foodRows.map((row) => ({ key: `r-${row.r.id}`, kind: 'food' as const, row }));
    if (mode === 'park') return parks;
    if (mode === 'food') return foods;
    const dist = (x: ResultItem) => (x.kind === 'park' ? x.p.distance : x.row.r.distanceM);
    const mixed: ResultItem[] = [...parks, ...foods].sort((a, b) => dist(a) - dist(b));
    const i = mixed.findIndex((x) =>
      x.kind === 'park' ? x.p.id === selectedId : x.row.r.id === selectedRestaurantId,
    );
    return i > 0 ? [mixed[i]!, ...mixed.filter((_, j) => j !== i)] : mixed;
  }, [mode, filtered, foodRows, selectedId, selectedRestaurantId]);
  // Only the truly nearest open card is tagged "En yakın" (a promoted one is not).
  const nearestId = useMemo(() => {
    let best: RankedParking | null = null;
    for (const p of filtered) {
      if (!isClosedNow(p) && (!best || p.distance < best.distance)) best = p;
    }
    return best?.id ?? null;
  }, [filtered]);

  // Null when no car park in the list has a count we may show: unknown is never "0 free".
  const totalFree = filtered.reduce<number | null>((sum, p) => {
    const f = visibleFree(p);
    return f == null ? sum : (sum ?? 0) + f;
  }, null);
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
  const anyHasCount = ranked.some((p) => visibleFree(p) != null);

  // Screen reader: the map is hidden (the list is the way in) and changes are spoken.
  const screenReader = useScreenReader();
  const resultsReady = !!target && !isLoading && !isPlaceholderData && !isError;
  useAnnounce(
    resultsReady
      ? t('a11y.resultsSummary', {
          place: label || city.name,
          summary: [
            mode === 'food'
              ? t('results.foodSummary', { count: foodRows.length })
              : mode === 'all'
                ? t('results.allSummary', { parks: filtered.length, foods: foodRows.length })
                : t('results.summaryUnknown', { count: filtered.length }),
            widenedKm != null && mode === 'park' ? t('results.widened', { km: widenedKm }) : null,
          ]
            .filter(Boolean)
            .join('. '),
        })
      : null,
    400,
  );
  useAnnounce(liveIncoming && showPark ? t('results.liveIncoming') : null);
  useAnnounce(
    notice
      ? t(notice === 'outside' ? 'results.outsideCity' : 'results.locationFailed', {
          city: city.name,
        })
      : null,
  );

  const snapPoints = useMemo(() => ['30%', '58%', '100%'], []);

  const turnParkOff = () => {
    setParkOn(false);
    setIndoorOnly(false);
    setFreeOnly(false);
    setRailOnly(false);
    setNonstopOnly(false);
    setSelectedRestaurantId(null);
  };
  // Restoran: what to eat, then "Otoparklı". Car park filters come only after "Otoparklı" is on.
  const wrapChips = fontScale > 1.2;
  const foodChips = (
    <FoodKindChips
      kinds={foodKinds}
      selected={foodKind}
      onSelect={(cat) => {
        setFoodKind(cat);
        setSelectedRestaurantId(null);
      }}
      parkOn={parkOn}
      onToggleParking={() => {
        if (parkOn) turnParkOff();
        else {
          setParkOn(true);
          setSelectedRestaurantId(null);
        }
      }}
    />
  );
  const foodParkChips = (
    <ParkSubChips
      value={{ indoorOnly, freeOnly, railOnly, nonstopOnly }}
      onChange={(v) => {
        setIndoorOnly(v.indoorOnly);
        setFreeOnly(v.freeOnly);
        setRailOnly(v.railOnly);
        setNonstopOnly(v.nonstopOnly);
      }}
    />
  );
  // Otopark: the car park sub-filters; pressing the chosen one again clears it.
  const pick = (f: Exclude<Filter, 'all'>) => setFilter(filter === f ? 'all' : f);
  const parkChips = (
    <>
      {anyHasCount && (
        <Chip
          label={t('results.hasCount')}
          selected={filter === 'hasCount'}
          onPress={() => pick('hasCount')}
        />
      )}
      {anyIndoorKnown && (
        <Chip
          label={t('results.indoor')}
          selected={filter === 'indoor'}
          onPress={() => pick('indoor')}
        />
      )}
      {anyFree && (
        <Chip label={t('results.free')} selected={filter === 'free'} onPress={() => pick('free')} />
      )}
      {anyNonstop && (
        <Chip
          label={t('results.nonstop')}
          selected={filter === 'nonstop'}
          onPress={() => pick('nonstop')}
        />
      )}
      {anyNearRail && (
        <Chip
          label={t('results.nearRail')}
          selected={filter === 'rail'}
          onPress={() => pick('rail')}
        />
      )}
      {anyNearPier && (
        <Chip
          label={t('results.nearPier')}
          selected={filter === 'nearPier'}
          onPress={() => pick('nearPier')}
        />
      )}
      {anyDisabled && (
        <Chip
          label={t('a11y.disabledFilter')}
          selected={filter === 'disabled'}
          onPress={() => pick('disabled')}
        />
      )}
      {/* "Şarj" is hidden until the data source reports charging points. */}
    </>
  );

  const modes: { id: ResultsMode; label: string }[] = [
    { id: 'all', label: t('results.all') },
    { id: 'park', label: t('results.modePark') },
    { id: 'food', label: t('results.modeFood') },
  ];
  // Data age is said once for the whole list, not on every restaurant card.
  const anyStaleFood = foodRows.some((x) => !x.r.verified);

  const header = (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
      <View>
        <HandNote size={20}>{t('results.hand')}</HandNote>
        <Txt variant="title" accessibilityRole="header">
          {mode === 'food'
            ? t('results.foodSummary', { count: foodRows.length })
            : mode === 'all'
              ? t('results.allSummary', { parks: filtered.length, foods: foodRows.length })
              : totalFree == null
                ? t('results.summaryUnknown', { count: filtered.length })
                : t('results.summary', { count: filtered.length, free: totalFree })}
        </Txt>
        {!!label && (
          <Txt variant="caption" secondary>
            {t('results.subtitle', { place: label })}
            {/* Saved data stays on screen while the slow API answers. */}
            {showPark && isFetching && !!data && !pulling && !liveIncoming
              ? ` · ${t('results.refreshing')}`
              : ''}
          </Txt>
        )}
        {widenedKm != null && mode === 'park' && (
          <Txt variant="caption" secondary>
            {t('results.widened', { km: widenedKm })}
          </Txt>
        )}
        {liveIncoming && showPark && (
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
        {showFood && anyStaleFood && (
          <Txt variant="caption" secondary>
            {t('food.listStale')}
          </Txt>
        )}
      </View>
      {notice && (
        <View style={{ gap: 8 }}>
          <Txt variant="caption" secondary>
            {t(notice === 'outside' ? 'results.outsideCity' : 'results.locationFailed', {
              city: city.name,
            })}
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
      {/* The parking data banner belongs to Otopark; Tümü gets a small muted line, Restoran none. */}
      {mode !== 'food' && <SampleBanner result={data} updating={false} muted={mode === 'all'} />}
      {mode === 'park' && <ChipRow wrap={wrapChips}>{parkChips}</ChipRow>}
      {mode === 'food' && <ChipRow wrap={wrapChips}>{foodChips}</ChipRow>}
      {parkAsked && <ChipRow wrap={wrapChips}>{foodParkChips}</ChipRow>}
      {parkAsked && <SampleBanner result={data} updating={false} muted />}
    </View>
  );

  const emptyList = (
    <View style={{ padding: 20, gap: 12 }}>
      {mode === 'food' ? (
        <>
          <Txt secondary>{t('food.empty')}</Txt>
          {target && !isPlaceholderData ? (
            <AskYerim
              question={t('mascot.askFood', {
                what: t('mascot.food'),
                place: label || city.name,
              })}
            />
          ) : null}
        </>
      ) : isLoading || isPlaceholderData || !target ? (
        <Txt secondary>{t('results.loading')}</Txt>
      ) : isError ? (
        <>
          <Txt secondary>{t('results.error')}</Txt>
          <Button label={t('common.retry')} onPress={() => void refetch()} />
        </>
      ) : (
        <>
          <Txt secondary>{t(mode === 'all' ? 'results.allEmpty' : 'results.empty')}</Txt>
          <AskYerim question={t('mascot.askPark', { place: label || city.name })} />
        </>
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
            restaurants={showFood ? foodRows.map((x) => x.r) : undefined}
            selectedRestaurantId={selectedRestaurantId}
            onSelectRestaurant={(r) => setSelectedRestaurantId(r.id)}
            quietParkings={mode === 'food'}
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
        backgroundComponent={PaperSheet}
        handleIndicatorStyle={{ backgroundColor: c.line, width: 44 }}
        accessibilityLabel={t('results.a11yList')}
      >
        <View style={{ flex: 1 }}>
          {/* Always visible: what the person is looking for comes first. */}
          <View style={{ paddingHorizontal: 10 }}>
            <Segmented
              options={modes}
              value={mode}
              onChange={setMode}
              label={t('results.modeLabel')}
            />
          </View>
          <BottomSheetFlatList
            data={items}
            keyExtractor={(x: ResultItem) => x.key}
            ListHeaderComponent={header}
            refreshing={pulling}
            onRefresh={onPullRefresh}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item, index }: { item: ResultItem; index: number }) => (
              <View style={{ paddingHorizontal: 20 }}>
                {item.kind === 'park' ? (
                  <ParkingCard
                    parking={item.p}
                    featured={index === 0}
                    nearest={item.p.id === nearestId && !selectedId}
                    freeTag={
                      index === 0 &&
                      !selectedId &&
                      item.p.id !== nearestId &&
                      (visibleFree(item.p) ?? 0) > 0
                    }
                    onParkHere={() => parkHere(item.p)}
                    onDetail={() =>
                      router.push({ pathname: '/otopark/[id]', params: { id: item.p.id } })
                    }
                  />
                ) : (
                  <RestaurantRowCard
                    row={item.row}
                    target={target}
                    best={false}
                    widened={false}
                    parkPending={isPlaceholderData}
                    parkAsked={parkAsked}
                    showParking={parkAsked}
                  />
                )}
              </View>
            )}
            ListEmptyComponent={emptyList}
            ListFooterComponent={
              mode === 'food' && target && foodRows.length > 0 ? (
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
        </View>
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
          {label || city.name}
        </Txt>
      </View>
    </View>
  );
}
