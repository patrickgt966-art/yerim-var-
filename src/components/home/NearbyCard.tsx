import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { freshnessText } from '@/components/FreshnessBadge';
import { CATEGORY_ICON } from '@/components/foodCategory';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/mascot/Mascot';
import { ParkingMap } from '@/components/ParkingMap';
import { Txt } from '@/components/Txt';
import { formatClock, getFreshness, occupancyLevel } from '@/data/freshness';
import { distanceMeters, walkMinutes, type LatLng } from '@/data/geo';
import { categoryOf, formatDistance, type RestaurantRow } from '@/data/restaurants';
import { areaName } from '@/data/search';
import type { RankedParking } from '@/data/useParkings';
import { useApp } from '@/store/app';
import { brand, fonts, HIT, statusTone, useColors } from '@/theme';

import type { NearbyHome } from './useNearbyHome';

type Filter = 'all' | 'park' | 'food';
type Item =
  | { key: string; kind: 'park'; p: RankedParking }
  | { key: string; kind: 'food'; row: RestaurantRow };

const MAX_ROWS = 4;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'home.filterAll' },
  { id: 'park', label: 'home.filterPark' },
  { id: 'food', label: 'home.filterFood' },
];

/** Hepsi: car park and restaurant alternate, nearest of each first. */
function mix(parks: RankedParking[], foods: RestaurantRow[]): Item[] {
  const out: Item[] = [];
  for (let i = 0; out.length < MAX_ROWS && (i < parks.length || i < foods.length); i++) {
    const p = parks[i];
    const f = foods[i];
    if (p) out.push({ key: `p-${p.id}`, kind: 'park', p });
    if (f && out.length < MAX_ROWS) out.push({ key: `r-${f.r.id}`, kind: 'food', row: f });
  }
  return out;
}

/** Hepsi · Otopark · Yemek as text tabs; the chosen one is underlined (design V5). */
function Segmented({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('home.filterLabel')}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {FILTERS.map((f) => {
        const selected = value === f.id;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(f.id)}
            style={{ minHeight: HIT, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Txt
              style={{
                fontFamily: selected ? fonts.bodyExtraBold : fonts.body,
                fontSize: 14,
                lineHeight: 19,
              }}
              color={selected ? c.text : c.textSecondary}
            >
              {t(f.label)}
            </Txt>
            <View
              style={{
                position: 'absolute',
                left: 6,
                right: 6,
                bottom: 4,
                height: 3,
                borderRadius: 2,
                backgroundColor: selected ? c.text : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function RowShell({
  onPress,
  label,
  last,
  children,
}: {
  onPress: () => void;
  label: string;
  last: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 60,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.chipBg,
      }}
    >
      {children}
    </Pressable>
  );
}

function ParkRow({ p, last }: { p: RankedParking; last: boolean }) {
  const { t } = useTranslation();
  const f = getFreshness(p);
  const fresh = (f.kind === 'live' || f.kind === 'updated') && p.free != null;
  const level = fresh ? occupancyLevel(p.free, p.capacity) : 'unknown';
  const tone = statusTone(level).fg;
  const status =
    fresh && 'at' in f ? t('home.updatedAt', { time: formatClock(f.at) }) : freshnessText(f, t);
  const sub = [t('home.walkMin', { count: p.walk }), status].join(' · ');
  const a11yFree = fresh ? `, ${t('nearby.a11yFree', { count: p.free })}` : '';
  return (
    <RowShell
      last={last}
      label={`${p.name}, ${sub}${a11yFree}`}
      onPress={() => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
    >
      <View
        accessible={false}
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.mintSoft,
        }}
      >
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 22 }}
          color={brand.mintText}
        >
          P
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          numberOfLines={2}
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 19 }}
        >
          {p.name}
        </Txt>
        <Txt
          secondary
          numberOfLines={2}
          style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
        >
          {sub}
        </Txt>
      </View>
      {fresh && (
        <Txt
          accessible={false}
          allowFontScaling={false}
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 19 }}
          color={tone}
        >
          {level === 'full' ? t('a11y.levelFull') : t('home.free', { count: p.free ?? 0 })}
        </Txt>
      )}
    </RowShell>
  );
}

function FoodRow({ row, here, last }: { row: RestaurantRow; here: LatLng; last: boolean }) {
  const c = useColors();
  const { t } = useTranslation();
  const { r, parking } = row;
  const cat = categoryOf(r);
  const parkText = parking
    ? parking.free != null
      ? t('home.parkAtFree', { distance: parking.distanceM, count: parking.free })
      : t('home.parkAt', { distance: parking.distanceM })
    : t('food.noParking');
  const stale = !r.verified;
  const sub = [t('home.walkMin', { count: walkMinutes(here, r) }), parkText].join(' · ');
  const distance = formatDistance(r.distanceM);
  return (
    <RowShell
      last={last}
      label={`${r.name}, ${sub}${stale ? `, ${t('home.staleInfo')}` : ''}, ${distance}`}
      onPress={() => router.push({ pathname: '/restoran/[id]', params: { id: r.id } })}
    >
      <View
        accessible={false}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.peachSoft,
        }}
      >
        <Icon name={cat ? CATEGORY_ICON[cat] : 'cutlery'} size={20} color={c.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          numberOfLines={2}
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 19 }}
        >
          {r.name}
        </Txt>
        <Txt
          secondary
          numberOfLines={3}
          style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
        >
          {sub}
          {stale && (
            <>
              {' · '}
              <Txt
                style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
                color={c.badgeUnknownText}
              >
                {t('home.staleInfo')}
              </Txt>
            </>
          )}
        </Txt>
      </View>
      <Txt secondary style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}>
        {distance}
      </Txt>
    </RowShell>
  );
}

