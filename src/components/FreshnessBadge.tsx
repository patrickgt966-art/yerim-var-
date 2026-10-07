import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatClock, type Freshness } from '@/data/freshness';
import { asym, useColors } from '@/theme';

import { Txt } from './Txt';

export function freshnessText(f: Freshness, t: TFunction): string {
  switch (f.kind) {
    case 'live':
      return t('freshness.live');
    case 'updated':
      return t('freshness.updated', { time: formatClock(f.at) });
    case 'sample':
      return t('freshness.sample');
    case 'noData':
      return t('freshness.noData');
    default:
      return t('freshness.unknown');
  }
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  const c = useColors();
  const { t } = useTranslation();
  const fresh = freshness.kind === 'live' || freshness.kind === 'updated';
  const bg = fresh ? c.badgeFreshBg : freshness.kind === 'sample' ? c.warnBg : c.badgeUnknownBg;
  const fg = fresh
    ? c.badgeFreshText
    : freshness.kind === 'sample'
      ? c.warnText
      : c.badgeUnknownText;
  return (
    <View
      style={[
        asym(10, 3),
        {
          minHeight: 22,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 8,
          backgroundColor: bg,
        },
      ]}
    >
      {fresh && (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.plenty }} />
      )}
      <Txt variant="label" color={fg}>
        {freshnessText(freshness, t)}
      </Txt>
    </View>
  );
}

export function Tag({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View
      style={[
        asym(10, 3),
        { minHeight: 22, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: bg },
      ]}
    >
      <Txt variant="label" color={fg}>
        {text}
      </Txt>
    </View>
  );
}
