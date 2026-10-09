import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { PBadge } from '@/components/PBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { SampleBanner } from '@/components/SampleBanner';
import { formatClock } from '@/data/freshness';
import { walkMinutes, type LatLng } from '@/data/geo';
import {
  cuisineLabels,
  kindGroup,
  kindLabel,
  parkingSummary,
  restaurantsNear,
  type KindGroup,
  type NearbyRestaurant,
} from '@/data/restaurants';
import { useParkings } from '@/data/useParkings';
import { asym, fonts, useColors } from '@/theme';

type Filter = 'all' | KindGroup;
const GROUPS: KindGroup[] = ['restaurant', 'cafe', 'fast_food', 'bar'];

export default function RestaurantsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();
  const { data } = useParkings();
  const [filter, setFilter] = useState<Filter>('all');

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const target = useMemo<LatLng | null>(
    () =>
      params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null,
    [params.lat, params.lng, lat, lng],
  );

  const all = useMemo(() => (target ? restaurantsNear(target) : []), [target]);
  const groupsPresent = useMemo(
    () => GROUPS.filter((g) => all.some((r) => kindGroup(r.kind) === g)),
    [all],
  );
  const shown = useMemo(
    () => (filter === 'all' ? all : all.filter((r) => kindGroup(r.kind) === filter)),
    [all, filter],
  );

  // Nearest car park per row, with its free count only when it is fresh.
  const rows = useMemo(() => {
    const parkings = data?.parkings ?? [];
    const now = new Date();
    return shown.map((r) => ({ r, parking: parkingSummary(r, parkings, now) }));
  }, [shown, data]);

  const place = params.label || 'İzmir';

  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8, paddingHorizontal: 20 }}
    >
      <ScreenHeader title={t('food.title')} back />
      <Txt variant="caption" secondary style={{ marginBottom: 10 }}>
        {t('food.subtitle', { place, count: all.length })}
      </Txt>
      <View style={{ marginBottom: 10 }}>
        <SampleBanner result={data} />
      </View>
      {groupsPresent.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            <Chip
              label={t('food.all')}
              selected={filter === 'all'}
              onPress={() => setFilter('all')}
            />
            {groupsPresent.map((g) => (
              <Chip
                key={g}
                label={t(`food.groups.${g}`)}
                selected={filter === g}
                onPress={() => setFilter(g)}
              />
            ))}
          </ScrollView>
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(x) => x.r.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Txt secondary>{t('food.empty')}</Txt>}
        renderItem={({ item }) => <Row r={item.r} target={target} parking={item.parking} />}
      />
    </View>
  );
}

function Row({
  r,
  target,
  parking,
}: {
  r: NearbyRestaurant;
  target: LatLng | null;
  parking: { distanceM: number; free: number | null; at: Date | null } | null;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const meta = [
    kindLabel(r.kind, t),
    ...cuisineLabels(r.cuisines, t).slice(0, 2),
    target ? t('food.walk', { count: walkMinutes(target, r) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const parkText = parking
    ? [
        t('food.nearestParking', { distance: parking.distanceM }),
        parking.free != null && parking.at
          ? t('food.freeSpotsAt', { count: parking.free, time: formatClock(parking.at) })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('food.noParking');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('food.a11yRow', { name: r.name, meta, parking: parkText })}
      onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
      style={[
        asym(22, 6),
        {
          minHeight: 44,
          padding: 14,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          gap: 3,
        },
      ]}
    >
      <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
        {r.name}
      </Txt>
      <Txt variant="caption" secondary numberOfLines={2}>
        {meta}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
        <PBadge size={18} />
        <Txt variant="caption" style={{ flex: 1 }} numberOfLines={2}>
          {parkText}
        </Txt>
      </View>
    </Pressable>
  );
}
