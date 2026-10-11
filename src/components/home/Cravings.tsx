import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { brand, fonts, useColors } from '@/theme';

import { CRAVING_IDS, CravingIcon } from './CravingIcon';
import { openChat } from './SearchCard';

/** "Canın ne çekiyor?": swipeable dish shortcuts that open the chat. */
export function Cravings() {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 4,
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 10,
        }}
      >
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 24 }}
        >
          {t('home.cravingTitle')}
        </Txt>
        <Txt
          accessible={false}
          importantForAccessibility="no"
          style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
          color={c.textSecondary}
        >
          {t('home.swipe')}
        </Txt>
      </View>
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
                  width: 60,
                  height: 60,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.card,
                  shadowColor: brand.navy,
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <CravingIcon id={id} color={c.text} />
              </View>
              <Txt
                numberOfLines={2}
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 12,
                  lineHeight: 16,
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
