import { setActiveCity } from '@/data/cities';
import { currentLocation } from '@/lib/location';

import { openFoodNearMe } from '../FoodHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/lib/location', () => ({ currentLocation: jest.fn() }));

const lastParams = () => mockPush.mock.calls.at(-1)?.[0].params as Record<string, string>;

beforeEach(() => {
  jest.clearAllMocks();
  setActiveCity('izmir');
});

describe('openFoodNearMe approx', () => {
  it('has no approx when the list is around the user', async () => {
    (currentLocation as jest.Mock).mockResolvedValue({ lat: 38.4237, lng: 27.1428 });
    await openFoodNearMe('Konumun');
    expect(lastParams()).toMatchObject({ lat: '38.4237', lng: '27.1428', label: 'Konumun' });
    expect(lastParams()).not.toHaveProperty('approx');
  });

  it('says noLocation when the location is unknown', async () => {
    (currentLocation as jest.Mock).mockResolvedValue(null);
    await openFoodNearMe('Konumun');
    expect(lastParams().approx).toBe('noLocation');
    expect(lastParams().label).not.toBe('Konumun');
  });

  it('says outside when the fix is outside the city', async () => {
    // Istanbul, while the active city is İzmir.
    (currentLocation as jest.Mock).mockResolvedValue({ lat: 41.0136, lng: 28.9503 });
    await openFoodNearMe('Konumun');
    expect(lastParams().approx).toBe('outside');
    expect(lastParams().label).not.toBe('Konumun');
  });

  it('keeps the other options next to approx', async () => {
    (currentLocation as jest.Mock).mockResolvedValue(null);
    await openFoodNearMe('Konumun', 'fish', false, { park: true });
    expect(lastParams()).toMatchObject({ cat: 'fish', park: '1', approx: 'noLocation' });
  });
});
