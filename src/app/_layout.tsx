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
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LaunchIntro } from '@/components/mascot/LaunchIntro';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { warmUpParkings } from '@/data/useParkings';
import { installErrorReporting, setCrashRoute } from '@/lib/crashReport';
import { watchParkActivity } from '@/lib/parkActivity';
import { refreshHiddenPlaces } from '@/lib/placeReports';
import { listenParkNotifications } from '@/lib/parkNotifications';
import { cancelParkReminder, registerParkCategory, setUpReminders } from '@/lib/reminders';
import { syncCostStep } from '@/lib/costStep';
import { useApp } from '@/store/app';
import { useReports } from '@/store/reports';
import { useHydrated } from '@/store/useHydrated';
import { useColors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// JS errors go to our own worker (production builds only; see lib/crashReport).
installErrorReporting();

// expo-router shows this when the layout or a screen without its own boundary throws.
export { RootErrorBoundary as ErrorBoundary };

const queryClient = new QueryClient();

// The places reported closed by enough people, for the selected city (at most every few hours).
const refreshHidden = () => {
  const go = () => void refreshHiddenPlaces(useApp.getState().city);
  if (useReports.persist.hasHydrated()) go();
  else useReports.persist.onFinishHydration(go);
};

// Before the store hydrates it still says İzmir, so warm the car parks of the hydrated city.
const warmHydratedCity = () => {
  void warmUpParkings(queryClient, useApp.getState().city);
  refreshHidden();
  void syncCostStep(useApp.getState().active);
};
if (useApp.persist.hasHydrated()) warmHydratedCity();
else useApp.persist.onFinishHydration(warmHydratedCity);

// A park reminder belongs to its park: ending the park, starting another or clearing the reminder
// cancels the scheduled notification, whichever screen did it.
setUpReminders();
listenParkNotifications();
useApp.subscribe((s, prev) => {
  const old = prev.active?.reminder;
  if (old && old.id !== s.active?.reminder?.id) void cancelParkReminder(old);
  // A new or ended park moves the "price goes up soon" notification with it.
  if (
    s.active?.startedAt !== prev.active?.startedAt ||
    s.active?.parkingId !== prev.active?.parkingId
  )
    void syncCostStep(s.active);
  // The notification buttons are text, so they follow the language.
  if (s.lang !== prev.lang) void registerParkCategory();
  if (s.city !== prev.city) refreshHidden();
});

// The running park on the lock screen and in the Dynamic Island (iOS Live Activity). A no-op in
// Expo Go and wherever the native module is missing.
watchParkActivity();

// Pause polling while the app is in the background.
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
  if (status === 'active') {
    refreshHidden();
    // The last warning may have fired while away: line up the next price step.
    void syncCostStep(useApp.getState().active);
  }
}

export default function RootLayout() {
  const c = useColors();
  const hydrated = useHydrated();
  const pathname = usePathname();
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

  useEffect(() => setCrashRoute(pathname), [pathname]);

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
        <LaunchIntro />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
