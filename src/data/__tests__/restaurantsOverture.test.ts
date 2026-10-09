import overture from '../../../data/food-overture-izmir.json';
import osm from '../../../data/food-izmir.json';
import { allRestaurants } from '../restaurants';

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
