import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { LatLng } from '@/data/geo';
import { getFreshness, occupancyLevel, visibleFree, type Freshness } from '@/data/freshness';
import { rankByDistance, useParkings, type RankedParking } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { isStatic } from '@/lib/staticInfo';
import { asym, fonts, useColors } from '@/theme';

import { DashedFrame } from './DashedFrame';
import { FreshnessBadge, Tag } from './FreshnessBadge';
import { SampleBanner } from './SampleBanner';
import { Txt } from './Txt';

const RADIUS_METERS = 2000;
const COUNT = 3;

function Card({ p, best }: { p: RankedParking; best: boolean }) {
  const c = useColors();
  const { t } = useTranslation();
  const free = visibleFree(p);
  const level = occupancyLevel(free, p.capacity);
  const levelColor = level === 'plenty' ? c.plenty : level === 'few' ? c.few : c.full;

  let status: string;
  let detail: string;
  if (free != null) {
    detail = t('nearby.freeWalk', { walk: p.walk });
    status = `${t('nearby.a11yFree', { count: free })}, ${detail}`;
  } else {
    const noCount = isStatic(p);
    detail =
      p.capacity != null
        ? t('nearby.capacityWalk', { capacity: p.capacity, walk: p.walk })
        : t('nearby.walkOnly', { walk: p.walk });
    status = `${t(noCount ? 'freshness.noData' : 'freshness.unknown')}, ${detail}`;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${status}`}
      onPress={() => router.push({ pathname: '/otopark/[id]', params: { id: p.id } })}
      style={[
        asym(20, 6),
        {
          flex: 1,
          minHeight: 112,
          padding: 12,
          justifyContent: 'space-between',
          backgroundColor: c.card,
        },
        !best && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {best && <DashedFrame color={c.text} radius={20} tight={6} strokeWidth={2} />}
      <Txt variant="bodyBold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17 }}>
        {p.name}
      </Txt>
      <View style={{ gap: 4, alignItems: 'flex-start' }}>
        {free != null ? (
          <Txt
            color={levelColor}
            style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 36 }}
          >
            {free}
          </Txt>
        ) : isStatic(p) ? (
          <Tag text={t('freshness.noData')} bg={c.badgeInfoBg} fg={c.badgeInfoText} />
        ) : (
          <Tag text={t('freshness.unknown')} bg={c.badgeUnknownBg} fg={c.badgeUnknownText} />
        )}
        <Txt variant="label" secondary>
          {detail}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * The 3 car parks nearest the user. Only shown when location permission is
 * already granted (never prompts) and parking data exists.
 */
export function NearbyNow() {
  const { t } = useTranslation();
  const q = useParkings();
  const [here, setHere] = useState<LatLng | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      currentLocation(false, 5000).then((loc) => {
        if (alive) setHere(loc);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const result = q.data;
  const nearest = useMemo(
    () =>
      result && here ? rankByDistance(result.parkings, here, RADIUS_METERS).slice(0, COUNT) : [],
    [result, here],
  );

  // One badge for the whole row: the OLDEST real timestamp among the counts
  // shown ("Canlı" only if every one is live), the sample label for mock
  // data, nothing otherwise (never an invented time).
  const badge = useMemo<Freshness | null>(() => {
    if (!result) return null;
    if (result.source === 'mock') return { kind: 'sample' };
    let oldest: Freshness | null = null;
    let allLive = true;
    for (const p of nearest) {
      const f = getFreshness(p);
      if (f.kind !== 'live' && f.kind !== 'updated') continue;
      if (f.kind !== 'live') allLive = false;
      if (!oldest || ('at' in oldest && f.at < oldest.at)) oldest = f;
    }
    if (!oldest || !('at' in oldest)) return null;
    return allLive ? oldest : { kind: 'updated', at: oldest.at };
  }, [result, nearest]);

  if (!here || nearest.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.display, fontSize: 19, lineHeight: 24 }}
        >
          {t('nearby.title')}
        </Txt>
        {badge && <FreshnessBadge freshness={badge} />}
      </View>
      <SampleBanner result={result} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {nearest.map((p, i) => (
          <Card key={p.id} p={p} best={i === 0} />
        ))}
      </View>
    </View>
  );
}
