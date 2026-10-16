import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { useCoachTarget } from '@/components/coach/registry';
import { CityButton } from '@/components/CityPicker';
import { Txt } from '@/components/Txt';
import { aiBaseUrl } from '@/lib/ai/client';
import { refreshAiQuota } from '@/lib/ai/refresh';
import { useAi } from '@/store/ai';
import { brand, fonts, useColors } from '@/theme';

import { HomeSkyline } from './HomeSkyline';

/** Remaining AI uses, only while the AI layer is on and the user agreed to it. */
function AiPill() {
  const c = useColors();
  const { t } = useTranslation();
  const consent = useAi((s) => s.consent);
  const left = useAi((s) => s.remaining());
  const coach = useCoachTarget('ai');
  // Throttled; keeps the pill honest after a failed or slow AI call.
  useFocusEffect(
    useCallback(() => {
      void refreshAiQuota();
    }, []),
  );
  if (!aiBaseUrl() || consent !== 'yes') return null;
  return (
    <View
      {...coach}
      accessible
      accessibilityLabel={t('home.a11yAi', { count: left })}
      style={{
        minHeight: 34,
        paddingHorizontal: 12,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.badgeInfoBg,
      }}
    >
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 18 }}
        color={c.badgeInfoText}
      >
        ✨ {left}
      </Txt>
    </View>
  );
}

/** Navy hero: faint skyline, logo, city, AI pill and the title. */
export function HomeHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const cityCoach = useCoachTarget('city');
  return (
    <View
      style={{
        backgroundColor: c.hero,
        paddingTop: insets.top + 10,
        paddingHorizontal: 16,
        // Room for the İzmir skyline between the title and the search card.
        paddingBottom: 104,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: 'hidden',
      }}
    >
      <HomeSkyline />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <View
          style={{ flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <BrandWordmark layout="inline" tone="onDark" size={20} header />
        </View>
        <View
          {...cityCoach}
          style={{
            borderRadius: 22,
            paddingHorizontal: 8,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <CityButton />
        </View>
        <AiPill />
      </View>
      <Txt
        variant="display"
        color={brand.white}
        style={{ marginTop: 10, fontSize: 30, lineHeight: 33, letterSpacing: -0.5 }}
        accessibilityRole="header"
      >
        {t('home.title0')}
        <Txt
          variant="display"
          color={brand.orangeLight}
          style={{ fontSize: 30, lineHeight: 33, letterSpacing: -0.5 }}
        >
          {t('home.titleEat')}
        </Txt>
        {t('home.title1')}
        <Txt
          variant="display"
          color={brand.orangeLight}
          style={{ fontSize: 30, lineHeight: 33, letterSpacing: -0.5 }}
        >
          {t('home.title2')}
        </Txt>
        {t('home.title3')}
      </Txt>
    </View>
  );
}
