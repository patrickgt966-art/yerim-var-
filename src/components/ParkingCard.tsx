import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import type { RankedParking } from '@/data/useParkings';
import { metaLine } from '@/lib/format';
import { useApp } from '@/store/app';
import { asym, fonts, useColors } from '@/theme';

import { Button } from './Button';
import { DashedFrame } from './DashedFrame';
import { FreshnessBadge, freshnessText, Tag } from './FreshnessBadge';
import { PBadge } from './PBadge';
import { SlotStrip } from './SlotStrip';
import { Txt } from './Txt';

type Props = {
  parking: RankedParking;
  featured?: boolean;
  nearest?: boolean;
  onParkHere: () => void;
  onDetail: () => void;
};

function BigCount({
  free,
  capacity,
  size,
}: {
  free: number | null;
  capacity: number | null;
  size: number;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const level = occupancyLevel(free, capacity);
  const color =
    level === 'plenty'
      ? c.plenty
      : level === 'few'
        ? c.few
        : level === 'full'
          ? c.full
          : c.textSecondary;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Txt
        style={{
          fontFamily: fonts.display,
          fontSize: free == null ? 18 : size,
          lineHeight: free == null ? 24 : size * 1.05,
          letterSpacing: -1,
        }}
        color={color}
        maxFontSizeMultiplier={1.4}
      >
        {free == null ? t('common.unknown') : String(free)}
      </Txt>
      <Txt variant="label" secondary>
        {t('common.free')}
      </Txt>
    </View>
  );
}

export function ParkingCard({ parking: p, featured, nearest, onParkHere, onDetail }: Props) {
  const c = useColors();
  const { t } = useTranslation();
  const freshness = getFreshness(p);
  const free = visibleFree(p);
  const mode = useApp((s) => s.mode);
  const meta = metaLine(p, t, mode);

  if (!featured) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.name}. ${meta}. ${free == null ? t('common.unknown') : `${free} ${t('common.free')}`}. ${freshnessText(freshness, t)}`}
        accessibilityHint={t('results.details')}
        onPress={onDetail}
        style={[
          asym(22, 6),
          {
            padding: 14,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <PBadge />
            <Txt
              style={{ fontFamily: fonts.display, fontSize: 17, flexShrink: 1 }}
              numberOfLines={2}
            >
              {p.name}
            </Txt>
          </View>
          <Txt variant="caption" secondary style={{ marginTop: 2 }}>
            {[meta, freshnessText(freshness, t)].filter(Boolean).join(' · ')}
          </Txt>
          <View style={{ marginTop: 9 }}>
            <SlotStrip free={free} capacity={p.capacity} />
          </View>
        </View>
        <BigCount free={free} capacity={p.capacity} size={34} />
      </Pressable>
    );
  }

  return (
    <View style={[asym(22, 6), { padding: 14, backgroundColor: c.surface }]}>
      <DashedFrame color={c.text} radius={22} tight={6} strokeWidth={2} dash={[8, 6]} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <PBadge />
            {nearest && <Tag text={t('results.nearest')} bg={c.badgeNearBg} fg={c.badgeNearText} />}
            <FreshnessBadge freshness={freshness} />
          </View>
          <Txt
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 18, marginTop: 7 }}
          >
            {p.name}
          </Txt>
          <Txt variant="caption" secondary style={{ marginTop: 2 }}>
            {meta}
          </Txt>
          <View style={{ marginTop: 9 }}>
            <SlotStrip free={free} capacity={p.capacity} />
          </View>
        </View>
        <BigCount free={free} capacity={p.capacity} size={40} />
      </View>
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
        <Button
          label={t('results.parkHere')}
          accessibilityLabel={`${t('results.parkHere')}: ${p.name}`}
          onPress={onParkHere}
          style={{ flex: 1 }}
        />
        <Button
          label={t('results.details')}
          accessibilityLabel={`${t('results.details')}: ${p.name}`}
          kind="secondary"
          onPress={onDetail}
          style={{ minWidth: 96 }}
        />
      </View>
    </View>
  );
}
