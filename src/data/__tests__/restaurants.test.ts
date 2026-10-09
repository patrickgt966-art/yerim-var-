import '@/i18n';

import { t } from 'i18next';

import {
  cuisineLabels,
  getRestaurant,
  kindLabel,
  nearestParking,
  parkingSummary,
  telUrl,
  restaurantsNear,
  toRestaurant,
  type Restaurant,
} from '../restaurants';
import type { Parking } from '../types';

const origin = { lat: 38.4, lng: 27.1 };
// 0.001 degrees of latitude is about 111 m.
const at = (metersNorth: number) => origin.lat + metersNorth / 111_195;

function rest(id: string, metersNorth: number): Restaurant {
  return toRestaurant({ id, n: id, a: at(metersNorth), o: origin.lng, k: 'cafe' });
}

const park = (id: string, metersNorth: number) =>
  ({ id, name: id, lat: at(metersNorth), lng: origin.lng }) as Parking;

describe('toRestaurant', () => {
  it('maps short keys and nulls missing fields', () => {
    const r = toRestaurant({
      id: 'x',
      n: 'Lokanta',
      a: 1,
      o: 2,
      k: 'restaurant',
      c: ['turkish'],
      h: 'Mo-Su 09:00-22:00',
      out: false,
    });
    expect(r).toMatchObject({
      name: 'Lokanta',
      lat: 1,
      lng: 2,
      kind: 'restaurant',
      cuisines: ['turkish'],
      openingHours: 'Mo-Su 09:00-22:00',
      outdoorSeating: false,
      phone: null,
      website: null,
      wheelchair: null,
    });
    expect(toRestaurant({ id: 'y', n: 'A', a: 1, o: 2, k: 'bar' }).cuisines).toEqual([]);
  });

  it('loads the bundled file', () => {
    expect(getRestaurant('does-not-exist')).toBeNull();
  });
});

describe('restaurantsNear', () => {
  const list = [rest('far', 900), rest('near', 100), rest('mid', 400), rest('out', 1500)];

  it('sorts nearest first and drops those beyond the radius', () => {
    const res = restaurantsNear(origin, 1000, 60, list);
    expect(res.map((r) => r.id)).toEqual(['near', 'mid', 'far']);
    expect(res[0]!.distanceM).toBeGreaterThan(90);
    expect(res[0]!.distanceM).toBeLessThan(110);
  });

  it('applies the limit after sorting', () => {
    expect(restaurantsNear(origin, 1000, 2, list).map((r) => r.id)).toEqual(['near', 'mid']);
  });
});

describe('labels', () => {
  it('translates kinds and drops unknown cuisine codes', () => {
    expect(kindLabel('cafe', t)).toBe('Kafe');
    expect(kindLabel('weird', t)).toBeNull();
    expect(cuisineLabels(['coffee_shop', 'klingon', 'cig_kofte'], t)).toEqual([
      'Kahve',
      'Çiğ köfte',
    ]);
    expect(cuisineLabels(['coffee_shop', 'coffee'], t)).toEqual(['Kahve']);
  });
});

describe('nearestParking', () => {
  it('picks the nearest car park within 500 m', () => {
    const res = nearestParking(origin, [park('b', 300), park('a', 120), park('c', 480)]);
    expect(res?.parking.id).toBe('a');
  });

  it('returns null beyond 500 m', () => {
    expect(nearestParking(origin, [park('far', 600)])).toBeNull();
    expect(nearestParking(origin, [])).toBeNull();
  });
});

describe('parkingSummary', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const spot = { lat: 38.4237, lng: 27.1428 };
  const base = {
    id: 'p1',
    name: 'P',
    lat: 38.4238,
    lng: 27.1429,
    capacity: 60,
    free: 14,
    updatedAt: null,
    fetchedAt: '2026-10-09T11:55:00Z',
  };

  it('shows a fresh count with its time', () => {
    const s = parkingSummary(spot, [{ ...base, source: 'izmir-open-data' } as Parking], now);
    expect(s?.free).toBe(14);
    expect(s?.at).toBeInstanceOf(Date);
  });

  it('never shows sample, stale or static counts', () => {
    for (const p of [
      { ...base, source: 'mock' },
      { ...base, source: 'izmir-open-data', fetchedAt: '2026-10-09T10:00:00Z' },
      { ...base, source: 'osm', free: null },
    ]) {
      const s = parkingSummary(spot, [p as Parking], now);
      expect(s?.free).toBeNull();
      expect(s?.at).toBeNull();
    }
  });
});

describe('telUrl', () => {
  it('takes the first of several numbers', () => {
    expect(telUrl('+90532 455 86 10;+90507 495 15 11')).toBe('tel:+905324558610');
  });
  it('rejects too short values', () => {
    expect(telUrl('112')).toBeNull();
  });
});
