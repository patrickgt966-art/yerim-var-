import type { Parking } from '@/data/types';

import { resolveFavoriteParking } from '../favoriteIds';

const mk = (id: string, name: string, lat: number, lng: number, source: Parking['source']) =>
  ({ id, name, lat, lng, source }) as Parking;

const parkings = [
  mk('izelman-abcdef0123', 'Konak Katlı Otoparkı', 38.4156, 27.1294, 'izelman'),
  mk('osm-1', 'Konak Katlı Otoparkı', 38.4156, 27.1294, 'osm'),
  mk('osm-2', 'Bostanlı Otopark', 38.46, 27.09, 'osm'),
];

describe('resolveFavoriteParking', () => {
  it('returns the car park with the exact id', () => {
    const fav = { id: 'izelman-abcdef0123', name: 'Eski ad', lat: 0, lng: 0 };
    expect(resolveFavoriteParking(fav, parkings)).toBe(parkings[0]);
  });

  it('resolves an old izelman id by name within 40 m', () => {
    const fav = {
      id: 'izelman-6ad4ad67-1',
      name: 'KONAK KATLI OTOPARKI',
      lat: 38.41563,
      lng: 27.12935,
    };
    expect(resolveFavoriteParking(fav, parkings)).toBe(parkings[0]);
  });

  it('returns null for a different name within 40 m', () => {
    const fav = { id: 'izelman-6ad4ad67-1', name: 'Alsancak Otoparkı', lat: 38.4156, lng: 27.1294 };
    expect(resolveFavoriteParking(fav, parkings)).toBeNull();
  });

  it('returns null when the same name is farther than 40 m', () => {
    const fav = {
      id: 'izelman-6ad4ad67-1',
      name: 'Konak Katlı Otoparkı',
      lat: 38.4166,
      lng: 27.1294,
    };
    expect(resolveFavoriteParking(fav, parkings)).toBeNull();
  });

  it('does not migrate osm ids', () => {
    const fav = { id: 'osm-gone', name: 'Bostanlı Otopark', lat: 38.46, lng: 27.09 };
    expect(resolveFavoriteParking(fav, parkings)).toBeNull();
  });
});
