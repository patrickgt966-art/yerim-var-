import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { CoachOverlay } from '@/components/coach/CoachOverlay';
import { TabBar } from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="harita" />
        <Tabs.Screen name="favoriler" />
        <Tabs.Screen name="profil" />
      </Tabs>
      {/* After the tabs, so the one-time coach marks sit above the tab bar. */}
      <CoachOverlay />
    </View>
  );
}
