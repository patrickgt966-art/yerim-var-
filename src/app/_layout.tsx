import '@/i18n';

import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { warmUpParkings } from '@/data/useParkings';
import { cancelParkReminder, setUpReminders } from '@/lib/reminders';
import { useApp } from '@/store/app';
import { useHydrated } from '@/store/useHydrated';
import { useColors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Before the store hydrates it still says İzmir, so warm the car parks of the hydrated city.
const warmHydratedCity = () => void warmUpParkings(queryClient, useApp.getState().city);
if (useApp.persist.hasHydrated()) warmHydratedCity();
else useApp.persist.onFinishHydration(warmHydratedCity);

// A park reminder belongs to its park: ending the park, starting another or clearing the reminder
// cancels the scheduled notification, whichever screen did it.
setUpReminders();
useApp.subscribe((s, prev) => {
  const old = prev.active?.reminder?.id;
  if (old && old !== s.active?.reminder?.id) void cancelParkReminder(old);
});

// Pause polling while the app is in the background.
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export default function RootLayout() {
  const c = useColors();
  const hydrated = useHydrated();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
