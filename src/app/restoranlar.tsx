import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { DashedFrame } from '@/components/DashedFrame';
import { Tag } from '@/components/FreshnessBadge';
import { Icon } from '@/components/Icon';
import { CATEGORY_ICON } from '@/components/foodCategory';
import { PBadge } from '@/components/PBadge';
import { SampleBanner } from '@/components/SampleBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { formatClock } from '@/data/freshness';
import { walkMinutes, type LatLng } from '@/data/geo';
import {
  categoryOf,
  cuisineLabels,
  formatDistance,
  FOOD_CATEGORIES,
  kindLabel,
  rankRestaurants,
  restaurantsInCategory,
  restaurantsNear,
  type FoodCategory,
  type RestaurantRow,
  type RestaurantSort,
} from '@/data/restaurants';
import { firstParam, parseLatLng } from '@/lib/params';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { useParkings } from '@/data/useParkings';
import { asym, brand, fonts, useColors } from '@/theme';

type Filter = 'all' | FoodCategory;

const SHOW_LIMIT = 60;
const EASY_PARK_M = 200;
/** Beyond this the walking time stops being a useful hint. */
const FAR_WALK_M = 1200;

/** Close car park that is not known to be full. */
function isClose(p: RestaurantRow['parking']): boolean {
  return !!p && p.distanceM <= EASY_PARK_M && p.free !== 0;
}

/** "Parkı en kolay" only when fresh data shows free spaces; distance alone gets "Otopark yakın". */
function isBest(p: RestaurantRow['parking']): boolean {
  return !!p && p.free != null && p.free > 0;
}

function RowSeparator() {
  return <View style={{ height: 10 }} />;
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
  }>();
  const { data, isPlaceholderData } = useParkings();
  const initial = FOOD_CATEGORIES.find((x) => x === firstParam(params.cat)) ?? 'all';
  const [filter, setFilter] = useState<Filter>(initial);
  const [sort, setSort] = useState<RestaurantSort>('parkEase');

  const target = useMemo<LatLng | null>(
    () => parseLatLng(params.lat, params.lng),
    [params.lat, params.lng],
  );

  const all = useMemo(() => (target ? restaurantsNear(target, 1000, 600) : []), [target]);
  // A category never falls back to unrelated places: it searches wider instead.
  const active: Filter = filter;
  const inCat = useMemo(
    () => (target && active !== 'all' ? restaurantsInCategory(target, active) : null),
    [target, active],
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

  const place = firstParam(params.label) || t('common.izmir');
  const topEasy = sort === 'parkEase' && rows[0] ? isBest(rows[0].parking) : false;

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
      <ScreenHeader title={t('food.title')} back />
      <Txt variant="caption" secondary style={{ marginBottom: 10 }}>
        {t(sort === 'parkEase' ? 'food.subtitle' : 'food.subtitleNearest', {
          place,
          count: rows.length,
        })}
        {widenedKm && rows.length > 0 ? `\n${t('food.widened', { km: widenedKm })}` : ''}
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
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <FlatList
        data={rows}
        keyExtractor={(x) => x.r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={
          <Txt secondary>
            {active === 'all'
              ? t('food.empty')
              : t('food.emptyCat', { cat: t(`food.cats.${active}`) })}
          </Txt>
        }
        renderItem={({ item, index }) => (
          <Row
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

function Row({
  row,
  target,
  best,
  widened,
  parkPending,
}: {
  row: RestaurantRow;
  target: LatLng | null;
  best: boolean;
  widened: boolean;
  parkPending: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { r, parking, nearbyCount } = row;
  const cat = categoryOf(r);
  const metaParts = (walkKey: 'food.walk' | 'food.a11yWalk') =>
    [
      kindLabel(r.kind, t),
      ...cuisineLabels(r.cuisines, t).slice(0, 2),
      // Far results of a widened search: a plain distance, "~60 dk yürüme" would mislead.
      widened && r.distanceM > FAR_WALK_M
        ? t('food.distanceFromPoint', { distance: formatDistance(r.distanceM) })
        : target
          ? t(walkKey, { count: walkMinutes(target, r) })
          : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const meta = metaParts('food.walk');
  const near = parking
    ? t('food.nearbyParkings', { count: Math.max(nearbyCount, 1), distance: parking.distanceM })
    : parkPending
      ? ''
      : t('food.noParking');
  const free =
    parking && parking.free != null && parking.at
      ? t('food.freeSpotsAt', { count: parking.free, time: formatClock(parking.at) })
      : null;
  const parkText = [near, free].filter(Boolean).join(' · ');
  const easy = !best && isClose(parking);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('food.a11yRow', {
        name: r.name,
        meta: metaParts('food.a11yWalk'),
        parking: parkText,
      })}
      onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
      style={[
        asym(22, 6),
        {
          minHeight: 44,
          padding: 14,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
          backgroundColor: best ? c.surface : c.card,
        },
        !best && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {best && <DashedFrame color={c.text} radius={22} tight={6} strokeWidth={2} dash={[8, 6]} />}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: brand.cream,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={cat ? CATEGORY_ICON[cat] : 'cutlery'} size={24} color={brand.navy} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {(best || easy) && (
          <View style={{ flexDirection: 'row' }}>
            <Tag
              text={t(best ? 'food.bestPark' : 'food.easyPark')}
              bg={c.badgeNearBg}
              fg={c.badgeNearText}
            />
          </View>
        )}
        <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
          {r.name}
        </Txt>
        <Txt variant="caption" secondary numberOfLines={2}>
          {meta}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
          <PBadge size={18} />
          <Txt variant="caption" style={{ flex: 1 }} numberOfLines={3}>
            {parkText}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}
