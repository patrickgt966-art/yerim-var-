import '@/i18n';

import { act, render, screen } from '@testing-library/react-native';

import MapTab from '@/app/(tabs)/harita';
import { cityById } from '@/data/cities';
import { useApp } from '@/store/app';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/location', () => ({ currentLocation: async () => null }));
jest.mock('@/lib/a11y', () => ({ useAnnounce: jest.fn(), useScreenReader: () => false }));
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({ data: { parkings: [], source: 'static-only' } }),
  rankByDistance: () => [],
}));
jest.mock('@/components/ParkingMap', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    ParkingMap: ({ center }: { center: { lat: number; lng: number } }) => (
      <Text testID="map-center">{JSON.stringify(center)}</Text>
    ),
  };
});

afterEach(() => useApp.getState().setCity('izmir'));

it('drops the previous city route coordinates on a city switch and accepts a later map visit', async () => {
  useApp.getState().setCity('izmir');
  mockParams = { lat: '38.43', lng: '27.14', ts: '1' };
  const { rerender } = await render(<MapTab />);
  const center = () => JSON.parse(screen.getByTestId('map-center').props.children as string);
  expect(center()).toEqual({ lat: 38.43, lng: 27.14 });
  await act(async () => useApp.getState().setCity('istanbul'));
  expect(center()).toEqual(cityById('istanbul').center);
  // Returning to İzmir must not resurrect that stale visit either.
  await act(async () => useApp.getState().setCity('izmir'));
  expect(center()).toEqual(cityById('izmir').center);
  mockParams = { lat: '38.45', lng: '27.15', ts: '2' };
  await rerender(<MapTab />);
  expect(center()).toEqual({ lat: 38.45, lng: 27.15 });
});
