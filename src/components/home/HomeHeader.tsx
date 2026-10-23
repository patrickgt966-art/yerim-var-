import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandWordmark } from '@/components/BrandWordmark';
import { CityButton } from '@/components/CityPicker';
import { Icon } from '@/components/Icon';
import { greetingKey, HandNote } from '@/components/lively/Hand';
import { Txt } from '@/components/Txt';
import { aiBaseUrl } from '@/lib/ai/client';
import { refreshAiQuota } from '@/lib/ai/refresh';
import { useNow } from '@/lib/useNow';
import { useAi } from '@/store/ai';
import { fonts, useColors } from '@/theme';

/** Remaining AI uses, only while the AI layer is on and the user agreed to it. */
function AiPill() {
  const c = useColors();
  const { t } = useTranslation();
  const consent = useAi((s) => s.consent);
  const left = useAi((s) => s.remaining());
  // Throttled; keeps the pill honest after a failed or slow AI call.
  useFocusEffect(
    useCallback(() => {
      void refreshAiQuota();
    }, []),
  );
  if (!aiBaseUrl() || consent !== 'yes') return null;
  return (
    <View
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
        backgroundColor: c.peachSoft,
      }}
    >
      <Icon name="chat" size={17} color={c.peachText} strokeWidth={2.3} />
      <Txt
        allowFontScaling={false}
        style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 18 }}
        color={c.peachText}
      >
        {left}
      </Txt>
    </View>
  );
}

/** Light header (lively design): logo, city and the AI pill, then a hand-written hello. */
export function HomeHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const hour = new Date(useNow(60_000)).getHours();
  return (
    <>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <BrandWordmark layout="inline" tone="onLight" size={26} header />
        </View>
        <View>
          <CityButton />
        </View>
        <AiPill />
      </View>
      <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
        <HandNote size={24} underline={110}>
          {t(`home.greeting.${greetingKey(hour)}`)}
        </HandNote>
      </View>
    </>
  );
}
