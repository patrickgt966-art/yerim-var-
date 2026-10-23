import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoachRegistry } from '@/components/coach/registry';
import { ActiveStrip } from '@/components/home/ActiveStrip';
import { Cravings } from '@/components/home/Cravings';
import { HomeHeader } from '@/components/home/HomeHeader';
import { NearbyCard } from '@/components/home/NearbyCard';
import { QuickActions } from '@/components/home/QuickActions';
import { ExampleQuestions, SearchCard } from '@/components/home/SearchCard';
import { useNearbyHome } from '@/components/home/useNearbyHome';
import { MascotNudge } from '@/components/mascot/MascotNudge';
import { useColors, useTabBarSpace } from '@/theme';

/** Home (design V5): one warm screen, search first, then the two main jobs. */
export default function HomeScreen() {
  useFocusEffect(
    useCallback(() => {
      useCoachRegistry.getState().setHomeFocused(true);
      return () => useCoachRegistry.getState().setHomeFocused(false);
    }, []),
  );
  const c = useColors();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const nearby = useNearbyHome();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        keyboardShouldPersistTaps="handled"
      >
        <HomeHeader />
        <SearchCard />
        <QuickActions nearby={nearby} />
        <ExampleQuestions />
        <ActiveStrip />
        <Cravings />
        <NearbyCard nearby={nearby} />
      </ScrollView>
      <MascotNudge nearby={nearby} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: c.bg,
        }}
      />
    </View>
  );
}
