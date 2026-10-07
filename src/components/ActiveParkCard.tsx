import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { estimateCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import type { ActivePark } from '@/store/app';
import { asym, fonts, useColors } from '@/theme';

import { PBadge } from './PBadge';
import { Txt } from './Txt';

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ActiveParkCard({ active }: { active: ActivePark }) {
  const c = useColors();
  const { t } = useTranslation();
  const now = useNow();
  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = estimateCost(active.hourly, elapsed / 60000);
  const duration = durationText(elapsed, t);
  const sub = [active.note, duration].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('search.active')}: ${active.name}, ${duration}${cost != null ? `, ${t('favorites.estCost')} ₺${cost}` : ''}`}
      onPress={() => router.push('/favoriler')}
      style={[
        asym(22, 6),
        {
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      <PBadge size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 17 }} numberOfLines={2}>
          {active.name}
        </Txt>
        <Txt variant="caption" secondary>
          {sub}
        </Txt>
      </View>
      {cost != null && (
        <Txt style={{ fontFamily: fonts.display, fontSize: 22 }} color={c.plenty}>
          ₺{cost}
        </Txt>
      )}
    </Pressable>
  );
}
