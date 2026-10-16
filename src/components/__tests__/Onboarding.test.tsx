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

const press = async (label: string) => fireEvent.press(screen.getByLabelText(label));
const next = async () => fireEvent.press(screen.getByText('Devam'));
const tap = async (label: RegExp | string) => fireEvent.press(screen.getByLabelText(label));

beforeEach(() => {
  jest.clearAllMocks();
  (currentLocation as jest.Mock).mockResolvedValue(null);
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir', onboarded: false });
});

describe('onboarding', () => {
  it('starts with the hero and tagline, with four step dots', async () => {
    await mount();
    expect(
      screen.getByText('Ne yemek istediğini söyle; restoranı da park yerini de biz bulalım.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Adım 1, toplam 4 adım')).toBeTruthy();
  });

  it('lists every city as active, none as "Yakında"', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    expect(screen.getByText('Hangi şehirdesin?')).toBeTruthy();
    expect(screen.getByText('Canlı otopark: İzmir Büyükşehir')).toBeTruthy();
    expect(screen.getByText('Canlı otopark: İSPARK, 243 otopark')).toBeTruthy();
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
    await press('Başla, uygulamaya geç');
    await tap(/^İstanbul, /);
    expect(useApp.getState().city).toBe('istanbul');
    expect(screen.getByLabelText(/^İstanbul, seçili/)).toBeTruthy();
  });

  it('sets the store city when Ankara is picked and says it has no live car park data', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await tap(/^Ankara, /);
    expect(useApp.getState().city).toBe('ankara');
    expect(screen.getByLabelText(/^Ankara, seçili, Canlı otopark verisi yok/)).toBeTruthy();
  });

  it('sets the store city when Bursa is picked and says it has no live car park data', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await tap(/^Bursa, /);
    expect(useApp.getState().city).toBe('bursa');
    expect(screen.getByLabelText(/^Bursa, seçili, Canlı otopark verisi yok/)).toBeTruthy();
  });

  it('sets the store city when Antalya is picked and says it has no live car park data', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
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
      await press('Başla, uygulamaya geç');
      expect(screen.getAllByText('Yakında')).toHaveLength(1);
      await tap('Antalya, yakında');
      expect(useApp.getState().city).toBe('izmir');
    } finally {
      antalya.available = true;
    }
  });

  it("shows the selected city's example in the chat step", async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await tap(/^İstanbul, /);
    await next();
    expect(screen.getByText('Yerim ile konuş')).toBeTruthy();
    expect(screen.getByText("Kadıköy'de akşam balık, yanında otopark olsun")).toBeTruthy();
    expect(screen.getByText('✨ Sana 3 yer buldum, hepsinin yanında otopark var.')).toBeTruthy();
    expect(
      screen.getByText(
        'Restoran ve otopark bilgileri açık veriden gelir; yapay zeka bilgi uydurmaz.',
      ),
    ).toBeTruthy();
  });

  it('uses the İzmir example when İzmir is selected', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await next();
    expect(screen.getByText("Alsancak'ta akşam balık, yanında otopark olsun")).toBeTruthy();
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
    await press('Başla, uygulamaya geç');
    await tap(/^İzmir, /);
    await act(async () => resolve({ lat: 41.0136, lng: 28.9503 }));
    expect(useApp.getState().city).toBe('izmir');
  });

  it('ends on the location step: allow asks, "Başla" only finishes', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await next();
    await next();
    expect(screen.getByLabelText('Adım 4, toplam 4 adım')).toBeTruthy();
    expect(screen.getByText('Yakınındakileri göster')).toBeTruthy();
    (currentLocation as jest.Mock).mockClear();

    await tap('Başla, uygulamaya geç');
    expect(currentLocation).not.toHaveBeenCalled();
    expect(useApp.getState().onboarded).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('asks for the location, then finishes', async () => {
    await mount();
    await press('Başla, uygulamaya geç');
    await next();
    await next();
    (currentLocation as jest.Mock).mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByText('Konuma izin ver'));
    });
    expect(currentLocation).toHaveBeenCalledWith(true);
    expect(useApp.getState().onboarded).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
