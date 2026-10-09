import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ParkingCard } from '@/components/ParkingCard';
import { ParkingMap } from '@/components/ParkingMap';
import { SampleBanner } from '@/components/SampleBanner';
import { Txt } from '@/components/Txt';
import { visibleFree } from '@/data/freshness';
import type { LatLng } from '@/data/geo';
import { IZMIR_CENTER } from '@/data/places';
import { useRanked, type RankedParking } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { parkHere } from '@/lib/parkHere';
import { asym, fonts, HIT, useColors } from '@/theme';

type Filter = 'all' | 'indoor' | 'nearPier';

export default function ResultsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    label?: string;
    near?: string;
  }>();
  const mapRef = useRef<MapView>(null);

  const [target, setTarget] = useState<LatLng | null>(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && params.lat ? { lat, lng } : null;
  });
  const [label, setLabel] = useState(params.label ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // "Hemen bul" / locate: resolve the user's position, falling back to the city centre.
  useEffect(() => {
    if (target) return;
    let cancelled = false;
    void currentLocation().then((loc) => {
      if (cancelled) return;
      setTarget(loc ?? IZMIR_CENTER);
      setLabel(loc ? t('results.myLocation') : 'İzmir');
    });
    return () => {
      cancelled = true;
    };
  }, [target, t]);

  const nearMode = params.near === '1';
  const { ranked, data, isLoading, isError, isFetching, refetch } = useRanked(target);
  // Own flag so the spinner shows only for pull-to-refresh, not the 120 s poll.
  const [pulling, setPulling] = useState(false);
  const onPullRefresh = () => {
    setPulling(true);
    void refetch().finally(() => setPulling(false));
  };

  const filtered = useMemo(() => {
    let list: RankedParking[] = ranked;
    if (filter === 'indoor') list = list.filter((p) => p.isIndoor === true);
    if (filter === 'nearPier') list = list.filter((p) => p.nearPier);
    // "Hemen bul": put the nearest parking that has a visible free space first.
    if (nearMode) {
      const firstFree = list.findIndex((p) => (visibleFree(p) ?? 0) > 0);
      if (firstFree > 0) list = [list[firstFree]!, ...list.filter((_, i) => i !== firstFree)];
    }
    if (selectedId) {
      const i = list.findIndex((p) => p.id === selectedId);
      if (i > 0) list = [list[i]!, ...list.filter((_, j) => j !== i)];
    }
    return list;
  }, [ranked, filter, nearMode, selectedId]);

  const totalFree = filtered.reduce<number | null>((sum, p) => {
    const f = visibleFree(p);
    return f == null || sum == null ? sum : sum + f;
  }, 0);
  const anyIndoorKnown = ranked.some((p) => p.isIndoor != null);
  const anyNearPier = ranked.some((p) => p.nearPier);

  const snapPoints = useMemo(() => ['30%', '58%', '92%'], []);

  const header = (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
      <View>
        <Txt variant="title" accessibilityRole="header">
          {totalFree == null
            ? t('results.summaryUnknown', { count: filtered.length })
            : t('results.summary', { count: filtered.length, free: totalFree })}
        </Txt>
        {!!label && (
          <Txt variant="caption" secondary>
            {t('results.subtitle', { place: label })}
            {/* Saved data stays on screen while the slow API answers. */}
            {isFetching && !!data && !pulling ? ` · ${t('results.refreshing')}` : ''}
          </Txt>
        )}
      </View>
      <SampleBanner result={data} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label={t('results.all')}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        {anyIndoorKnown && (
          <Chip
            label={t('results.indoor')}
            selected={filter === 'indoor'}
            onPress={() => setFilter('indoor')}
          />
        )}
        {anyNearPier && (
          <Chip
            label={t('results.nearPier')}
            selected={filter === 'nearPier'}
            onPress={() => setFilter('nearPier')}
          />
        )}
        {target && (
          <Chip
            label={t('food.nearby')}
            selected={false}
            onPress={() =>
              router.push({
                pathname: '/restoranlar',
                params: { lat: String(target.lat), lng: String(target.lng), label },
              })
            }
          />
        )}
        {/* "Şarj" is hidden until the data source reports charging points. */}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {target ? (
        <ParkingMap
          ref={mapRef}
          parkings={filtered}
          center={target}
          targetLabel={label}
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
          bottomInset={260}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.text} />
        </View>
      )}

      {/* Top bar */}
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
        <Txt style={{ flex: 1, fontFamily: fonts.display, fontSize: 17 }} numberOfLines={1}>
          {label || 'İzmir'}
        </Txt>
      </View>

      <BottomSheet
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: c.card,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
        }}
        handleIndicatorStyle={{ backgroundColor: c.line, width: 44 }}
        accessibilityLabel="Otopark listesi"
      >
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
                nearest={index === 0 && !selectedId}
                onParkHere={() => parkHere(item)}
                onDetail={() => router.push({ pathname: '/otopark/[id]', params: { id: item.id } })}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={{ padding: 20, gap: 12 }}>
              {isLoading || !target ? (
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
      </BottomSheet>
    </View>
  );
}
