import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { RestaurantCard } from '@/app/(tabs)/harita';
import { toRestaurant } from '@/data/restaurants';
import { openDirections } from '@/lib/directions';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), setParams: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/directions', () => ({ openDirections: jest.fn(async () => 'opened') }));
jest.mock('@/components/ParkingMap', () => ({ ParkingMap: () => null }));

const r = toRestaurant({ id: 'osm-m1', n: 'Alfa Lokanta', a: 38.4, o: 27.1, k: 'restaurant' });

describe('map RestaurantCard', () => {
  it('offers Detay and Yol tarifi, not parking, and opens directions to the restaurant', async () => {
    await render(<RestaurantCard restaurant={r} onClose={jest.fn()} />);
    expect(screen.getByText('Detay')).toBeTruthy();
    expect(screen.queryByText('Otoparka git')).toBeNull();
    expect(screen.queryByText(/En yakın otopark/)).toBeNull();
    await fireEvent.press(screen.getByText('Yol tarifi'));
    expect(openDirections).toHaveBeenCalledWith(r, r.name);
  });
});
