import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { asym, brand, fonts, HIT, useColors } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

const ICONS: Record<string, IconName> = {
  index: 'search',
  harita: 'map',
  favoriler: 'star',
  profil: 'user',
};

const LABELS: Record<string, string> = {
  index: 'tabs.search',
  harita: 'tabs.map',
  favoriler: 'tabs.favorites',
  profil: 'tabs.profile',
};

/** Five-slot tab bar: four routes plus the central "Hemen bul" action. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors();
  const { t } = useTranslation();

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
        <Icon name={ICONS[route.name] ?? 'search'} color={color} strokeWidth={focused ? 2.2 : 2} />
        <Txt
          variant="label"
          color={color}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.6}
          style={{ textAlign: 'center' }}
        >
          {label}
        </Txt>
        <View
          style={{
            height: 3,
            width: 18,
            borderRadius: 2,
            borderTopWidth: focused ? 3 : 0,
            borderColor: c.accentStrong,
            borderStyle: 'dashed',
          }}
        />
      </Pressable>
    );
  });

  // "Yerim!": the app's promise as the main action, in the brand's one orange button.
  const center = (
    <View key="find" style={{ flex: 1.5, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('tabs.yerim')} ${t('tabs.findNow')}`}
        accessibilityHint={t('tabs.findHint')}
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
        style={({ pressed }) => [
          asym(20, 6),
          {
            marginTop: -22,
            minWidth: 76,
            maxWidth: '96%',
            height: 54,
            paddingHorizontal: 10,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#0B3C49',
            shadowOpacity: 0.28,
            shadowRadius: 9,
            shadowOffset: { width: 0, height: 6 },
          },
        ]}
      >
        <Txt
          style={{ fontFamily: fonts.display, fontSize: 19, color: brand.navy }}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {t('tabs.yerim')}
        </Txt>
      </Pressable>
      <Txt
        variant="label"
        secondary
        style={{ textAlign: 'center', marginTop: 3 }}
        maxFontSizeMultiplier={1.6}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {t('tabs.yerimHint')}
      </Txt>
    </View>
  );

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {items.slice(0, 2)}
      {center}
      {items.slice(2)}
    </View>
  );
}
