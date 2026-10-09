import '@/i18n';

import { t } from 'i18next';

import {
  categoryForQuery,
  categoryOf,
  parkingInfo,
  cuisineLabels,
  infoScore,
  matchesCategory,
  restaurantsInCategory,
  nearbyParkingCount,
  rankRestaurants,
  type RestaurantRow,
  getRestaurant,
  kindLabel,
  nearestParking,
  parkingSummary,
  telUrl,
  restaurantsNear,
  restaurantsForMap,
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

describe('restaurantsForMap', () => {
  it('keeps within 1500 m and caps at 150 markers, nearest first', () => {
    const many = Array.from({ length: 200 }, (_, i) => rest(`r${i}`, 10 + i * 5));
    many.push(rest('out', 2000));
    const res = restaurantsForMap(origin, many);
    expect(res).toHaveLength(150);
    expect(res[0]!.id).toBe('r0');
    expect(res.some((r) => r.id === 'out')).toBe(false);
    expect(restaurantsForMap(origin, [rest('a', 1400), rest('b', 1600)]).map((r) => r.id)).toEqual([
      'a',
    ]);
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

describe('categories', () => {
  const mk = (n: string, k: string, c?: string[]) => toRestaurant({ id: n, n, a: 1, o: 2, k, c });

  it('matches on kind, cuisine and folded name', () => {
    expect(matchesCategory(mk('Köşe', 'restaurant', ['breakfast']), 'breakfast')).toBe(true);
    expect(matchesCategory(mk('Serpme Kahvaltı Evi', 'restaurant'), 'breakfast')).toBe(true);
    expect(matchesCategory(mk('Ocakbaşı Usta', 'restaurant'), 'meat')).toBe(true);
    expect(matchesCategory(mk('X', 'restaurant', ['steak_house']), 'meat')).toBe(true);
    expect(matchesCategory(mk('Balıkçı Ahmet', 'restaurant'), 'fish')).toBe(true);
    expect(matchesCategory(mk('X', 'cafe'), 'cafe')).toBe(true);
    expect(matchesCategory(mk('X', 'restaurant', ['coffee_shop']), 'cafe')).toBe(true);
    expect(matchesCategory(mk('X', 'pub'), 'meyhane')).toBe(true);
    expect(matchesCategory(mk('Yeni Meyhane', 'restaurant'), 'meyhane')).toBe(true);
    expect(matchesCategory(mk('X', 'fast_food'), 'fast')).toBe(true);
    expect(matchesCategory(mk('X', 'restaurant', ['pizza']), 'fast')).toBe(true);
    expect(matchesCategory(mk('X', 'ice_cream'), 'dessert')).toBe(true);
    expect(matchesCategory(mk('Tatlıcı Baba', 'restaurant'), 'dessert')).toBe(true);
    expect(matchesCategory(mk('Plain', 'restaurant'), 'fish')).toBe(false);
  });

  it('categoryOf returns the first match or null', () => {
    expect(categoryOf(mk('Balık Evi', 'restaurant'))).toBe('fish');
    expect(categoryOf(mk('Plain', 'restaurant'))).toBeNull();
  });
});

describe('infoScore', () => {
  it('counts present fields', () => {
    expect(infoScore(rest('a', 0))).toBe(0);
    expect(
      infoScore(
        toRestaurant({
          id: 'b',
          n: 'b',
          a: 1,
          o: 2,
          k: 'cafe',
          c: ['tea'],
          p: '1',
          h: 'x',
          w: 'y',
          ad: 'z',
          ig: 'i',
        }),
      ),
    ).toBe(6);
    expect(infoScore(toRestaurant({ id: 'c', n: 'c', a: 1, o: 2, k: 'cafe', c: [] }))).toBe(0);
  });
});

describe('rankRestaurants', () => {
  const row = (
    id: string,
    distanceM: number,
    parking: RestaurantRow['parking'],
    info = 0,
  ): RestaurantRow => ({
    r: {
      ...toRestaurant({ id, n: id, a: 1, o: 2, k: 'cafe', ...(info ? { p: '123' } : {}) }),
      distanceM,
    },
    parking,
    nearbyCount: parking ? 1 : 0,
  });
  const p = (distanceM: number, free: number | null) => ({
    distanceM,
    free,
    at: free != null ? new Date() : null,
  });

  it('orders by distance', () => {
    const rows = [row('b', 300, null), row('a', 100, null)];
    expect(rankRestaurants(rows, 'distance').map((x) => x.r.id)).toEqual(['a', 'b']);
  });

  it('ranks fresh free, unknown, zero, then none', () => {
    const rows = [
      row('none', 10, null),
      row('zero', 10, p(50, 0)),
      row('unknown', 10, p(50, null)),
      row('free', 10, p(450, 5)),
    ];
    expect(rankRestaurants(rows, 'parkEase').map((x) => x.r.id)).toEqual([
      'free',
      'unknown',
      'zero',
      'none',
    ]);
  });

  it('uses info richness within a 100 m bucket, then parking distance', () => {
    const rows = [
      row('bare-close', 10, p(120, null)),
      row('rich', 10, p(180, null), 1),
      row('rich-far', 10, p(320, null), 1),
    ];
    expect(rankRestaurants(rows, 'parkEase').map((x) => x.r.id)).toEqual([
      'rich',
      'bare-close',
      'rich-far',
    ]);
  });
});

describe('nearbyParkingCount', () => {
  it('counts car parks within the radius', () => {
    expect(nearbyParkingCount(origin, [park('a', 100), park('b', 400), park('c', 700)])).toBe(2);
    expect(nearbyParkingCount(origin, [park('a', 100), park('c', 700)], 800)).toBe(2);
  });
});

describe('name keyword edge cases', () => {
  const mk = (n: string) => toRestaurant({ id: n, n, a: 1, o: 2, k: 'restaurant' });
  it('matches keywords only at word start', () => {
    expect(matchesCategory(mk('Nimet Lokantası'), 'meat')).toBe(false);
    expect(matchesCategory(mk('Et Lokantası Usta'), 'meat')).toBe(true);
    expect(matchesCategory(mk('Kalabalık Cafe'), 'fish')).toBe(false);
    expect(matchesCategory(mk('Alabalık Evi'), 'fish')).toBe(true);
  });
  it('keeps çiğ köfte out of meat', () => {
    expect(matchesCategory(mk('Çiğ Köfteci Ali'), 'meat')).toBe(false);
    expect(matchesCategory(mk('Çiğköfte Dünyası'), 'meat')).toBe(false);
    expect(matchesCategory(mk('Köfteci Yusuf'), 'meat')).toBe(true);
  });
});

describe('categoryForQuery', () => {
  it('maps whole category words only', () => {
    expect(categoryForQuery('Kahvaltı')).toBe('breakfast');
    expect(categoryForQuery(' BALIK ')).toBe('fish');
    expect(categoryForQuery('deniz ürünleri')).toBe('fish');
    expect(categoryForQuery('döner')).toBe('fast');
    expect(categoryForQuery('Alsancak')).toBeNull();
    expect(categoryForQuery('')).toBeNull();
  });
});

describe('parkingInfo', () => {
  it('finds nearest and count in one pass', () => {
    const res = parkingInfo(origin, [park('b', 300), park('a', 120), park('far', 900)]);
    expect(res.nearbyCount).toBe(2);
    expect(res.parking?.distanceM).toBeGreaterThan(110);
    expect(res.parking?.distanceM).toBeLessThan(130);
    expect(parkingInfo(origin, [park('far', 900)])).toEqual({ parking: null, nearbyCount: 0 });
  });
});

describe('category inference from the name', () => {
  const mk = (n: string, k: string, c?: string[]) =>
    toRestaurant({ id: n, n, a: 38.42, o: 27.13, k, ...(c ? { c } : {}) });

  it('puts a börek shop tagged fast_food under breakfast only', () => {
    const r = mk('Bülent Börekçilik', 'fast_food');
    expect(matchesCategory(r, 'breakfast')).toBe(true);
    expect(matchesCategory(r, 'fast')).toBe(false);
    expect(matchesCategory(r, 'fish')).toBe(false);
    expect(matchesCategory(r, 'meat')).toBe(false);
    expect(categoryOf(r)).toBe('breakfast');
  });

  it('reads meat and soup from the name', () => {
    expect(matchesCategory(mk('Köfteci Yusuf', 'fast_food'), 'meat')).toBe(true);
    expect(matchesCategory(mk('Lezzet Çorba Evi', 'restaurant'), 'soup')).toBe(true);
    expect(matchesCategory(mk('Kelle Paça Salonu', 'restaurant'), 'soup')).toBe(true);
  });

  it('still uses the kind when the name says nothing', () => {
    expect(matchesCategory(mk('Burger Point', 'fast_food'), 'fast')).toBe(true);
    expect(matchesCategory(mk('Ayşe Hanım', 'fast_food'), 'fast')).toBe(true);
  });
});

describe('restaurantsInCategory', () => {
  const at = (n: string, dLat: number) =>
    toRestaurant({ id: n, n, a: 38.42 + dLat, o: 27.13, k: 'restaurant', c: ['seafood'] });
  const center = { lat: 38.42, lng: 27.13 };

  it('widens the radius until enough places appear', () => {
    // ~2.2 km north: none within 1 km, five within 3 km.
    const list = [1, 2, 3, 4, 5].map((i) => at(`b${i}`, 0.02));
    const { items, radiusM } = restaurantsInCategory(center, 'fish', list);
    expect(radiusM).toBe(3000);
    expect(items).toHaveLength(5);
  });

  it('never returns other categories', () => {
    const list = [toRestaurant({ id: 'x', n: 'Bülent Börek', a: 38.42, o: 27.13, k: 'fast_food' })];
    expect(restaurantsInCategory(center, 'fish', list).items).toHaveLength(0);
  });
});

describe('restaurantsInCategory edges', () => {
  const center = { lat: 38.42, lng: 27.13 };
  it('stays at 1 km when enough places are close', () => {
    const list = [1, 2, 3, 4, 5].map((i) =>
      toRestaurant({ id: `f${i}`, n: `F${i}`, a: 38.42, o: 27.13, k: 'restaurant', c: ['fish'] }),
    );
    expect(restaurantsInCategory(center, 'fish', list).radiusM).toBe(1000);
  });
  it('reports 6 km and nothing when the category is absent', () => {
    expect(restaurantsInCategory(center, 'soup', [])).toEqual({ items: [], radiusM: 6000 });
  });
});
