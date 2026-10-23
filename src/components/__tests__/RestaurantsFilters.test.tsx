import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Restaurants from '@/app/restoranlar';
import { setActiveCity } from '@/data/cities';
import tr from '@/i18n/tr';
import { FOOD_CATEGORIES, matchesCategory, restaurantsNear } from '@/data/restaurants';
import type { Parking } from '@/data/types';
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
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({ data: { parkings: mockParkings, source: 'izmir-open-data' } }),
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

/** A car park right at the nearest restaurants, so the parking filter keeps them. */
function parkingAt(i: number, over: Partial<Parking> = {}): Parking {
  const r = restaurantsNear(TARGET, 1000, 600)[i]!;
  return {
    id: `p${i}`,
    name: `Otopark ${i}`,
    lat: r.lat,
    lng: r.lng,
    capacity: 50,
    free: null,
    isIndoor: null,
    isOpen: null,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    address: null,
    source: 'osm',
    updatedAt: null,
    fetchedAt: new Date().toISOString(),
    occupancyKind: 'estimated',
    ...over,
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

describe('restoranlar food-first filters', () => {
  it('lists food kinds and "Otoparklı" by default, with no car park filters or lines', async () => {
    await render(<Restaurants />);
    expect(screen.getByText('Tümü')).toBeTruthy();
    expect(screen.getByText('Otoparklı')).toBeTruthy();
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const present = FOOD_CATEGORIES.filter((cat) => nearby.some((r) => matchesCategory(r, cat)));
    expect(present.length).toBeGreaterThan(0);
    for (const cat of present) expect(screen.getByLabelText(tr.food.cats[cat])).toBeTruthy();
    for (const cat of FOOD_CATEGORIES.filter((x) => !present.includes(x)))
      expect(screen.queryByLabelText(tr.food.cats[cat])).toBeNull();
    for (const label of SUB_FILTERS) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
    expect(screen.queryByText(/Yakında otopark bilgisi yok/)).toBeNull();
  });

  it('shows the car park filters and lines when "Otoparklı" is on, and hides both when off', async () => {
    await render(<Restaurants />);
    await fireEvent.press(screen.getByText('Otoparklı'));
    for (const label of SUB_FILTERS) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByText('Otoparklı'));
    for (const label of SUB_FILTERS) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
  });

  it('resets the car park sub-filters when "Otoparklı" is turned off', async () => {
    await render(<Restaurants />);
    await fireEvent.press(screen.getByText('Otoparklı'));
    await fireEvent.press(screen.getByText('Üstü kapalı'));
    expect(screen.queryByText(PARKING_LINE)).toBeNull(); // none of the car parks is covered
    await fireEvent.press(screen.getByText('Otoparklı'));
    await fireEvent.press(screen.getByText('Otoparklı'));
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);
  });

  it('filters the list with a kind chip', async () => {
    mockParkings = [];
    await render(<Restaurants />);
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const rowNames = () =>
      screen
        .getAllByRole('button', { name: /dakika yürüme/ })
        .map((b) => b.props.accessibilityLabel);
    const before = rowNames();
    // A kind with places in the list, and a place on screen that is not of that kind.
    const cat = FOOD_CATEGORIES.find((c) => {
      const out = before.find((l: string) =>
        nearby.some((r) => l.startsWith(`${r.name}.`) && !matchesCategory(r, c)),
      );
      return !!out && nearby.some((r) => matchesCategory(r, c));
    })!;
    expect(cat).toBeTruthy();
    const label = tr.food.cats[cat];
    await fireEvent.press(screen.getByLabelText(label));
    const after = rowNames();
    expect(after.length).toBeGreaterThan(0);
    for (const l of after as string[]) {
      const r = nearby.find((x) => l.startsWith(`${x.name}.`))!;
      expect(matchesCategory(r, cat)).toBe(true);
    }
    expect(after).not.toEqual(before);
  });

  it('starts with "Otoparklı" on when opened with a parking ask', async () => {
    mockParams = { ...KORDON, park: '1' };
    await render(<Restaurants />);
    for (const label of SUB_FILTERS) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);
  });

  it('starts with "Otoparklı" and "Ücretsiz" on when opened with free=1', async () => {
    mockParams = { ...KORDON, free: '1' };
    mockParkings = [parkingAt(0, { isPaid: false })];
    await render(<Restaurants />);
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
    expect(screen.getAllByText(PARKING_LINE).length).toBeGreaterThan(0);
    // Turning the sub-filter off keeps "Otoparklı" on.
    await fireEvent.press(screen.getByText('Ücretsiz'));
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
  });

  it('passes park=1 to the detail only while "Otoparklı" is on', async () => {
    await render(<Restaurants />);
    await fireEvent.press(screen.getByText('Otoparklı'));
    await fireEvent.press(screen.getAllByRole('button', { name: /dakika yürüme/ })[0]!);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ park: '1' }) }),
    );
  });
});
