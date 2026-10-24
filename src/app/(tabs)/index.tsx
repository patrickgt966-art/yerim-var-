import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoachRegistry } from '@/components/coach/registry';
import { ActiveStrip } from '@/components/home/ActiveStrip';
import { Cravings } from '@/components/home/Cravings';
import { HomeHeader } from '@/components/home/HomeHeader';
import { NearbyCard } from '@/components/home/NearbyCard';
import { QuickActions } from '@/components/home/QuickActions';
import { ExampleQuestions, SearchCard } from '@/components/home/SearchCard';
import { SuggestionNote } from '@/components/home/SuggestionNote';
import { useNearbyHome } from '@/components/home/useNearbyHome';
import { HandNote } from '@/components/lively/Hand';
import { Paper } from '@/components/lively/Paper';
import { MascotNudge } from '@/components/mascot/MascotNudge';
import { useColors, useTabBarSpace } from '@/theme';

/** Home (lively design): one warm paper screen, search first, then the two main jobs. */
export default function HomeScreen() {
  useFocusEffect(
    useCallback(() => {
      useCoachRegistry.getState().setHomeFocused(true);
      return () => useCoachRegistry.getState().setHomeFocused(false);
    }, []),
  );
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const nearby = useNearbyHome();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Paper />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        keyboardShouldPersistTaps="handled"
      >
        <HomeHeader />
        <SearchCard />
        <QuickActions nearby={nearby} />
        <ExampleQuestions />
        <ActiveStrip />
        <SuggestionNote nearby={nearby} />
        <Cravings />
        <NearbyCard nearby={nearby} />
        <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 4 }}>
          <HandNote size={19} color={c.textSecondary} tilt={-1.5}>
            {t('home.footerNote')}
          </HandNote>
        </View>
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
