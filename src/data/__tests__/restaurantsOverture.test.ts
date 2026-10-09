import overture from '../../../data/food-overture-izmir.json';
import osm from '../../../data/food-izmir.json';
import { allRestaurants, rankRestaurants, toRestaurant, type RestaurantRow } from '../restaurants';

describe('restaurant ids across OSM and Overture data', () => {
  it('allRestaurants() has no duplicate ids', () => {
    const ids = allRestaurants().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is unique across both files', () => {
    const ids = [...osm.items, ...overture.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('allRestaurants() holds the OSM items followed by the Overture items', () => {
    expect(allRestaurants()).toHaveLength(osm.items.length + overture.items.length);
  });
});

describe('verified flag and ranking', () => {
  const base = { n: 'X', a: 1, o: 2, k: 'cafe' };

  it('OSM is verified; Overture only with v 1', () => {
    expect(toRestaurant({ ...base, id: 'osm-1' })).toMatchObject({ source: 'osm', verified: true });
    expect(toRestaurant({ ...base, id: 'ov-1' })).toMatchObject({ source: 'overture', verified: false });
    expect(toRestaurant({ ...base, id: 'ov-2', v: 1 })).toMatchObject({
      source: 'overture',
      verified: true,
    });
  });

  const row = (id: string, v?: number): RestaurantRow => ({
    r: { ...toRestaurant({ ...base, id, ...(v ? { v } : {}) }), distanceM: 100 },
    parking: null,
    nearbyCount: 0,
  });

  it.each(['parkEase', 'distance'] as const)('ranks the unverified row second (%s)', (sort) => {
    const rows = [row('ov-unverified'), row('ov-verified', 1)];
    expect(rankRestaurants(rows, sort).map((x) => x.r.id)).toEqual(['ov-verified', 'ov-unverified']);
  });
});
