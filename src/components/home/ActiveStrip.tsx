import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { confirmEndPark, StillParkedPrompt } from '@/components/ActiveParkCard';
import { Txt } from '@/components/Txt';
import { estimateCost } from '@/data/tariffs';
import { durationText } from '@/lib/format';
import { needsStillParkedPrompt } from '@/lib/park';
import { useNow } from '@/lib/useNow';
import { useApp } from '@/store/app';
import { brand, fonts, HIT, useColors } from '@/theme';

/** One-line active park (name, time, estimated cost) with the "Bitir" action. */
export function ActiveStrip() {
  const c = useColors();
  const { t } = useTranslation();
  const now = useNow();
  const active = useApp((s) => s.active);
  const endPark = useApp((s) => s.endPark);
  if (!active) return null;

  const elapsed = now - new Date(active.startedAt).getTime();
  const cost = estimateCost(active.hourly, elapsed / 60000);
  const duration = durationText(elapsed, t);
  const costText = cost != null ? t('home.activeCost', { cost }) : null;
  const sub = [duration, costText].filter(Boolean).join(' · ');
  const stale = needsStillParkedPrompt(active, now);

  return (
    <View style={{ marginTop: 12, marginHorizontal: 16, gap: 8 }}>
      <View
        style={{
          borderRadius: 18,
          paddingVertical: 8,
          paddingLeft: 12,
          paddingRight: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: c.badgeFreshBg,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('search.active')}: ${active.name}, ${duration}${cost != null ? `, ${t('favorites.estCost')} ${t('common.a11yLira', { price: cost })}` : ''}`}
          onPress={() => router.push('/favoriler')}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: HIT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            accessible={false}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.plenty,
            }}
          >
            <Txt
              allowFontScaling={false}
              style={{ fontFamily: fonts.display, fontSize: 15, lineHeight: 19 }}
              color={brand.white}
            >
              P
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt
              numberOfLines={2}
              style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 19 }}
            >
              {active.name}
            </Txt>
            <Txt
              numberOfLines={2}
              style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
              color={c.badgeFreshText}
            >
              {sub}
            </Txt>
          </View>
        </Pressable>
        {!stale && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('favorites.end')}
            onPress={() => confirmEndPark(t, endPark)}
            style={{
              minHeight: HIT,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: brand.navy,
            }}
          >
            <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13 }} color={brand.white}>
              {t('home.end')}
            </Txt>
          </Pressable>
        )}
      </View>
      {stale && <StillParkedPrompt />}
    </View>
  );
}
