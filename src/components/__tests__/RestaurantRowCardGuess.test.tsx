import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { toRestaurant, type RestaurantRow } from '@/data/restaurants';

import { RestaurantRowCard } from '../RestaurantRowCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/data/cityData', () => ({
  ...jest.requireActual('@/data/cityData'),
  categoryGuessFile: () => ({ items: { 'osm-g1': 'cafe' } }),
}));

const row = (id: string, n: string, k: string): RestaurantRow => ({
  r: { ...toRestaurant({ id, n, a: 38.4, o: 27.1, k }), distanceM: 100 },
  parking: null,
  nearbyCount: 0,
});
const card = (r: RestaurantRow) => (
  <RestaurantRowCard row={r} target={null} best={false} widened={false} parkPending={false} />
);

describe('RestaurantRowCard estimated type', () => {
  it('says "Türü tahmini" for a place whose category is a guess', async () => {
    await render(card(row('osm-g1', 'Hasan Usta', 'restaurant')));
    expect(screen.getByText(/Türü tahmini/)).toBeTruthy();
  });

  it('says nothing for a place the rules categorise', async () => {
    await render(card(row('osm-r1', 'Alfa Kafe', 'cafe')));
    expect(screen.queryByText(/Türü tahmini/)).toBeNull();
  });
});
