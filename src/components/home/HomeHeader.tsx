import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { useCoachTarget } from '@/components/coach/registry';
import { CityButton } from '@/components/CityPicker';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { aiBaseUrl } from '@/lib/ai/client';
import { refreshAiQuota } from '@/lib/ai/refresh';
import { useAi } from '@/store/ai';
import { brand, fonts } from '@/theme';

/** Remaining AI uses, only while the AI layer is on and the user agreed to it. */
function AiPill() {
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
        minHeight: 38,
        paddingHorizontal: 12,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        backgroundColor: brand.peachSoft,
      }}
    >
      <Icon name="sparkle" size={18} color={brand.peachText} strokeWidth={2} />
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 18 }}
        color={brand.peachText}
      >
        {left}
      </Txt>
    </View>
  );
}

/** Light header (design V5): logo, city and the AI pill on the warm page. */
export function HomeHeader() {
  const insets = useSafeAreaInsets();
  const cityCoach = useCoachTarget('city');
  return (
    <View
      style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 14,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View style={{ flexGrow: 1, flexShrink: 1 }}>
        <BrandWordmark layout="inline" tone="onLight" size={26} header />
      </View>
      <View {...cityCoach}>
        <CityButton />
      </View>
      <AiPill />
    </View>
  );
}
