import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { QuickGo } from '@/components/home/QuickGo';
import type { Parking } from '@/data/types';
import { useApp } from '@/store/app';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

const mockPark: Parking = {
  id: 'izmir-1',
  name: 'Alsancak Katlı',
  lat: 38.437,
  lng: 27.142,
  capacity: 200,
  free: 24,
  isIndoor: true,
  isOpen: null,
  isPaid: null,
  nonstop: true,
  openingHours: null,
  address: null,
  source: 'izmir-open-data',
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  occupancyKind: 'live',
};
// The real distance ranking, fixed data.
jest.mock('@/data/useParkings', () => ({
  ...jest.requireActual('@/data/useParkings'),
  useParkings: () => ({ data: { parkings: [mockPark], source: 'izmir-open-data' } }),
}));

const favorite = (n: number) => ({
  id: `fav-${n}`,
  name: `Favori ${n}`,
  lat: 38.43 + n / 10_000,
  lng: 27.14,
});

beforeEach(() => {
  useApp.getState().setCity('izmir');
  useApp.setState({ home: null, work: null, favorites: [], favoriteRestaurants: [] });
  mockPush.mockClear();
});

const cardLabels = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => l !== 'Kayıtlı yerleri düzenle');

it('shows the two add cards and no "Düzenle" when nothing is saved', async () => {
  await render(<QuickGo />);
  expect(screen.getByText('Hızlı git')).toBeTruthy();
  expect(screen.getByText('Ev ekle')).toBeTruthy();
  expect(screen.getByText('İş ekle')).toBeTruthy();
  expect(screen.queryByText('Düzenle')).toBeNull();
  await fireEvent.press(screen.getByText('İş ekle'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/yer-ara', params: { purpose: 'work' } });
});

it('lists home, then a favourite car park, each with its live pill, and the missing work card', async () => {
  useApp.setState({
    home: { label: 'Alsancak', lat: 38.437, lng: 27.142 },
    favorites: [{ id: 'izmir-1', name: 'Alsancak Katlı', lat: 38.437, lng: 27.142 }],
  });
  await render(<QuickGo />);
  expect(cardLabels()).toEqual([
    'Ev, Alsancak, 🅿️ 24 boş',
    'Alsancak Katlı, Otopark, 🅿️ 24 boş',
    'İş ekle. Sabah otopark derdi bitsin',
  ]);
  expect(screen.getByText('Düzenle')).toBeTruthy();
  await fireEvent.press(screen.getByText('Düzenle'));
  expect(mockPush).toHaveBeenCalledWith('/favoriler');
});

it('opens the results around home with its coordinates', async () => {
  useApp.setState({ home: { label: 'Alsancak', lat: 38.437, lng: 27.142 } });
  await render(<QuickGo />);
  await fireEvent.press(screen.getByLabelText('Ev, Alsancak, 🅿️ 24 boş'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sonuc',
    params: { lat: '38.437', lng: '27.142', label: 'Alsancak' },
  });
});

it('opens a favourite car park on its page', async () => {
  useApp.setState({ favorites: [favorite(1)] });
  await render(<QuickGo />);
  await fireEvent.press(screen.getByLabelText('Favori 1, Otopark'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/otopark/[id]', params: { id: 'fav-1' } });
});

it('shows at most 6 cards, the newest favourites first', async () => {
  useApp.setState({
    home: { label: 'Alsancak', lat: 38.437, lng: 27.142 },
    work: { label: 'Konak', lat: 38.419, lng: 27.128 },
    favorites: [1, 2, 3, 4, 5, 6].map(favorite),
  });
  await render(<QuickGo />);
  const labels = cardLabels();
  expect(labels).toHaveLength(6);
  expect(labels.slice(2)).toEqual([
    'Favori 6, Otopark',
    'Favori 5, Otopark',
    'Favori 4, Otopark',
    'Favori 3, Otopark',
  ]);
});
