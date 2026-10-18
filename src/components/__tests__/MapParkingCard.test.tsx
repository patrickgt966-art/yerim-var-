import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import MapTab from '@/app/(tabs)/harita';
import type { RankedParking } from '@/data/useParkings';
import { parkedHere } from '@/lib/parkHere';
import { useApp } from '@/store/app';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/location', () => ({ currentLocation: async () => null }));
jest.mock('@/lib/a11y', () => ({
  ...jest.requireActual('@/lib/a11y'),
  useAnnounce: jest.fn(),
  useScreenReader: () => false,
}));
jest.mock('@/lib/parkHere', () => ({ parkedHere: jest.fn() }));

const mockPark: RankedParking = {
  id: 'izmir-1',
  name: 'Alsancak Katlı',
  lat: 38.437,
  lng: 27.142,
  capacity: 200,
  free: 24,
  isIndoor: true,
  isOpen: null,
  isPaid: null,
  nonstop: null,
  openingHours: null,
  address: null,
  source: 'izmir-open-data',
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  occupancyKind: 'live',
  distance: 240,
  walk: 3,
  nearPier: false,
  nearRail: false,
};
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({ data: { parkings: [mockPark], source: 'izmir-open-data' } }),
  rankByDistance: () => [mockPark],
}));
// The real map needs native code; a button stands in for tapping the P pin.
jest.mock('@/components/ParkingMap', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    ParkingMap: ({
      parkings,
      onSelect,
    }: {
      parkings: RankedParking[];
      onSelect: (p: unknown) => void;
    }) => (
      <Pressable testID="pin" onPress={() => onSelect(parkings[0])}>
        <Text>pin</Text>
      </Pressable>
    ),
  };
});

beforeEach(() => {
  useApp.getState().setCity('izmir');
  // A saved choice, so directions open without the chooser.
  useApp.setState({ mapApp: 'apple' });
  mockPush.mockClear();
  jest.mocked(parkedHere).mockClear();
});

it('opens a card for the tapped car park with the free count, directions and "Buraya park ettim"', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<MapTab />);
  await fireEvent.press(await screen.findByTestId('pin'));

  expect(screen.getByText('Alsancak Katlı')).toBeTruthy();
  expect(screen.getByText('24')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Alsancak Katlı için yol tarifi'));
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/maps\.apple\.com\/\?daddr=38\.437,27\.142&dirflg=d/),
    ),
  );

  await fireEvent.press(screen.getByLabelText('Alsancak Katlı: buraya park ettim'));
  expect(parkedHere).toHaveBeenCalledWith(mockPark);

  // The card itself still leads to the detail page.
  await fireEvent.press(screen.getByHintText('Otoparkın detayını açar'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/otopark/[id]', params: { id: 'izmir-1' } });

  await fireEvent.press(screen.getByLabelText('Otopark kartını kapat'));
  expect(screen.queryByText('Alsancak Katlı')).toBeNull();
  open.mockRestore();
});
