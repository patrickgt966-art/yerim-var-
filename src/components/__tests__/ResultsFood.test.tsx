import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import Results from '@/app/sonuc';
import { setActiveCity } from '@/data/cities';
import { FOOD_CATEGORIES, matchesCategory, restaurantsNear } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import tr from '@/i18n/tr';
import { useApp } from '@/store/app';

const KORDON = { lat: '38.4344', lng: '27.1427', label: 'Kordon' };
const TARGET = { lat: 38.4344, lng: 27.1427 };

let mockParams: Record<string, string> = {};
let mockParkings: Parking[] = [];
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
jest.mock('@/data/useParkings', () => {
  const actual = jest.requireActual('@/data/useParkings');
  return {
    ...actual,
    useRanked: (target: { lat: number; lng: number } | null) => ({
      ranked: target ? actual.rankByDistance(mockParkings, target) : [],
      data: { parkings: mockParkings, source: 'izmir-open-data' },
      isLoading: false,
      isPlaceholderData: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
      widenedKm: null,
    }),
  };
});
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

/** A covered car park right at the i-th nearest restaurant. */
function parkingAt(i: number): Parking {
  const r = restaurantsNear(TARGET, 1000, 600)[i]!;
  return {
    id: `p${i}`,
    name: `Otopark ${i}`,
    lat: r.lat,
    lng: r.lng,
    capacity: 50,
    free: null,
    isIndoor: true,
    isOpen: null,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    address: null,
    source: 'osm',
    updatedAt: null,
    fetchedAt: new Date().toISOString(),
    occupancyKind: 'estimated',
  };
}

const PARKING_LINE = /Yakında \d+ otopark/;
const SUB_FILTERS = ['Üstü kapalı', 'Ücretsiz', 'Raylı sisteme yakın', '7/24 açık'];

beforeEach(() => {
  jest.clearAllMocks();
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir' });
  mockParams = { ...KORDON };
  mockParkings = [parkingAt(0), parkingAt(1), parkingAt(2)];
});

describe('sonuc car park results', () => {
  it('keeps the car park filters and shows no food chips', async () => {
    await render(<Results />);
    expect(screen.getByText('Tümü')).toBeTruthy();
    expect(screen.getByText('Yakındaki restoranlar')).toBeTruthy();
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
    expect(screen.queryByText('Otoparklı')).toBeNull();
    expect(screen.getAllByText('Otopark 0').length).toBeGreaterThan(0);
  });
});

describe('sonuc food results', () => {
  it('lists food kinds and "Otoparklı" first, with no car park filters or lines', async () => {
    await render(<Results />);
    await fireEvent.press(screen.getByText('Yakındaki restoranlar'));
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const present = FOOD_CATEGORIES.filter((cat) => nearby.some((r) => matchesCategory(r, cat)));
    expect(present.length).toBeGreaterThan(0);
    for (const cat of present) expect(screen.getByLabelText(tr.food.cats[cat])).toBeTruthy();
    expect(screen.getByText('Otoparklı')).toBeTruthy();
    for (const label of SUB_FILTERS) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
    expect(screen.queryByText(/Yakında otopark bilgisi yok/)).toBeNull();
  });

  it('shows the sub-filters and parking lines with "Otoparklı", and clears them when off', async () => {
    await render(<Results />);
    await fireEvent.press(screen.getByText('Yakındaki restoranlar'));
    await fireEvent.press(screen.getByText('Otoparklı'));
    for (const label of SUB_FILTERS) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByText('Üstü kapalı'));
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('Ücretsiz'));
    expect(screen.queryByText(PARKING_LINE)).toBeNull(); // the car parks are paid

    await fireEvent.press(screen.getByText('Otoparklı'));
    for (const label of SUB_FILTERS) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
    // The sub-filters were reset: turning it on again lists the covered, paid car parks.
    await fireEvent.press(screen.getByText('Otoparklı'));
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);
  });

  it('filters the list with a kind chip', async () => {
    await render(<Results />);
    await fireEvent.press(screen.getByText('Yakındaki restoranlar'));
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const rowLabels = () =>
      screen
        .getAllByRole('button', { name: /dakika yürüme/ })
        .map((b) => b.props.accessibilityLabel as string);
    const before = rowLabels();
    const cat = FOOD_CATEGORIES.find(
      (c) =>
        nearby.some((r) => matchesCategory(r, c)) &&
        before.some((l) =>
          nearby.some((r) => l.startsWith(`${r.name}.`) && !matchesCategory(r, c)),
        ),
    )!;
    expect(cat).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(tr.food.cats[cat]));
    const after = rowLabels();
    expect(after.length).toBeGreaterThan(0);
    for (const l of after) {
      const r = nearby.find((x) => l.startsWith(`${x.name}.`))!;
      expect(matchesCategory(r, cat)).toBe(true);
    }
    expect(after).not.toEqual(before);
  });

  it('goes back to the car park results from the scope chip', async () => {
    await render(<Results />);
    await fireEvent.press(screen.getByText('Yakındaki restoranlar'));
    await fireEvent.press(screen.getByText('Yakındaki restoranlar'));
    expect(screen.getByText('Tümü')).toBeTruthy();
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
    expect(screen.queryByText('Otoparklı')).toBeNull();
  });
});
