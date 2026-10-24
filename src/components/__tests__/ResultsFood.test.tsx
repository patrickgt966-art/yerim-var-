import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import Results from '@/app/sonuc';
import { setActiveCity } from '@/data/cities';
import { FOOD_CATEGORIES, matchesCategory, restaurantsNear } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import tr from '@/i18n/tr';
import { forgetModes } from '@/lib/resultsMode';
import { useApp } from '@/store/app';

const KORDON = { lat: '38.4344', lng: '27.1427', label: 'Kordon' };
const TARGET = { lat: 38.4344, lng: 27.1427 };

let mockParams: Record<string, string> = {};
let mockParkings: Parking[] = [];
let mockSource = 'izmir-open-data';
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
      data: { parkings: mockParkings, source: mockSource },
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
  mockSource = 'izmir-open-data';
  forgetModes();
});

const BANNER = 'Bu bilgi deneme, gerçek değil: belediye verisine ulaşamadım.';
const tab = (name: string) => screen.getByRole('tab', { name });
const isOn = (name: string) => tab(name).props.accessibilityState.selected === true;
const restaurantButtons = () =>
  screen
    .queryAllByRole('button', { name: /dakika yürüme/ })
    .filter((b) => !(b.props.accessibilityLabel as string).startsWith('Otopark '));
/** The banner text sits inside an alert only in its full (Otopark) form. */
const bannerIsAlert = () => {
  let node = screen.getByText(BANNER).parent;
  while (node) {
    if (node.props.accessibilityRole === 'alert') return true;
    node = node.parent;
  }
  return false;
};

describe('sonuc entry decides the start mode', () => {
  it.each([
    ['the locate button (near=1)', { near: '1' }, 'Tümü'],
    ['a typed place (no mode)', {}, 'Tümü'],
    ['"Otopark bul"', { near: '1', mode: 'park' }, 'Otopark'],
    ['"Yemek bul"', { mode: 'food' }, 'Restoran'],
    ['the Turkish names', { mode: 'restoran' }, 'Restoran'],
    ['an unknown mode', { mode: 'xyz' }, 'Tümü'],
  ])('%s opens %s', async (_name, extra, expected) => {
    mockParams = { ...KORDON, ...extra };
    await render(<Results />);
    for (const name of ['Tümü', 'Otopark', 'Restoran']) expect(isOn(name)).toBe(name === expected);
  });

  it('remembers the last mode per entry for the session only', async () => {
    const first = await render(<Results />);
    await fireEvent.press(tab('Restoran'));
    await first.unmount();
    const second = await render(<Results />);
    expect(isOn('Restoran')).toBe(true);
    await second.unmount();
    // Another entry keeps its own start.
    mockParams = { ...KORDON, mode: 'park' };
    const third = await render(<Results />);
    expect(isOn('Otopark')).toBe(true);
    await third.unmount();
    // A new session starts over.
    forgetModes();
    mockParams = { ...KORDON };
    await render(<Results />);
    expect(isOn('Tümü')).toBe(true);
  });
});

describe('sonuc Tümü', () => {
  it('lists car parks and restaurants together with no sub-filter row', async () => {
    await render(<Results />);
    expect(screen.getByText(/^Yakınında 3 otopark · \d+ restoran$/)).toBeTruthy();
    expect(screen.getAllByText('Otopark 0').length).toBeGreaterThan(0);
    expect(restaurantButtons().length).toBeGreaterThan(0);
    for (const label of ['Üstü kapalı', 'Ücretsiz', 'Boş yer bilgisi olanlar', 'Otoparklı'])
      expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
  });
});

describe('sonuc Otopark', () => {
  beforeEach(() => {
    mockParams = { ...KORDON, mode: 'park' };
  });

  it('shows the car park filters, no food chips and no restaurant cards', async () => {
    await render(<Results />);
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
    expect(screen.queryByText('Otoparklı')).toBeNull();
    expect(screen.queryByText('Yakındaki restoranlar')).toBeNull();
    expect(screen.getAllByText('Otopark 0').length).toBeGreaterThan(0);
    expect(restaurantButtons()).toHaveLength(0);
  });

  it('narrows with a filter and clears it when pressed again', async () => {
    mockParkings = [{ ...parkingAt(0), isPaid: false }, parkingAt(1), parkingAt(2)];
    await render(<Results />);
    await fireEvent.press(screen.getByText('Ücretsiz'));
    expect(screen.getAllByText('Otopark 0').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Otopark 1')).toHaveLength(0);
    await fireEvent.press(screen.getByText('Ücretsiz'));
    expect(screen.getAllByText('Otopark 1').length).toBeGreaterThan(0);
  });
});

describe('sonuc Restoran', () => {
  beforeEach(() => {
    mockParams = { ...KORDON, mode: 'food' };
  });

  it('lists food kinds and "Otoparklı" first, with no car park filters or lines', async () => {
    await render(<Results />);
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const present = FOOD_CATEGORIES.filter((cat) => nearby.some((r) => matchesCategory(r, cat)));
    expect(present.length).toBeGreaterThan(0);
    for (const cat of present) expect(screen.getByLabelText(tr.food.cats[cat])).toBeTruthy();
    expect(screen.getByText('Otoparklı')).toBeTruthy();
    for (const label of SUB_FILTERS) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(PARKING_LINE)).toBeNull();
    expect(screen.queryByText(/Yakında otopark bilgisi yok/)).toBeNull();
    expect(screen.queryByText('Otopark 0')).toBeNull();
  });

  it('shows the sub-filters and parking lines with "Otoparklı", and clears them when off', async () => {
    await render(<Results />);
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
    const nearby = restaurantsNear(TARGET, 1000, 600);
    const rowLabels = () => restaurantButtons().map((b) => b.props.accessibilityLabel as string);
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

  it('says the data may be old once in the header, not on every card', async () => {
    await render(<Results />);
    expect(screen.queryAllByText(tr.food.unverified)).toHaveLength(0);
    expect(screen.queryAllByText(tr.food.listStale).length).toBeLessThanOrEqual(1);
  });
});

describe('sonuc chips follow the mode', () => {
  it('switches the chip rows with the segmented control', async () => {
    await render(<Results />);
    expect(screen.queryByText('Üstü kapalı')).toBeNull();
    await fireEvent.press(tab('Otopark'));
    expect(screen.getByText('Üstü kapalı')).toBeTruthy();
    expect(screen.queryByText('Otoparklı')).toBeNull();
    await fireEvent.press(tab('Restoran'));
    expect(screen.getByText('Otoparklı')).toBeTruthy();
    expect(screen.queryByText('Üstü kapalı')).toBeNull();
    await fireEvent.press(tab('Tümü'));
    expect(screen.queryByText('Otoparklı')).toBeNull();
    expect(screen.queryByText('Üstü kapalı')).toBeNull();
  });
});

describe('sonuc parking data banner', () => {
  beforeEach(() => {
    mockSource = 'mock';
  });

  it('is a full alert in Otopark, a muted line in Tümü and absent in Restoran', async () => {
    await render(<Results />);
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(bannerIsAlert()).toBe(false); // Tümü: small muted line

    await fireEvent.press(tab('Otopark'));
    expect(bannerIsAlert()).toBe(true);

    await fireEvent.press(tab('Restoran'));
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});
