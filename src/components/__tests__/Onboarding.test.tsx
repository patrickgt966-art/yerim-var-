import '@/i18n';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Onboarding from '@/app/onboarding';
import { cityById, setActiveCity } from '@/data/cities';
import { currentLocation } from '@/lib/location';
import { useApp } from '@/store/app';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/lib/location', () => ({ currentLocation: jest.fn() }));
const mockRequestPermission = jest.fn(async () => ({ granted: true }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
}));

// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const chain: Record<string, unknown> = {};
  chain.delay = () => chain;
  chain.duration = () => chain;
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 0, inOut: () => 0, ease: 0, linear: 0 },
    FadeInDown: chain,
    useReducedMotion: () => true,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Onboarding />
    </SafeAreaProvider>,
  );

const next = async () => fireEvent.press(screen.getByText('Devam'));
const tap = async (label: RegExp | string) => fireEvent.press(screen.getByLabelText(label));

beforeEach(() => {
  jest.clearAllMocks();
  (currentLocation as jest.Mock).mockResolvedValue(null);
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir', onboarded: false });
});

describe('onboarding', () => {
  it('starts with the hero, tagline and the city list, with two step dots', async () => {
    await mount();
    expect(
      screen.getByText('Ne yemek istediğini söyle; restoranı da park yerini de biz bulalım.'),
    ).toBeTruthy();
    expect(screen.getByText('Hangi şehirdesin?')).toBeTruthy();
    expect(screen.getByLabelText('Adım 1, toplam 2 adım')).toBeTruthy();
  });

  it('lists every city as active, none as "Yakında"', async () => {
    await mount();
    expect(screen.getByText('Hangi şehirdesin?')).toBeTruthy();
    expect(screen.getByText('Canlı otopark: İzmir Büyükşehir')).toBeTruthy();
    expect(screen.getByText('Canlı otopark: İSPARK')).toBeTruthy();
    // Ankara, Bursa and Antalya share the static-only line.
    expect(
      screen.getAllByText('Canlı otopark verisi yok; otoparklar kapasite bilgisiyle'),
    ).toHaveLength(3);
    // All five cities are open, so no card carries the "Yakında" badge.
    expect(screen.queryAllByText('Yakında')).toHaveLength(0);
    // The store city is preselected and Devam is available right away.
    expect(screen.getByLabelText(/^İzmir, seçili/)).toBeTruthy();
    expect(screen.getByText('Devam')).toBeTruthy();
  });

  it('sets the store city when İstanbul is picked', async () => {
    await mount();
    await tap(/^İstanbul, /);
    expect(useApp.getState().city).toBe('istanbul');
    expect(screen.getByLabelText(/^İstanbul, seçili/)).toBeTruthy();
  });

  it('sets the store city when Ankara is picked and says it has no live car park data', async () => {
    await mount();
    await tap(/^Ankara, /);
    expect(useApp.getState().city).toBe('ankara');
    expect(screen.getByLabelText(/^Ankara, seçili, Canlı otopark verisi yok/)).toBeTruthy();
  });

  it('sets the store city when Bursa is picked and says it has no live car park data', async () => {
    await mount();
    await tap(/^Bursa, /);
    expect(useApp.getState().city).toBe('bursa');
    expect(screen.getByLabelText(/^Bursa, seçili, Canlı otopark verisi yok/)).toBeTruthy();
  });

  it('sets the store city when Antalya is picked and says it has no live car park data', async () => {
    await mount();
    await tap(/^Antalya, /);
    expect(useApp.getState().city).toBe('antalya');
    expect(screen.getByLabelText(/^Antalya, seçili, Canlı otopark verisi yok/)).toBeTruthy();
  });

  it('shows a city that is not open yet with a "Yakında" badge and does not select it', async () => {
    // All five cities are open today; close one for this test to keep the badge path covered.
    const antalya = cityById('antalya');
    antalya.available = false;
    try {
      await mount();
      expect(screen.getAllByText('Yakında')).toHaveLength(1);
      await tap('Antalya, yakında');
      expect(useApp.getState().city).toBe('izmir');
    } finally {
      antalya.available = true;
    }
  });

  it('preselects the city of the device when location is already granted', async () => {
    (currentLocation as jest.Mock).mockResolvedValue({ lat: 41.0136, lng: 28.9503 });
    await mount();
    await waitFor(() => expect(useApp.getState().city).toBe('istanbul'));
    expect(currentLocation).toHaveBeenCalledWith(false, expect.any(Number));
  });

  it('never overrides a city the user picked with the location', async () => {
    let resolve: (p: { lat: number; lng: number }) => void = () => {};
    (currentLocation as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)));
    await mount();
    await tap(/^İzmir, /);
    await act(async () => resolve({ lat: 41.0136, lng: 28.9503 }));
    expect(useApp.getState().city).toBe('izmir');
  });

  it('has no AI step: "Devam" goes straight to the location step', async () => {
    await mount();
    await next();
    expect(screen.queryByText('Yerim ile konuş')).toBeNull();
    expect(screen.getByLabelText('Adım 2, toplam 2 adım')).toBeTruthy();
    expect(screen.getByText('Yakınındakileri göster')).toBeTruthy();
    expect(screen.getByText('Yakınındaki yerleri ve otoparkları sıralar.')).toBeTruthy();
    expect(screen.getByText('Konumun sunucumuza hiç gönderilmez.')).toBeTruthy();
    expect(screen.getByText('İzin vermesen de her şeyi arayabilirsin.')).toBeTruthy();
    expect(screen.getByText(/yuvarlanmış konumun \(yaklaşık 100 m\) Apple Haritalar/)).toBeTruthy();
  });

  it('ends on the location step: "Şimdilik geç" only finishes', async () => {
    await mount();
    await next();
    (currentLocation as jest.Mock).mockClear();
    mockRequestPermission.mockClear();

    await tap('Şimdilik geç');
    expect(currentLocation).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(useApp.getState().onboarded).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('asks for the location, then finishes without waiting for a fix', async () => {
    await mount();
    await next();
    (currentLocation as jest.Mock).mockClear();
    mockRequestPermission.mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByText('Konuma izin ver'));
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    // A GPS fix may never come indoors: the step does not wait for one.
    expect(currentLocation).not.toHaveBeenCalled();
    expect(useApp.getState().onboarded).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
