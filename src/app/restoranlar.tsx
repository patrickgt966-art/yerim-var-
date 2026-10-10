import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { CATEGORY_ICON } from '@/components/foodCategory';
import { isBest, RestaurantRowCard } from '@/components/RestaurantRowCard';
import { SampleBanner } from '@/components/SampleBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import type { LatLng } from '@/data/geo';
import {
  FOOD_CATEGORIES,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  WIDE_RADII_M,
  withParkingWithin,
  type FoodCategory,
  type RestaurantRow,
  type RestaurantSort,
} from '@/data/restaurants';
import { firstParam, parseLatLng } from '@/lib/params';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { useParkings } from '@/data/useParkings';
import { asym, useColors } from '@/theme';

type Filter = 'all' | FoodCategory;

const SHOW_LIMIT = 60;

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

export default function RestaurantsScreen() {
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
  }>();
  const requireParking = firstParam(params.park) === '1';
  const parkM = firstParam(params.parkm) === '500' ? 500 : 300;
  const wide = firstParam(params.wide) === '1';
  const dishRaw = firstParam(params.dish)?.trim();
  const dish = dishRaw ? dishRaw.slice(0, 40) : null;
  const quality = firstParam(params.quality) === '1';
  const { data, isPlaceholderData } = useParkings();
  const initial = FOOD_CATEGORIES.find((x) => x === firstParam(params.cat)) ?? 'all';
  const [filter, setFilter] = useState<Filter>(initial);
  const [sort, setSort] = useState<RestaurantSort>('parkEase');

  const target = useMemo<LatLng | null>(
    () => parseLatLng(params.lat, params.lng),
    [params.lat, params.lng],
  );

  const all = useMemo(
    () => (target ? restaurantsNear(target, wide ? 15000 : 1000, 600) : []),
    [target, wide],
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
  const shown = inCat ? inCat.items : all;
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

  const visible = requireParking ? withParkingWithin(rows, parkM) : rows;

  const place = firstParam(params.label) || t('common.izmir');
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
      <View style={{ marginBottom: 10 }}>
        <SampleBanner result={data} />
      </View>
      {target && (
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Chip
            label={t('food.showOnMap')}
            icon="map"
            selected={false}
            onPress={() =>
              router.navigate({
                pathname: '/(tabs)/harita',
                params: {
                  mode: 'food',
                  lat: String(target.lat),
                  lng: String(target.lng),
                  ts: String(Date.now()),
                },
              })
            }
          />
        </View>
      )}
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
      {all.length > 0 && (
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
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      {/* Fixed so "back" stays reachable while the list scrolls. */}
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenHeader title={t('food.title')} back />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(x) => x.r.id}
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
        renderItem={({ item, index }) => (
          <RestaurantRowCard
            row={item}
            target={target}
            best={index === 0 && topEasy}
            widened={!!widenedKm}
            parkPending={isPlaceholderData}
          />
        )}
      />
    </View>
  );
}
