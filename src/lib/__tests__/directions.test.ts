import { Alert, Linking } from 'react-native';

import { MAP_APPS } from '@/data/mapApps';
import { useApp } from '@/store/app';

import { directionsUrls, installedMapApps, openDirections } from '../directions';

// Hoisted above the imports by babel-jest. `mock`-prefixed names are allowed in the factory.
const mockEnv = { value: 'bare' };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockEnv.value;
    },
  },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

const dest = { lat: 38.4, lng: 27.1 };
const alertButtons = () => jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];

/** Pretends only these schemes (e.g. 'waze://') are installed. */
function installed(...schemes: string[]) {
  jest
    .spyOn(Linking, 'canOpenURL')
    .mockImplementation(async (url) => schemes.some((s) => url.startsWith(s)));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.value = 'bare';
  useApp.setState({ mapApp: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  installed();
});
afterEach(() => jest.restoreAllMocks());

describe('directionsUrls', () => {
  it('apple: universal link, walking flag for walk', () => {
    expect(directionsUrls('apple', dest, 'A B', 'drive')).toEqual([
      'https://maps.apple.com/?daddr=38.4,27.1&dirflg=d&q=A%20B',
    ]);
    expect(directionsUrls('apple', dest, 'A B', 'walk')).toEqual([
      'https://maps.apple.com/?daddr=38.4,27.1&dirflg=w&q=A%20B',
    ]);
  });

  it('google: app scheme, then the web link', () => {
    expect(directionsUrls('google', dest, 'x', 'drive')).toEqual([
      'comgooglemaps://?daddr=38.4,27.1&directionsmode=driving',
      'https://www.google.com/maps/dir/?api=1&destination=38.4,27.1&travelmode=driving',
    ]);
    expect(directionsUrls('google', dest, 'x', 'walk')).toEqual([
      'comgooglemaps://?daddr=38.4,27.1&directionsmode=walking',
      'https://www.google.com/maps/dir/?api=1&destination=38.4,27.1&travelmode=walking',
    ]);
  });

  it('yandex: navi for driving, maps for walking', () => {
    expect(directionsUrls('yandex', dest, 'x', 'drive')).toEqual([
      'yandexnavi://build_route_on_map?lat_to=38.4&lon_to=27.1',
      'https://yandex.com.tr/maps/?rtext=~38.4,27.1&rtt=auto',
    ]);
    expect(directionsUrls('yandex', dest, 'x', 'walk')).toEqual([
      'yandexmaps://maps.yandex.com/?rtext=~38.4,27.1&rtt=pd',
      'https://yandex.com.tr/maps/?rtext=~38.4,27.1&rtt=pd',
    ]);
  });

  it('waze: drive only, walking falls back to apple', () => {
    expect(directionsUrls('waze', dest, 'x', 'drive')).toEqual([
      'waze://?ll=38.4,27.1&navigate=yes',
      'https://waze.com/ul?ll=38.4,27.1&navigate=yes',
    ]);
    expect(directionsUrls('waze', dest, 'x', 'walk')).toEqual(
      directionsUrls('apple', dest, 'x', 'walk'),
    );
  });
});

describe('installedMapApps', () => {
  it('always has apple, plus the apps whose scheme opens', async () => {
    installed('waze://', 'yandexmaps://');
    expect(await installedMapApps()).toEqual(['apple', 'yandex', 'waze']);
  });

  it('treats a canOpenURL error as not installed', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValue(new Error('no'));
    expect(await installedMapApps()).toEqual(['apple']);
  });

  it('offers all four in Expo Go', async () => {
    mockEnv.value = 'storeClient';
    expect(await installedMapApps()).toEqual([...MAP_APPS]);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
  });
});

describe('openDirections', () => {
  it('opens the saved app without asking', async () => {
    useApp.setState({ mapApp: 'waze' });
    expect(await openDirections(dest, 'x')).toBe('opened');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith('waze://?ll=38.4,27.1&navigate=yes');
  });

  it('uses apple without asking or saving when it is the only app', async () => {
    expect(await openDirections(dest, 'x')).toBe('opened');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(directionsUrls('apple', dest, 'x', 'drive')[0]);
    expect(useApp.getState().mapApp).toBeNull();
  });

  it('asks when several apps exist, then saves and uses the choice', async () => {
    installed('comgooglemaps://');
    const pending = openDirections(dest, 'x');
    await new Promise((r) => setImmediate(r));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = alertButtons();
    expect(buttons.map((b) => b.text)).toEqual(['Apple Haritalar', 'Google Haritalar', 'Vazgeç']);
    buttons[1]?.onPress?.();
    expect(await pending).toBe('opened');
    expect(useApp.getState().mapApp).toBe('google');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'comgooglemaps://?daddr=38.4,27.1&directionsmode=driving',
    );
  });

  it('leaves waze out of the choice when walking', async () => {
    installed('waze://', 'comgooglemaps://');
    const pending = openDirections(dest, 'x', 'walk');
    await new Promise((r) => setImmediate(r));
    const buttons = alertButtons();
    expect(buttons.map((b) => b.text)).toEqual(['Apple Haritalar', 'Google Haritalar', 'Vazgeç']);
    buttons[0]?.onPress?.();
    expect(await pending).toBe('opened');
  });

  it('cancel opens nothing and saves nothing', async () => {
    installed('waze://');
    const pending = openDirections(dest, 'x');
    await new Promise((r) => setImmediate(r));
    const buttons = alertButtons();
    buttons[buttons.length - 1]?.onPress?.();
    expect(await pending).toBe('cancelled');
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(useApp.getState().mapApp).toBeNull();
  });

  it('falls back to the web link when the app scheme fails', async () => {
    useApp.setState({ mapApp: 'google' });
    jest.spyOn(Linking, 'openURL').mockImplementation(async (url) => {
      if (url.startsWith('comgooglemaps://')) throw new Error('no app');
      return true;
    });
    expect(await openDirections(dest, 'x')).toBe('opened');
    expect(Linking.openURL).toHaveBeenLastCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=38.4,27.1&travelmode=driving',
    );
  });

  it('falls back to apple when every URL of the app fails, and fails when apple fails too', async () => {
    useApp.setState({ mapApp: 'waze' });
    jest.spyOn(Linking, 'openURL').mockImplementation(async (url) => {
      if (url.includes('apple.com')) return true;
      throw new Error('no');
    });
    expect(await openDirections(dest, 'x')).toBe('opened');
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no'));
    expect(await openDirections(dest, 'x')).toBe('failed');
  });
});
