import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { handOffQuestion } from '@/components/chat/handoff';
import { Txt } from '@/components/Txt';
import { asym, brand, fonts, HIT, useColors } from '@/theme';

import { Mascot } from './Mascot';

/**
 * An empty result is the one moment Yerim speaks up at once: under the "nothing found" line it
 * offers to look itself. `question` goes to the chat as the user's first message.
 */
export function AskYerim({ question }: { question: string }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      <Mascot size={70} eyes="curious" mouth="none" tilt={-8} />
      <View
        style={[
          asym(18, 5),
          {
            flex: 1,
            marginBottom: 12,
            padding: 12,
            gap: 8,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.peachLine,
          },
        ]}
      >
        <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, lineHeight: 20 }}>
          {t('mascot.emptyTitle')}
        </Txt>
        <Txt secondary style={{ fontSize: 13, lineHeight: 18 }}>
          {t('mascot.emptyBody')}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mascot.emptyAsk')}
          onPress={() => {
            handOffQuestion(question);
            router.push('/sohbet');
          }}
          style={({ pressed }) => [
            asym(14, 5),
            {
              alignSelf: 'flex-start',
              minHeight: HIT - 4,
              paddingHorizontal: 14,
              justifyContent: 'center',
              backgroundColor: brand.orange,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Txt style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14 }} color={brand.navy}>
            {t('mascot.emptyAsk')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
