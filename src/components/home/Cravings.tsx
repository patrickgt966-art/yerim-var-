import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { brand, fonts, useColors } from '@/theme';

import { CRAVING_IDS, CravingIcon } from './CravingIcon';
import { openChat } from './SearchCard';

/** "Canın ne çekiyor?": swipeable dish tiles that open the chat (design V5.1). */
export function Cravings() {
  const c = useColors();
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
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {CRAVING_IDS.map((id) => {
          const name = t(`home.cravings.${id}`);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t('home.a11yCraving', { name })}
              onPress={() => openChat(name.toLowerCase())}
              style={{ width: 76, minHeight: 44, alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: brand.peachLine,
                  backgroundColor: brand.peachSoft,
                }}
              >
                <CravingIcon id={id} color={c.text} size={34} />
              </View>
              <Txt
                numberOfLines={2}
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 13,
                  lineHeight: 17,
                  textAlign: 'center',
                }}
              >
                {name}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
