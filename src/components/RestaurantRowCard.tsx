import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { DashedFrame } from '@/components/DashedFrame';
import { Tag } from '@/components/FreshnessBadge';
import { Icon } from '@/components/Icon';
import { CATEGORY_ICON } from '@/components/foodCategory';
import { PBadge } from '@/components/PBadge';
import { Txt } from '@/components/Txt';
import { formatClock } from '@/data/freshness';
import { walkMinutes, type LatLng } from '@/data/geo';
import {
  categoryOf,
  cuisineLabels,
  formatDistance,
  kindLabel,
  type RestaurantRow,
} from '@/data/restaurants';
import { asym, brand, fonts, useColors } from '@/theme';

const EASY_PARK_M = 200;
/** Beyond this the walking time stops being a useful hint. */
const FAR_WALK_M = 1200;

/** Close car park that is not known to be full. */
function isClose(p: RestaurantRow['parking']): boolean {
  return !!p && p.distanceM <= EASY_PARK_M && p.free !== 0;
}

/** "Parkı en kolay" only when fresh data shows free spaces; distance alone gets "Otopark yakın". */
export function isBest(p: RestaurantRow['parking']): boolean {
  return !!p && p.free != null && p.free > 0;
}

export function RestaurantRowCard({
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
        {!r.verified && (
          <View
            accessible
            accessibilityLabel={t('food.a11yUnverified')}
            style={{ flexDirection: 'row' }}
          >
            <Tag text={t('food.unverified')} bg={c.badgeInfoBg} fg={c.badgeInfoText} />
          </View>
        )}
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
