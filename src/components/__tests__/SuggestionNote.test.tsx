import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { openFood, openFoodNearMe } from '@/components/FoodHome';
import { setActiveCity } from '@/data/cities';
import { restaurantsNear } from '@/data/restaurants';
import type { Parking } from '@/data/types';
import { MEAL_CATS } from '@/lib/nudge';
import { useApp } from '@/store/app';

import { SuggestionNote } from '../home/SuggestionNote';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/FoodHome', () => ({ openFood: jest.fn(), openFoodNearMe: jest.fn() }));
jest.mock('@/lib/directions', () => ({ openDirections: jest.fn() }));
let mockParkings: Parking[] = [];
jest.mock('@/data/useParkings', () => ({
  useParkings: () => ({ data: { parkings: mockParkings } }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => true,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
  };
});

// Alsancak, İzmir: plenty of restaurants around in the bundled data.
const HERE = { lat: 38.4361, lng: 27.1425 };
const at = (hour: number) => new Date(2026, 9, 23, hour, 30);

const carParkAt = (id: string, p: { lat: number; lng: number }): Parking => ({
  id,
  name: `Otopark ${id}`,
  ...p,
  capacity: 100,
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
});

beforeEach(() => {
  jest.useFakeTimers({ now: at(19) });
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir', favorites: [], favoriteRestaurants: [], active: null });
  mockParkings = [];
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('SuggestionNote', () => {
  it.each([
    [8, 'morning', /^Sabah için .+ nasıl olur\?$/],
    [13, 'noon', /^Öğle için .+ nasıl olur\?$/],
    [19, 'evening', /^Akşam için .+ nasıl olur\?$/],
    [23, 'night', /^Gece için .+ nasıl olur\?$/],
  ] as const)('at %i:30 it says the %s suggestion with a real count', async (hour, slot, title) => {
    jest.setSystemTime(at(hour));
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(/^Yakında (\d+|\d+'(dan|den) fazla) .+ var\./)).toBeTruthy();
    // The count is the real one: that many places of a category of this hour are around.
    await fireEvent.press(screen.getByRole('button'));
    const [target, , cat] = (openFood as jest.Mock).mock.calls[0];
    expect(target).toEqual(HERE);
    expect(MEAL_CATS[slot]).toContain(cat);
  });

  it('changes with the time of day while it stays on Home', async () => {
    jest.setSystemTime(at(8));
    const view = await render(<SuggestionNote nearby={{ here: HERE }} />);
    const morning = screen.getByRole('button').props.accessibilityLabel;
    await view.unmount();
    jest.setSystemTime(at(19));
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    expect(screen.getByRole('button').props.accessibilityLabel).not.toBe(morning);
  });

  it('reads as one button with the title and the body, and the link as its hint', async () => {
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityLabel).toMatch(/^Akşam için .+ nasıl olur\?\. Yakında /);
    expect(button.props.accessibilityHint).toMatch(/göster$/);
  });

  it('opens the list of that category around the user', async () => {
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(openFood).toHaveBeenCalledWith(HERE, 'Konumun', expect.any(String));
  });

  it('names the place with the easiest parking only when a car park is known near it', async () => {
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    expect(screen.queryByText(/Park derdi en az olanı/)).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/Park derdi/);
  });

  it('adds the easiest-parking line when a car park stands next to the places', async () => {
    mockParkings = restaurantsNear(HERE, 1000, 200).map((r, i) => carParkAt(`p${i}`, r));
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    expect(screen.getByText(/ Park derdi en az olanı .+: otoparkı \d+ m\.$/)).toBeTruthy();
  });

  it('invents nothing without a location: only the hour speaks', async () => {
    await render(<SuggestionNote nearby={{ here: null }} />);
    expect(screen.getByText('Akşam yemeği vakti!')).toBeTruthy();
    expect(screen.getByText('Yakınındaki yerlere birlikte bakalım.')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
    expect(screen.queryByText(/Park derdi/)).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(openFoodNearMe).toHaveBeenCalledTimes(1);
    expect(openFood).not.toHaveBeenCalled();
  });

  it('invents nothing where there are too few places around', async () => {
    // Far out at sea: no place within 1 km.
    await render(<SuggestionNote nearby={{ here: { lat: 38.6, lng: 26.5 } }} />);
    expect(screen.getByText('Akşam yemeği vakti!')).toBeTruthy();
    expect(screen.queryByText(/\d/)).toBeNull();
    expect(screen.queryByText(/Yakında/)).toBeNull();
  });

  it('says a saved restaurant nearby first, and opens it', async () => {
    const saved = restaurantsNear(HERE, 300, 1)[0]!;
    useApp.setState({ favoriteRestaurants: [saved.id] });
    await render(<SuggestionNote nearby={{ here: HERE }} />);
    expect(screen.getByText('Favorin yakında')).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`^Sevdiğin ${saved.name.replace(/[()*+?.]/g, '.')}`)),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/restoran/[id]',
      params: { id: saved.id },
    });
  });

  it('speaks English too', async () => {
    const { changeLanguage } = jest.requireActual('i18next');
    await changeLanguage('en');
    try {
      await render(<SuggestionNote nearby={{ here: HERE }} />);
      expect(screen.getByText(/^How about .+ for dinner\?$/)).toBeTruthy();
    } finally {
      await changeLanguage('tr');
    }
  });
});
