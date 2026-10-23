import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import Svg, { Path } from 'react-native-svg';

import { HandNote } from '@/components/lively/Hand';
import { Txt } from '@/components/Txt';
import { useNow } from '@/lib/useNow';
import { fonts, useColors, useIsDark } from '@/theme';

import { CRAVING_IDS, CravingIcon, type CravingId } from './CravingIcon';
import { mealSlot, orderCravings } from './cravingOrder';
import { openChat } from './SearchCard';

/** Each dish on its own coloured plate (light theme). */
const PLATES: Record<CravingId, string> = {
  breakfast: '#FFF3C4',
  lahmacun: '#FFD9B0',
  kebab: '#F6E2B8',
  fish: '#D6ECF4',
  soup: '#E2F1EA',
  chickenRice: '#FCE8D5',
  world: '#E3E8F7',
  dessert: '#F9D7DE',
  coffee: '#EADBCB',
  meyhane: '#DDEFE4',
};

/**
 * "Canın ne çekiyor?": swipeable dish tiles that open the chat (design V5.1), ordered for the
 * time of day with a small line naming the meal.
 */
export function Cravings() {
  const c = useColors();
  const dark = useIsDark();
  const { t } = useTranslation();
  // In the dark the plates take the theme's soft surfaces in turn.
  const darkPlates = [c.peachSoft, c.mintSoft, c.chipBg];
  const hour = new Date(useNow(60_000)).getHours();
  const ids = useMemo(() => orderCravings(CRAVING_IDS, hour), [hour]);
  return (
    <View>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}
          >
            {t('home.cravingTitle')}
          </Txt>
          <Txt
            style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 }}
            color={c.peachText}
          >
            {t(`home.cravingSlot.${mealSlot(hour)}`)}
          </Txt>
        </View>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 }}
        >
          <HandNote size={18} color={c.textSecondary} tilt={-4}>
            {t('home.swipe')}
          </HandNote>
          <Svg width={26} height={14} viewBox="0 0 26 14">
            <Path
              d="M2 9c6-5 13-6 21-3M18 2l5 4-5 4"
              fill="none"
              stroke={c.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {ids.map((id, i) => {
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
                  borderRadius: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 5,
                  borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.65)',
                  backgroundColor: dark ? darkPlates[i % darkPlates.length] : PLATES[id],
                }}
              >
                <CravingIcon id={id} color={c.ink} size={30} />
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
