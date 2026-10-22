import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
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

import { Chip } from '@/components/Chip';
import { CATEGORY_ICON } from '@/components/foodCategory';
import { Icon } from '@/components/Icon';
import { ParkingMap } from '@/components/ParkingMap';
import { isBest, RestaurantRowCard } from '@/components/RestaurantRowCard';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { cityById, isInCityArea } from '@/data/cities';
import type { LatLng } from '@/data/geo';
import {
  FOOD_CATEGORIES,
  matchesCategory,
  nearestParking,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
  type RestaurantRow,
  type RestaurantSort,
} from '@/data/restaurants';
import { currentLocation } from '@/lib/location';
import { firstParam, parseLatLng } from '@/lib/params';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { rankByDistance, useParkings } from '@/data/useParkings';
import { useScreenReader } from '@/lib/a11y';
import { useApp } from '@/store/app';
import { asym, fonts, HIT, useColors } from '@/theme';
import { useHiddenPlaceIds } from '@/store/reports';

type Filter = 'all' | FoodCategory;

const SHOW_LIMIT = 60;

/** Top bar (52) plus its 8 pt gaps above and below. */
const TOP_BAR_SPACE = 68;

function RowSeparator() {
  return <View style={{ height: 10 }} />;
}

/** Chip for an understood filter; pressing it removes the filter. */
function RemovableChip({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('food.a11yRemoveChip', { label })}
      onPress={onPress}
      style={[
        asym(22, 6),
        {
          minHeight: 44,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      <Txt variant="bodyBold" style={{ fontSize: 14 }}>
        {label}
      </Txt>
      <Txt variant="bodyBold" style={{ fontSize: 14 }}>
        ✕
      </Txt>
    </Pressable>
  );
}

/** Slim notice that the list is around a fallback place, with a way to turn location on. */
function ApproxNotice({
  text,
  onTurnOn,
}: {
  text: string;
  /** Only when the reason is that location is off. */
  onTurnOn?: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      style={[
        asym(18, 6),
        {
          marginBottom: 10,
          paddingVertical: 10,
          paddingHorizontal: 12,
          gap: 6,
          backgroundColor: c.chipBg,
        },
      ]}
    >
      <View
        accessible
        accessibilityLabel={text}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Icon name="locate" size={18} color={c.text} strokeWidth={2.2} />
        <Txt variant="caption" style={{ flex: 1 }}>
          {text}
        </Txt>
      </View>
      {onTurnOn && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('food.turnOnLocation')}
          onPress={onTurnOn}
          style={{ minHeight: HIT, alignSelf: 'flex-start', justifyContent: 'center' }}
        >
          <Txt variant="bodyBold" style={{ textDecorationLine: 'underline' }}>
            {t('food.turnOnLocation')}
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

export default function RestaurantsScreen() {
  // A new city starts the list over: its target and filters belong to the old one.
  const city = useApp((s) => s.city);
  return <Restaurants key={city} />;
}

function Restaurants() {
  const cityId = useApp((s) => s.city);
  const cityName = cityById(cityId).name;
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{
    lat?: string | string[];
    lng?: string | string[];
    label?: string | string[];
    cat?: string | string[];
    park?: string | string[];
    parkm?: string | string[];
    wide?: string | string[];
    dish?: string | string[];
    quality?: string | string[];
    notcat?: string | string[];
    free?: string | string[];
    approx?: string | string[];
  }>();
  const requireParking = firstParam(params.park) === '1';
  const parkM = firstParam(params.parkm) === '500' ? 500 : 300;
  const wide = firstParam(params.wide) === '1';
  const dishRaw = firstParam(params.dish)?.trim();
  const dish = dishRaw ? dishRaw.slice(0, 40) : null;
  const quality = firstParam(params.quality) === '1';
  // From the chat: a category ruled out ("kebap olmasın") and "only free car parks"; both removable.
  const [notCat, setNotCat] = useState<FoodCategory | null>(
    () => FOOD_CATEGORIES.find((x) => x === firstParam(params.notcat)) ?? null,
  );
  const [freeOnly, setFreeOnly] = useState(firstParam(params.free) === '1');
  const { data, isPlaceholderData } = useParkings();
  const initial = FOOD_CATEGORIES.find((x) => x === firstParam(params.cat)) ?? 'all';
  const [filter, setFilterState] = useState<Filter>(initial);
  // Nearest first, unless parking was asked for (a filter) or the park sort was picked by hand.
  const [sortChoice, setSortState] = useState<RestaurantSort | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const screenReader = useScreenReader();
  const setFilter = (next: Filter) => {
    setFilterState(next);
    setSelectedId(null);
  };
  const sort: RestaurantSort = sortChoice ?? (requireParking || freeOnly ? 'parkEase' : 'distance');
  const setSort = (next: RestaurantSort) => {
    setSortState(next);
    setSelectedId(null);
  };

  const parsed = useMemo<LatLng | null>(
    () => parseLatLng(params.lat, params.lng),
    [params.lat, params.lng],
  );
  // Only the active city's restaurants are bundled: a point outside it (a saved Ev/İş or a
  // search hit from another city) falls back to the city centre, and the list says so.
  const outside = !!parsed && !isInCityArea(parsed, cityById(cityId));
  const target = useMemo<LatLng | null>(() => {
    const home = cityById(cityId);
    return parsed && !isInCityArea(parsed, home) ? home.center : parsed;
  }, [parsed, cityId]);

  // A place reported closed leaves the list at once.
  const hidden = useHiddenPlaceIds();
  const all = useMemo(
    () => (target && hidden ? restaurantsNear(target, wide ? 15000 : 1000, 600) : []),
    [target, wide, hidden],
  );
  // A category never falls back to unrelated places: it searches wider instead.
  const active: Filter = filter;
  const inCat = useMemo(
    () =>
      target && active !== 'all'
        ? restaurantsInCategory(target, active, undefined, wide ? WIDE_RADII_M : undefined)
        : null,
    [target, active, wide],
  );
  const shown = useMemo(() => {
    const items = inCat ? inCat.items : all;
    return notCat ? items.filter((r) => !matchesCategory(r, notCat)) : items;
  }, [inCat, all, notCat]);
  const widenedKm = inCat && inCat.radiusM > 1000 ? inCat.radiusM / 1000 : null;

  // Nearest car park per row, with its free count only when it is fresh.
  const built = useMemo<RestaurantRow[]>(() => {
    return buildRestaurantRows(shown, data?.parkings ?? [], target, new Date());
  }, [shown, data, target]);
  const rows = useMemo(
    () =>
      rankRestaurants(
        built,
        // Without live data the park-ease order would jump once it arrives.
        isPlaceholderData ? 'distance' : sort,
        active === 'all' ? undefined : active,
      ).slice(0, SHOW_LIMIT),
    [built, sort, active, isPlaceholderData],
  );

  const parked = requireParking || freeOnly ? withParkingWithin(rows, parkM) : rows;
  const visible = freeOnly
    ? parked.filter((row) => nearestParking(row.r, data?.parkings ?? [])?.parking.isPaid === false)
    : parked;

  const orderedVisible = useMemo(() => {
    const i = selectedId ? visible.findIndex((x) => x.r.id === selectedId) : -1;
    return i > 0 ? [visible[i]!, ...visible.filter((_, j) => j !== i)] : visible;
  }, [visible, selectedId]);
  const nearbyParkings = useMemo(
    () => (target && data ? rankByDistance(data.parkings, target, 1500) : []),
    [target, data],
  );
  const snapPoints = useMemo(() => ['30%', '58%', '100%'], []);

  const place = (!outside && firstParam(params.label)) || cityName;
  // The list is around a fallback place, not the user (location off, or the user is outside).
  const approxParam = firstParam(params.approx);
  const approx = approxParam === 'noLocation' || approxParam === 'outside' ? approxParam : null;
  const turnOnLocation = async () => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          void Linking.openSettings();
          return;
        }
        perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
      }
    } catch {
      return;
    }
    const here = await currentLocation(false, 5000);
    if (here && isInCityArea(here, cityById(cityId))) {
      router.setParams({
        lat: String(here.lat),
        lng: String(here.lng),
        label: t('results.myLocation'),
        approx: '',
      });
    } else if (here) {
      // A fix outside the city: the notice now says so instead of "location is off".
      router.setParams({ approx: 'outside' });
    }
  };
  const topEasy = sort === 'parkEase' && visible[0] ? isBest(visible[0].parking) : false;

  // The whole header scrolls with the list, so large text never squeezes the rows.
  const wrapChips = fontScale > 1.2;
  const categoryChips = (
    <>
      <Chip label={t('food.all')} selected={active === 'all'} onPress={() => setFilter('all')} />
      {FOOD_CATEGORIES.map((cat) => (
        <Chip
          key={cat}
          label={t(`food.cats.${cat}`)}
          icon={CATEGORY_ICON[cat]}
          selected={active === cat}
          onPress={() => setFilter(cat)}
        />
      ))}
    </>
  );
  const header = (
    <View>
      <Txt variant="caption" secondary style={{ marginBottom: 10 }}>
        {t(sort === 'parkEase' ? 'food.subtitle' : 'food.subtitleNearest', {
          place,
          count: visible.length,
        })}
        {widenedKm && visible.length > 0 ? `\n${t('food.widened', { km: widenedKm })}` : ''}
      </Txt>
      {outside && (
        <Txt variant="caption" style={{ marginBottom: 10 }}>
          {t('food.pointOutside', { city: cityName })}
        </Txt>
      )}
      {approx && (
        <ApproxNotice
          text={t(approx === 'noLocation' ? 'food.approxNoLocation' : 'food.approxOutside', {
            place,
          })}
          onTurnOn={approx === 'noLocation' ? () => void turnOnLocation() : undefined}
        />
      )}
      {(notCat || freeOnly) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {notCat && (
            <Chip
              label={t('food.exceptChip', { cat: t(`food.cats.${notCat}`) })}
              selected
              onPress={() => setNotCat(null)}
            />
          )}
          {freeOnly && (
            <Chip label={t('food.freeParkingChip')} selected onPress={() => setFreeOnly(false)} />
          )}
        </View>
      )}
      <View style={{ marginBottom: 10 }}>
        <SampleBanner result={data} />
      </View>
      <View
        accessibilityLabel={t('food.sortLabel')}
        style={{
          flexDirection: 'row',
          flexWrap: wrapChips ? 'wrap' : 'nowrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Chip
          label={t('food.sortPark')}
          selected={sort === 'parkEase'}
          onPress={() => setSort('parkEase')}
        />
        <Chip
          label={t('food.sortNearest')}
          selected={sort === 'distance'}
          onPress={() => setSort('distance')}
        />
      </View>
      {/* A category chosen before opening must stay changeable, even with nothing within 1 km. */}
      {(all.length > 0 || active !== 'all') && (
        <View style={{ marginBottom: 12 }}>
          {wrapChips ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{categoryChips}</View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {categoryChips}
            </ScrollView>
          )}
        </View>
      )}
      {(requireParking || dish || quality) && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Txt variant="caption" secondary>
              {t('food.understood')}
            </Txt>
            {active !== 'all' && (
              <RemovableChip
                label={t(`food.cats.${active}`) + (dish ? ` · ${dish}` : '')}
                onPress={() => setFilter('all')}
              />
            )}
            {requireParking && (
              <RemovableChip
                label={'🅿️ ' + t('food.parkRequired') + (parkM === 500 ? ' · 500 m' : '')}
                onPress={() => router.setParams({ park: '0' })}
              />
            )}
          </View>
          {quality && (
            <Txt variant="caption" secondary style={{ marginTop: 8 }}>
              {t('food.noRatings')}
            </Txt>
          )}
        </View>
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
            parkings={nearbyParkings}
            quietParkings
            center={target}
            targetLabel={place}
            selectedId={null}
            onSelect={(p) => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
            restaurants={visible.map((x) => x.r)}
            selectedRestaurantId={selectedId}
            onSelectRestaurant={(r) => setSelectedId(r.id)}
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
      >
        <BottomSheetFlatList
          data={orderedVisible}
          keyExtractor={(x: RestaurantRow) => x.r.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={RowSeparator}
          ListEmptyComponent={
            requireParking ? (
              <View style={{ gap: 10 }}>
                <Txt secondary>{t('food.emptyParking')}</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {parkM !== 500 && (
                    <Chip
                      label={t('food.parkWiden500')}
                      selected={false}
                      onPress={() => router.setParams({ parkm: '500' })}
                    />
                  )}
                  {!wide && (
                    <Chip
                      label={t('food.searchWider')}
                      selected={false}
                      onPress={() => router.setParams({ wide: '1' })}
                    />
                  )}
                  <Chip
                    label={t('food.dropParking')}
                    selected={false}
                    onPress={() => router.setParams({ park: '0' })}
                  />
                </View>
              </View>
            ) : (
              <Txt secondary>
                {active === 'all'
                  ? t('food.empty')
                  : t('food.emptyCat', { cat: t(`food.cats.${active}`) })}
              </Txt>
            )
          }
          renderItem={({ item, index }: { item: RestaurantRow; index: number }) => (
            <RestaurantRowCard
              row={item}
              target={target}
              best={index === 0 && topEasy && !selectedId}
              widened={!!widenedKm}
              parkPending={isPlaceholderData}
              parkAsked={requireParking || freeOnly}
            />
          )}
        />
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
          {t('food.title')}
        </Txt>
      </View>
    </View>
  );
}
