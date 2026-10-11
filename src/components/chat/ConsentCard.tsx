import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { brand, fonts, HIT, useColors } from '@/theme';

import { softShadow } from './style';

/** The one-time "smart help" consent: white card, sparkle title, two buttons. */
export function ConsentCard({ onChoose }: { onChoose: (v: 'yes' | 'no') => void }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      style={[
        {
          marginHorizontal: 16,
          padding: 14,
          gap: 10,
          borderRadius: 18,
          backgroundColor: c.card,
        },
        softShadow(0.08),
      ]}
    >
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}
      >
        {t('chat.aiConsentTitle')}
      </Txt>
      <Txt style={{ fontSize: 14, lineHeight: 20 }}>{t('chat.aiConsentBody')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['yes', 'no'] as const).map((v) => {
          const label = t(v === 'yes' ? 'chat.aiConsentYes' : 'chat.aiConsentNo');
          const primary = v === 'yes';
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onChoose(v)}
              style={({ pressed }) => ({
                minHeight: HIT,
                minWidth: 96,
                paddingHorizontal: 16,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: primary
                  ? pressed
                    ? c.primary
                    : c.hero
                  : pressed
                    ? c.surface
                    : c.card,
                borderWidth: primary ? 0 : 1.5,
                borderColor: brand.orangeLight,
              })}
            >
              <Txt
                color={primary ? c.onHero : c.text}
                style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14 }}
              >
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
