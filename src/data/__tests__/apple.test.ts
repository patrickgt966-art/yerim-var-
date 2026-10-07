import { QueryClient } from '@tanstack/react-query';

import {
  appleSearchAvailable,
  findAppleParking,
  fromApple,
  roundArea,
  withApple,
} from '../appleParkings';
import { getFreshness, visibleFree } from '../freshness';
import type { Parking } from '../types';

const at = '2026-10-07T18:00:00.000Z';
const row = {
  name: ' Kültürpark Otoparkı ',
  latitude: 38.4301,
  longitude: 27.1452,
  address: 'Şehitler Cd. Konak',
};

describe('Apple Maps car parks', () => {
  it('is off where the native module is missing (Expo Go, tests)', () => {
    expect(appleSearchAvailable).toBe(false);
  });

  it('maps a result without inventing occupancy', () => {
    const p = fromApple(row, at)!;
    expect(p).toMatchObject({
      name: 'Kültürpark Otoparkı',
      source: 'apple',
      free: null,
      capacity: null,
    });
    expect(p.id).toBe('apple-38.43010,27.14520');
    expect(getFreshness(p).kind).toBe('noData');
    expect(visibleFree({ ...p, free: 9 })).toBeNull();
  });

  it('sends Apple only a ~100 m area, never the exact position', () => {
    expect(roundArea({ lat: 38.4301234, lng: 27.1456789 })).toEqual({ lat: 38.43, lng: 27.146 });
  });

  it('drops unnamed or invalid results', () => {
    expect(fromApple({ ...row, name: '  ' }, at)).toBeNull();
    expect(fromApple({ ...row, latitude: Number.NaN }, at)).toBeNull();
  });

  it('skips Apple results that duplicate a known car park', () => {
    const known = { id: 'izelman-1', lat: 38.4302, lng: 27.1452 } as Parking; // ~11 m away
    const near = fromApple(row, at)!;
    const far = fromApple({ ...row, latitude: 38.44 }, at)!;
    expect(withApple([known], [near, far]).map((p) => p.id)).toEqual([known.id, far.id]);
  });

  it('lets the detail screen find an Apple result in the query cache', () => {
    const client = new QueryClient();
    const p = fromApple(row, at)!;
    client.setQueryData(['apple-parkings', 38.43, 27.145], [p]);
    expect(findAppleParking(client, p.id)).toEqual(p);
    expect(findAppleParking(client, 'osm-node-1')).toBeUndefined();
    client.clear();
  });
});
