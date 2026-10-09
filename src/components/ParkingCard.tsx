import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { getFreshness, occupancyLevel, visibleFree } from '@/data/freshness';
import type { RankedParking } from '@/data/useParkings';
import { levelWord } from '@/lib/a11y';
import { disabledInfo, type DisabledInfo } from '@/lib/disabledSpots';
import { metaLine } from '@/lib/format';
import { openState } from '@/lib/openNow';
import { isStatic, sourceLabel, staticHeadline } from '@/lib/staticInfo';
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
  freeTag?: boolean;
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
  const word = levelWord(level, t);
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
      {/* A word as well as a colour, for colour-blind users. */}
      {word && (
        <Txt variant="label" color={color} style={{ fontFamily: fonts.bodyBold }}>
          {word}
        </Txt>
      )}
    </View>
  );
}

function disabledText(d: DisabledInfo, t: (k: string, o?: Record<string, unknown>) => string) {
  return d.kind === 'count'
    ? t('a11y.disabledCount', { free: d.free, capacity: d.capacity })
    : t('a11y.disabledExists');
}

/** Small "Engelli yeri" line; only for car parks that report disabled bays. */
function DisabledLine({ info }: { info: DisabledInfo | null }) {
  const { t } = useTranslation();
  if (!info) return null;
  return (
    <Txt variant="label" secondary style={{ marginTop: 2 }}>
      {disabledText(info, t)}
    </Txt>
  );
}

/** Right-hand number for car parks without a live count: capacity or walk. */
function StaticHeadline({ parking: p, size }: { parking: RankedParking; size: number }) {
  const c = useColors();
  const { t } = useTranslation();
  const h = staticHeadline(p, t);
  if (!h) return null;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Txt
        style={{
          fontFamily: fonts.display,
          fontSize: size * 0.8,
          lineHeight: size * 0.9,
          letterSpacing: -1,
        }}
        color={c.text}
        maxFontSizeMultiplier={1.4}
      >
        {h.value}
      </Txt>
      <Txt variant="label" secondary>
        {h.label}
      </Txt>
    </View>
  );
}

/** Replaces the slot strip: friendly "no live count" badge and the source. */
function StaticFacts({ parking: p }: { parking: RankedParking }) {
  const c = useColors();
  const { t } = useTranslation();
  const src = sourceLabel(p, t);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <Tag text={t('freshness.noData')} bg={c.badgeInfoBg} fg={c.badgeInfoText} />
      {src && <Tag text={src} bg={c.chipBg} fg={c.text} />}
    </View>
  );
}

export function ParkingCard({
  parking: p,
  featured,
  nearest,
  freeTag,
  onParkHere,
  onDetail,
}: Props) {
  const c = useColors();
  const { t } = useTranslation();
  const freshness = getFreshness(p);
  const free = visibleFree(p);
  const mode = useApp((s) => s.mode);
  const meta = metaLine(p, t, mode);
  const spokenMeta = metaLine(p, t, mode, true);

  const staticCard = isStatic(p);
  // When isOpen is false the meta line already says "Şu an kapalı".
  const maybeClosed = p.isOpen !== false && openState(p) === 'closed';
  const disabled = staticCard ? null : disabledInfo(p);
  const word = staticCard ? null : levelWord(occupancyLevel(free, p.capacity), t);
  const a11y = staticCard
    ? t('card.a11yStatic', {
        name: p.name,
        meta: spokenMeta,
        facts: [
          sourceLabel(p, t),
          p.capacity != null ? `${p.capacity} ${t('card.capacityUnit')}` : null,
        ]
          .filter(Boolean)
          .join(', '),
      })
    : `${p.name}. ${spokenMeta}. ${free == null ? t('common.unknown') : `${free} ${t('common.free')}`}${word ? `, ${word}` : ''}. ${freshnessText(freshness, t)}${disabled ? `. ${disabledText(disabled, t)}` : ''}${maybeClosed ? `. ${t('results.maybeClosed')}` : ''}`;

  if (!featured) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
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
            {staticCard ? meta : [meta, freshnessText(freshness, t)].filter(Boolean).join(' · ')}
          </Txt>
          {maybeClosed && (
            <Txt variant="label" secondary style={{ marginTop: 2 }}>
              {t('results.maybeClosed')}
            </Txt>
          )}
          <DisabledLine info={disabled} />
          <View style={{ marginTop: 9 }}>
            {staticCard ? (
              <StaticFacts parking={p} />
            ) : (
              <SlotStrip free={free} capacity={p.capacity} />
            )}
          </View>
        </View>
        {staticCard ? (
          <StaticHeadline parking={p} size={34} />
        ) : (
          <BigCount free={free} capacity={p.capacity} size={34} />
        )}
      </Pressable>
    );
  }

  return (
    <View style={[asym(22, 6), { padding: 14, backgroundColor: c.surface }]}>
      <DashedFrame color={c.text} radius={22} tight={6} strokeWidth={2} dash={[8, 6]} />
      {/* One VoiceOver stop for the info block; the two buttons stay separate. */}
      <View
        accessible
        accessibilityLabel={a11y}
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
            {freeTag && !nearest && (
              <Tag text={t('results.freeSpace')} bg={c.badgeNearBg} fg={c.badgeNearText} />
            )}
            {!staticCard && <FreshnessBadge freshness={freshness} />}
          </View>
          <Txt style={{ fontFamily: fonts.display, fontSize: 18, marginTop: 7 }}>{p.name}</Txt>
          <Txt variant="caption" secondary style={{ marginTop: 2 }}>
            {meta}
          </Txt>
          {maybeClosed && (
            <Txt variant="label" secondary style={{ marginTop: 2 }}>
              {t('results.maybeClosed')}
            </Txt>
          )}
          <DisabledLine info={disabled} />
          <View style={{ marginTop: 9 }}>
            {staticCard ? (
              <StaticFacts parking={p} />
            ) : (
              <SlotStrip free={free} capacity={p.capacity} />
            )}
          </View>
        </View>
        {staticCard ? (
          <StaticHeadline parking={p} size={40} />
        ) : (
          <BigCount free={free} capacity={p.capacity} size={40} />
        )}
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
