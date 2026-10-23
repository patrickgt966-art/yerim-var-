import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import {
  asym,
  brand,
  fonts,
  HIT,
  TAB_BAR_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_OVERHANG,
  useColors,
} from '@/theme';

import { CoachTarget, useCoachTarget } from './coach/registry';
import { TabGlyph, type TabGlyphName } from './home/TabGlyph';
import { MascotFace } from './mascot/Mascot';
import { Txt } from './Txt';

const GLYPHS: Record<string, TabGlyphName> = {
  index: 'home',
  harita: 'map',
  favoriler: 'heart',
  profil: 'user',
};

const LABELS: Record<string, string> = {
  index: 'home.tabHome',
  harita: 'tabs.map',
  favoriler: 'tabs.favorites',
  profil: 'tabs.profile',
};

const CENTER_SIZE = 66;

/**
 * Floating tab bar (home design B3): a rounded card 12 pt from the sides and
 * above the safe area, four tab routes and a raised orange "Yerim" button in
 * the middle that opens the chat (it is an action, not a tab route).
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors();
  const { t } = useTranslation();
  const coachYerim = useCoachTarget('yerim');

  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const color = focused ? c.text : c.textSecondary;
    const label = t(LABELS[route.name] ?? route.name);
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const e = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{
          flex: 1,
          minHeight: HIT + 12,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        <CoachTarget
          coachKey={route.name === 'harita' ? 'map' : null}
          style={{
            width: 52,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? brand.mintSoft : 'transparent',
          }}
        >
          <TabGlyph
            name={GLYPHS[route.name] ?? 'home'}
            color={color}
            size={27}
            strokeWidth={focused ? 2.3 : 2}
          />
        </CoachTarget>
        <Txt
          color={color}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.3}
          style={{
            fontFamily: focused ? fonts.bodyExtraBold : fonts.bodyBold,
            fontSize: 13,
            lineHeight: 16,
            textAlign: 'center',
          }}
        >
          {label}
        </Txt>
      </Pressable>
    );
  });

  return (
    // The wrapper includes the overhang of the raised button so its top edge stays tappable.
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + TAB_BAR_GAP,
        paddingTop: TAB_BAR_OVERHANG,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={{
          minHeight: TAB_BAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 26,
          backgroundColor: c.card,
          shadowColor: brand.navy,
          shadowOpacity: 0.18,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        {items.slice(0, 2)}
        <View style={{ flex: 1 }} />
        {items.slice(2)}
      </View>
      <Pressable
        {...coachYerim}
        accessibilityRole="button"
        accessibilityLabel={t('home.a11yYerim')}
        accessibilityHint={t('home.a11yYerimHint')}
        onPress={() => router.push('/sohbet')}
        style={({ pressed }) => [
          {
            position: 'absolute',
            top: 0,
            left: '50%',
            marginLeft: -CENTER_SIZE / 2,
            width: CENTER_SIZE,
            height: CENTER_SIZE,
            // The mascot's shape: three round corners, the bottom-left one tight, a slight lean.
            ...asym(24, 8),
            transform: [{ rotate: '-4deg' }],
            borderWidth: 4,
            borderColor: c.card,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            shadowColor: brand.orange,
            shadowOpacity: 0.45,
            shadowRadius: 9,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          },
        ]}
      >
        <MascotFace size={30} />
        <Txt
          allowFontScaling={false}
          style={{ fontFamily: fonts.display, fontSize: 12, lineHeight: 14, marginTop: 1 }}
          color={brand.navy}
        >
          {t('home.tabYerim')}
        </Txt>
      </Pressable>
    </View>
  );
}
