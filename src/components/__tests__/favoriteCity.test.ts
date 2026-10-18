import { Alert } from 'react-native';

import { setActiveCity } from '@/data/cities';

import { cityOfPlace, findFavoriteRestaurant, openInCity } from '../favoriteCity';

const t = ((k: string) => k) as never;

beforeEach(() => setActiveCity('izmir'));
afterEach(() => jest.restoreAllMocks());

describe('favourites from another city', () => {
  it('finds a saved restaurant in the active city and in other cities', () => {
    expect(findFavoriteRestaurant('osm-n4174658989')?.city.id).toBe('izmir');
    const ist = findFavoriteRestaurant('osm-n10674343216');
    expect(ist?.city.id).toBe('istanbul');
    expect(ist?.r.lat).toBeCloseTo(41.02759);
    expect(findFavoriteRestaurant('ov-293caeeb8b1646ab')?.city.id).toBe('ankara');
    expect(findFavoriteRestaurant('osm-gone')).toBeNull();
  });

  it('knows the city of a saved car park', () => {
    expect(cityOfPlace({ lat: 41.0136, lng: 28.9503 })?.id).toBe('istanbul');
    expect(cityOfPlace({ lat: 38.4189, lng: 27.1287 })?.id).toBe('izmir');
  });

  it('opens at once in the active city', () => {
    const open = jest.fn();
    const setCity = jest.fn();
    openInCity(cityOfPlace({ lat: 38.4189, lng: 27.1287 }), 'X', t, setCity, open);
    expect(open).toHaveBeenCalled();
    expect(setCity).not.toHaveBeenCalled();
  });

  it('asks to switch to the other city, then opens there', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const open = jest.fn();
    const setCity = jest.fn();
    openInCity(cityOfPlace({ lat: 41.0136, lng: 28.9503 }), 'X', t, setCity, open);
    expect(open).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    buttons[1]!.onPress!();
    expect(setCity).toHaveBeenCalledWith('istanbul');
    expect(open).toHaveBeenCalled();
  });
});
