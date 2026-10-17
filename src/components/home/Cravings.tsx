import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { brand, fonts, HIT } from '@/theme';

import { openChat } from './SearchCard';

/** Keys of home.cravings, in the order shown. */
const CRAVING_IDS = [
  'breakfast',
  'lahmacun',
  'kebab',
  'fish',
  'soup',
  'chickenRice',
  'world',
  'dessert',
  'coffee',
  'meyhane',
] as const;

/** "Canın ne çekiyor?": a swipeable row of dish chips that open the chat (design V5). */
export function Cravings() {
  const { t } = useTranslation();
  return (
    <View>
      <Txt
        accessibilityRole="header"
        style={{
          fontFamily: fonts.display,
          fontSize: 22,
          lineHeight: 28,
          letterSpacing: -0.4,
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 10,
        }}
      >
        {t('home.cravingTitle')}
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {CRAVING_IDS.map((id) => {
          const name = t(`home.cravings.${id}`);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t('home.a11yCraving', { name })}
              onPress={() => openChat(name.toLowerCase())}
              style={({ pressed }) => ({
                minHeight: HIT + 4,
                paddingHorizontal: 18,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: brand.peachLine,
                justifyContent: 'center',
                backgroundColor: pressed ? brand.peachLine : brand.peachSoft,
              })}
            >
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18 }}>{name}</Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
