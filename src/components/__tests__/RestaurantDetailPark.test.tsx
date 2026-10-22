import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import RestaurantDetail from '@/app/restoran/[id]';

let mockParams: Record<string, string> = {};
const mockMapParkings = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/a11y', () => ({ useScreenReader: () => false }));
jest.mock('@/lib/useSharedPlaceCity', () => ({ useSharedPlaceCity: jest.fn() }));
jest.mock('@/components/ReportPlace', () => ({ ReportPlace: () => null }));
jest.mock('@/components/ParkingCard', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    ParkingCard: ({ parking }: { parking: { name: string } }) => <Text>{parking.name}</Text>,
  };
});
jest.mock('@/components/ParkingMap', () => {
  const { forwardRef } = jest.requireActual('react');
  return {
    ParkingMap: forwardRef((props: { parkings: unknown[] }) => {
      mockMapParkings(props.parkings.length);
      return null;
    }),
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { View, ScrollView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: unknown }) => <View>{children as never}</View>,
    BottomSheetScrollView: ScrollView,
  };
});
jest.mock('@/data/useParkings', () => ({
  useRanked: () => ({
    ranked: [{ id: 'p1', name: 'Merkez Otopark', lat: 38.4, lng: 27.1 }],
    isLoading: false,
    isPlaceholderData: false,
    isFetching: false,
  }),
}));
jest.mock('@/data/restaurants', () => {
  const actual = jest.requireActual('@/data/restaurants');
  return {
    ...actual,
    getRestaurant: () =>
      actual.toRestaurant({ id: 'osm-d1', n: 'Alfa Lokanta', a: 38.4, o: 27.1, k: 'restaurant' }),
  };
});

const SHOW = 'Arabayla mı geleceksin? Yakındaki otoparklar';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'osm-d1' };
});

describe('restaurant detail parking section', () => {
  it('is collapsed by default and expands on demand', async () => {
    await render(<RestaurantDetail />);
    expect(screen.queryByText('Nereye park edersin?')).toBeNull();
    expect(screen.queryByText('Merkez Otopark')).toBeNull();
    expect(mockMapParkings).toHaveBeenLastCalledWith(0);
    await fireEvent.press(screen.getByText(SHOW));
    expect(screen.getByText('Nereye park edersin?')).toBeTruthy();
    expect(screen.getByText('Merkez Otopark')).toBeTruthy();
    expect(screen.queryByText(SHOW)).toBeNull();
    expect(mockMapParkings).toHaveBeenLastCalledWith(1);
  });

  it('opens expanded with park=1', async () => {
    mockParams = { id: 'osm-d1', park: '1' };
    await render(<RestaurantDetail />);
    expect(screen.getByText('Nereye park edersin?')).toBeTruthy();
    expect(screen.queryByText(SHOW)).toBeNull();
  });
});