/** Map preview: not interactive, the whole thing opens the map tab. */
function MapPreview({
  here,
  parks,
  foods,
  delta,
}: {
  here: LatLng;
  parks: RankedParking[];
  foods: RestaurantRow[];
  delta: number;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const restaurants = useMemo(() => foods.map((x) => x.r), [foods]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.a11yOpenMap')}
      onPress={() => router.navigate('/harita')}
      style={{ height: 150, backgroundColor: c.chipBg }}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flex: 1 }}
      >
        <ParkingMap
          key={delta.toFixed(3)}
          parkings={parks}
          restaurants={restaurants}
          center={here}
          delta={delta}
          onSelect={() => {}}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          minHeight: 36,
          paddingHorizontal: 14,
          borderRadius: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.card,
          shadowColor: brand.navy,
          shadowOpacity: 0.15,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      >
        <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 17 }}>
          {t('home.openMap')}
        </Txt>
        <Icon name="arrow" size={16} color={brand.navy} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/** "Yakınında" (design V5): tabbed list of the nearest car parks and restaurants with a map preview. */
export function NearbyCard({ nearby }: { nearby: NearbyHome }) {
  const c = useColors();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const { here, parks, foods } = nearby;
  // Re-read on a city switch: the neighbourhoods come from the active city.
  useApp((s) => s.city);
  const area = here ? areaName(here) : undefined;
  const items = useMemo<Item[]>(() => {
    if (filter === 'park')
      return parks.map((p) => ({ key: `p-${p.id}`, kind: 'park' as const, p }));
    if (filter === 'food')
      return foods.map((row) => ({ key: `r-${row.r.id}`, kind: 'food' as const, row }));
    return mix(parks, foods);
  }, [filter, parks, foods]);
  const shown = items.slice(0, MAX_ROWS);

  // Zoom so every candidate pin fits, whatever the filter, so switching does not move the map.
  const delta = useMemo(() => {
    if (!here) return 0.012;
    const far = Math.max(
      0,
      ...parks.map((p) => p.distance),
      ...foods.map((x) => distanceMeters(here, x.r)),
    );
    return Math.min(0.04, Math.max(0.006, (far * 2.6) / 111_320));
  }, [here, parks, foods]);

  const showPrompt = !here && nearby.needsPermission && !nearby.dismissed;
  if (!here && !showPrompt) return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}
        >
          {t('home.nearTitle')}
        </Txt>
        {here && <Segmented value={filter} onChange={setFilter} />}
      </View>
      {!!area && (
        <Txt secondary style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18 }}>
          {t('home.nearArea', { place: area })}
        </Txt>
      )}
      <View
        style={{
          marginTop: 10,
          borderRadius: 22,
          backgroundColor: c.card,
          shadowColor: brand.navy,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View style={{ borderRadius: 22, overflow: 'hidden' }}>
          {here ? (
            <>
              {(parks.length > 0 || foods.length > 0) && (
                <MapPreview
                  here={here}
                  parks={filter === 'food' ? [] : parks}
                  foods={filter === 'park' ? [] : foods}
                  delta={delta}
                />
              )}
              {shown.length === 0 ? (
                <Txt secondary style={{ padding: 14 }}>
                  {t('home.empty')}
                </Txt>
              ) : (
                shown.map((it, i) =>
                  it.kind === 'park' ? (
                    <ParkRow key={it.key} p={it.p} last={i === shown.length - 1} />
                  ) : (
                    <FoodRow key={it.key} row={it.row} here={here} last={i === shown.length - 1} />
                  ),
                )
              )}
            </>
          ) : (
            <View style={{ gap: 10, padding: 14 }}>
              {/* Yerim asks for the location itself: it cannot find what is near without it. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                <Mascot size={64} eyes="curious" mouth="none" tilt={-8} />
                <View style={{ flex: 1, gap: 4, paddingBottom: 8 }}>
                  <Txt variant="bodyBold">{t('nearby.locationTitle')}</Txt>
                  <Txt secondary style={{ fontSize: 13, lineHeight: 18 }}>
                    {t('nearby.locationYerim')}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  kind="secondary"
                  label={t(nearby.canAsk ? 'nearby.locationAllow' : 'nearby.locationSettings')}
                  onPress={() => void nearby.allow()}
                />
                <Button
                  kind="secondary"
                  label={t('nearby.locationDismiss')}
                  onPress={nearby.dismiss}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
