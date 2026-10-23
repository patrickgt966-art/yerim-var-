import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import Restaurants from '@/app/restoranlar';
import { setActiveCity } from '@/data/cities';
import { currentLocation } from '@/lib/location';
import { useApp } from '@/store/app';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
jest.mock('@/lib/location', () => ({ currentLocation: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/a11y', () => ({
  ...jest.requireActual('@/lib/a11y'),
  useScreenReader: () => false,
}));
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({ data: { parkings: [], source: 'izmir-open-data' } }),
  rankByDistance: () => [],
}));
// The real map and sheet need native code.
jest.mock('@/components/ParkingMap', () => ({ ParkingMap: () => null }));
jest.mock('@gorhom/bottom-sheet', () => {
  const { View, FlatList } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: unknown }) => <View>{children as never}</View>,
    BottomSheetFlatList: FlatList,
  };
});

const KORDON = { lat: '38.4344', lng: '27.1427', label: 'Kordon' };
const NO_LOCATION = 'Konumun kapalı; Kordon çevresi gösteriliyor.';

beforeEach(() => {
  jest.clearAllMocks();
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir' });
  mockParams = { ...KORDON };
});

describe('restoranlar default sort', () => {
  it('lists nearest first, with no parking wording, unless parking is asked for', async () => {
    await render(<Restaurants />);
    expect(screen.getByText(/en yakın üstte/)).toBeTruthy();
    expect(screen.queryByText(/parkı en kolay olan üstte/)).toBeNull();
    expect(screen.queryByText('Parkı en kolay')).toBeNull();
  });

  it('uses the park sort when the parking filter is on', async () => {
    mockParams = { ...KORDON, park: '1' };
    await render(<Restaurants />);
    expect(screen.getByText(/parkı en kolay olan üstte/)).toBeTruthy();
  });

  it('uses the park sort when the free-parking filter is on', async () => {
    mockParams = { ...KORDON, free: '1' };
    await render(<Restaurants />);
    expect(screen.getByText(/parkı en kolay olan üstte/)).toBeTruthy();
  });

  it('offers the park sort only while "Otoparklı" is on', async () => {
    await render(<Restaurants />);
    expect(screen.queryByText('Parkı kolay')).toBeNull();
    await fireEvent.press(screen.getByText('Otoparklı'));
    expect(screen.getByText('Parkı kolay')).toBeTruthy();
    await fireEvent.press(screen.getByText('En yakın'));
    expect(screen.getByText(/en yakın üstte/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Parkı kolay'));
    expect(screen.getByText(/parkı en kolay olan üstte/)).toBeTruthy();
    // Turning it off drops the park sort with it.
    await fireEvent.press(screen.getByText('Otoparklı'));
    expect(screen.queryByText('Parkı kolay')).toBeNull();
    expect(screen.getByText(/en yakın üstte/)).toBeTruthy();
  });
});

describe('restoranlar approx notice', () => {
  it('shows nothing extra without approx', async () => {
    await render(<Restaurants />);
    expect(screen.queryByLabelText(NO_LOCATION)).toBeNull();
    expect(screen.queryByText('Konumu aç')).toBeNull();
  });

  it('says location is off and offers to turn it on', async () => {
    mockParams = { ...KORDON, approx: 'noLocation' };
    await render(<Restaurants />);
    expect(screen.getByLabelText(NO_LOCATION)).toBeTruthy();
    expect(screen.getByLabelText('Konumu aç')).toBeTruthy();
  });

  it('says the user is outside the city, without a button', async () => {
    mockParams = { ...KORDON, approx: 'outside' };
    await render(<Restaurants />);
    expect(screen.getByLabelText('Şehir dışındasın; Kordon çevresi gösteriliyor.')).toBeTruthy();
    expect(screen.queryByText('Konumu aç')).toBeNull();
  });

  it('ignores an unknown approx value', async () => {
    mockParams = { ...KORDON, approx: 'x' };
    await render(<Restaurants />);
    expect(screen.queryByText('Konumu aç')).toBeNull();
  });

  describe('"Konumu aç"', () => {
    beforeEach(() => {
      mockParams = { ...KORDON, approx: 'noLocation' };
      jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    });

    it('asks, then re-centres the list on the user', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        canAskAgain: true,
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (currentLocation as jest.Mock).mockResolvedValue({ lat: 38.4237, lng: 27.1428 });
      await render(<Restaurants />);
      await fireEvent.press(screen.getByLabelText('Konumu aç'));
      await waitFor(() =>
        expect(router.setParams).toHaveBeenCalledWith({
          lat: '38.4237',
          lng: '27.1428',
          label: 'Konumun',
          approx: '',
        }),
      );
      expect(Linking.openSettings).not.toHaveBeenCalled();
    });

    it('opens Settings when the permission cannot be asked again', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        canAskAgain: false,
      });
      await render(<Restaurants />);
      await fireEvent.press(screen.getByLabelText('Konumu aç'));
      await waitFor(() => expect(Linking.openSettings).toHaveBeenCalled());
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(router.setParams).not.toHaveBeenCalled();
    });

    it('switches the notice to "outside" when the fix is outside the city', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
      (currentLocation as jest.Mock).mockResolvedValue({ lat: 41.0136, lng: 28.9503 });
      await render(<Restaurants />);
      await fireEvent.press(screen.getByLabelText('Konumu aç'));
      await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ approx: 'outside' }));
    });

    it('does nothing more when the user denies the fresh prompt', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        canAskAgain: true,
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });
      await render(<Restaurants />);
      await fireEvent.press(screen.getByLabelText('Konumu aç'));
      await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled());
      expect(router.setParams).not.toHaveBeenCalled();
      expect(Linking.openSettings).not.toHaveBeenCalled();
    });
  });
});
