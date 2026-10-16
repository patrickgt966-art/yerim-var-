import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoachRegistry } from '@/components/coach/registry';
import { ActiveStrip } from '@/components/home/ActiveStrip';
import { Cravings } from '@/components/home/Cravings';
import { HomeHeader } from '@/components/home/HomeHeader';
import { NearbyCard } from '@/components/home/NearbyCard';
import { QuickActions } from '@/components/home/QuickActions';
import { SearchCard } from '@/components/home/SearchCard';
import { useNearbyHome } from '@/components/home/useNearbyHome';
import { useColors, useTabBarSpace } from '@/theme';

/** Home (design B3): one screen, search first, then the two main jobs. */
export default function HomeScreen() {
  // White status-bar text over the navy hero, only while this tab is shown.
  // A fixed navy strip keeps it readable when the hero scrolls away.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      useCoachRegistry.getState().setHomeFocused(true);
      return () => {
        setFocused(false);
        useCoachRegistry.getState().setHomeFocused(false);
      };
    }, []),
  );
  const c = useColors();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const nearby = useNearbyHome();

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {focused && <StatusBar style="light" />}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.surface }}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        keyboardShouldPersistTaps="handled"
      >
        <HomeHeader />
        <SearchCard />
        <ActiveStrip />
        <QuickActions nearby={nearby} />
        <Cravings />
        <NearbyCard nearby={nearby} />
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: c.hero,
        }}
      />
    </View>
  );
}
