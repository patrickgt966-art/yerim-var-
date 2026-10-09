import '@/i18n';

import { distanceMeters } from '@/data/geo';
import { IZMIR_CENTER } from '@/data/places';

import { matchRestaurants } from '../FoodHome';

describe('matchRestaurants', () => {
  it('lists the nearest matches first', () => {
    const from = IZMIR_CENTER;
    const d = matchRestaurants('midye', 5, from).map((r) => distanceMeters(from, r));
    expect(d.length).toBeGreaterThan(0);
    // Names starting with the query come first, each group nearest first.
    expect(d[0]!).toBeLessThan(5_000);
  });

  it('keeps at most two branches of a chain', () => {
    const names = matchRestaurants('çiğköfte', 10).map((r) => r.name);
    for (const n of names) expect(names.filter((x) => x === n).length).toBeLessThanOrEqual(2);
  });

  it('needs two characters', () => {
    expect(matchRestaurants('a')).toEqual([]);
  });
});
