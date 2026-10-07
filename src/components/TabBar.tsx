import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { HIT, useColors } from '@/theme';

import { CarMark } from './CarMark';
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
        <Txt variant="label" color={color} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {label}
        </Txt>
        <View
          style={{
            height: 3,
            width: 18,
            borderRadius: 2,
            borderTopWidth: focused ? 3 : 0,
            borderColor: c.accent,
            borderStyle: 'dashed',
          }}
        />
      </Pressable>
    );
  });

  const center = (
    <View key="find" style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tabs.findNow')}
        accessibilityHint="Konumuna en yakın boş yeri olan otoparkı gösterir"
        onPress={() => router.push({ pathname: '/sonuc', params: { near: '1' } })}
        style={{
          marginTop: -26,
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 4,
          borderColor: c.bg,
          backgroundColor: '#0B3C49',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0B3C49',
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <CarMark size={32} glass="#0B3C49" wheels={false} lights={false} />
      </Pressable>
      <Txt
        variant="label"
        style={{ textAlign: 'center', marginTop: 2 }}
        maxFontSizeMultiplier={1.4}
      >
        {t('tabs.findNow')}
      </Txt>
    </View>
  );

  return (
    <View
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
