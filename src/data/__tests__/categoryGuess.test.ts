import '@/i18n';

import { matchRestaurants } from '@/components/FoodHome';
import { setActiveCity } from '@/data/cities';
import { LatLng } from '@/data/geo';

import {
  allRestaurants,
  categoryByRules,
  categoryOf,
  categorySource,
  getRestaurant,
  isEstimatedKind,
  isWeakMatch,
  matchesCategory,
  rankRestaurants,
  restaurantsForMap,
  restaurantsInCategory,
  toRestaurant,
  type RestaurantRow,
} from '../restaurants';

// A small city: the OSM file and the guess file are stand-ins (the real guess file is empty until
// scripts/classify-places.ts has run). "Hasan Usta" says nothing, so a plain restaurant of that
// name is lokanta only by its kind (a fallback).
const mockFood = [
  { id: 'osm-g1', n: 'Hasan Usta', a: 38.4, o: 27.1, k: 'restaurant' },
  { id: 'osm-r1', n: 'Alfa Kafe', a: 38.4, o: 27.1, k: 'cafe' },
  { id: 'osm-nf1', n: 'Demirkanat Şarküteri', a: 38.4, o: 27.1, k: 'restaurant' },
  { id: 'osm-nf2', n: 'Mehmet Usta', a: 38.4, o: 27.1, k: 'restaurant' },
  { id: 'osm-nf3', n: 'Zeta Kebap', a: 38.4, o: 27.1, k: 'restaurant' },
  { id: 'osm-r2', n: 'Zeta Balık', a: 38.4, o: 27.1, k: 'restaurant' },
  { id: 'osm-g2', n: 'Sultan Tesisleri', a: 38.4001, o: 27.1, k: 'restaurant' },
  { id: 'osm-x1', n: 'Zeta Nargile Evi', a: 38.4, o: 27.1, k: 'cafe' },
];
const mockGuess: Record<string, string> = {
  'osm-g1': 'cafe', // fallback lokanta: replaced
  'osm-nf1': 'not_food', // excluded name: out of the lists
  'osm-nf2': 'not_food', // fallback lokanta: out of the lists
  'osm-nf3': 'not_food', // the name says kebap: the rules win
  'osm-r2': 'dessert', // the name says fish: the rules win
  'osm-g2': 'banana', // not a category: ignored
  'osm-x1': 'cafe', // excluded name: a food guess does not override it
};
jest.mock('../cityData', () => ({
  ...jest.requireActual('../cityData'),
  foodFile: (id: string) => ({ items: id === 'izmir' ? mockFood : [] }),
  foodOvertureFile: () => ({ items: [] }),
  categoryGuessFile: () => ({ items: mockGuess }),
}));

beforeEach(() => setActiveCity('izmir'));

const byId = (id: string) => getRestaurant(id)!;
const center: LatLng = { lat: 38.4, lng: 27.1 };

describe('where the rules category comes from', () => {
  it('tells a name or tag match from the kind fallback and from no category', () => {
    expect(categorySource(byId('osm-r1'))).toBe('rules'); // "Kafe" in the name
    expect(categorySource(byId('osm-r2'))).toBe('rules');
    expect(categorySource(byId('osm-g1'))).toBe('fallback'); // plain restaurant -> lokanta
    expect(categoryByRules(byId('osm-g1'))).toBe('lokanta');
    expect(categorySource(byId('osm-nf1'))).toBeNull(); // excluded name
    expect(categorySource(byId('osm-x1'))).toBeNull();
  });

  it('reads cuisine tags, pub names and kind-only places', () => {
    const rec = (n: string, k: string, c?: string[]) =>
      toRestaurant({ id: 'osm-t', n, a: 1, o: 1, k, ...(c ? { c } : {}) });
    expect(categorySource(rec('Hasan Usta', 'restaurant', ['italian']))).toBe('rules');
    expect(categorySource(rec('Hasan Usta', 'restaurant', ['turkish']))).toBe('rules');
    expect(categorySource(rec('Hasan Usta', 'restaurant', ['mushrooms']))).toBe('fallback');
    expect(categorySource(rec('Hasan Usta', 'fast_food'))).toBe('fallback');
    expect(categorySource(rec('Hasan Usta', 'cafe'))).toBe('fallback');
    expect(categorySource(rec('Hasan Usta', 'bar'))).toBe('fallback');
    expect(categorySource(rec('Hasan Pub', 'pub'))).toBe('rules');
    expect(categorySource(rec('Hasan Usta', 'bakery'))).toBe('fallback');
  });
});

describe('an estimated category', () => {
  it('replaces the fallback category', () => {
    expect(categoryOf(byId('osm-g1'))).toBe('cafe');
    expect(matchesCategory(byId('osm-g1'), 'cafe')).toBe(true);
    expect(matchesCategory(byId('osm-g1'), 'lokanta')).toBe(false);
    expect(matchesCategory(byId('osm-g1'), 'fish')).toBe(false);
  });

  it('is a weak match; a rule match is not', () => {
    expect(isWeakMatch(byId('osm-g1'), 'cafe')).toBe(true);
    expect(isWeakMatch(byId('osm-r1'), 'cafe')).toBe(false);
  });

  it('never overrides a rule match, an exclusion, or a value that is not a category', () => {
    expect(categoryOf(byId('osm-r2'))).toBe('fish');
    expect(matchesCategory(byId('osm-r2'), 'dessert')).toBe(false);
    expect(categoryOf(byId('osm-x1'))).toBeNull();
    expect(matchesCategory(byId('osm-x1'), 'cafe')).toBe(false);
    expect(categoryOf(byId('osm-g2'))).toBe('lokanta');
  });

  it('ranks after a rule match at the same distance', () => {
    const row = (id: string): RestaurantRow => ({
      r: { ...byId(id), distanceM: 100 },
      parking: null,
      nearbyCount: 0,
    });
    const ranked = rankRestaurants([row('osm-g1'), row('osm-r1')], 'parkEase', 'cafe');
    expect(ranked.map((x) => x.r.id)).toEqual(['osm-r1', 'osm-g1']);
  });

  it('is found by a category search, and leaves the fallback category', () => {
    expect(restaurantsInCategory(center, 'cafe').items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['osm-g1', 'osm-r1']),
    );
    expect(restaurantsInCategory(center, 'lokanta').items.map((x) => x.id)).not.toContain('osm-g1');
  });

  it('is flagged as estimated only for guessed categories', () => {
    expect(isEstimatedKind(byId('osm-g1'))).toBe(true);
    for (const id of ['osm-r1', 'osm-r2', 'osm-nf1', 'osm-g2', 'osm-x1']) {
      expect(isEstimatedKind(byId(id))).toBe(false);
    }
  });
});

describe('a not_food guess', () => {
  it('leaves the lists, the map and the category search', () => {
    const listed = allRestaurants().map((r) => r.id);
    expect(listed).not.toContain('osm-nf1');
    expect(listed).not.toContain('osm-nf2');
    expect(listed).toEqual(expect.arrayContaining(['osm-g1', 'osm-nf3', 'osm-x1']));
    const onMap = restaurantsForMap(center).map((r) => r.id);
    expect(onMap).not.toContain('osm-nf1');
    expect(onMap).not.toContain('osm-nf2');
    for (const cat of ['lokanta', 'cafe', 'meyhane'] as const) {
      const ids = restaurantsInCategory(center, cat).items.map((r) => r.id);
      expect(ids).not.toContain('osm-nf1');
      expect(ids).not.toContain('osm-nf2');
    }
  });

  it('is still found by its name, and opens by id', () => {
    expect(allRestaurants(true).map((r) => r.id)).toEqual(
      expect.arrayContaining(['osm-nf1', 'osm-nf2']),
    );
    expect(matchRestaurants('demirkanat', 5, center).map((r) => r.id)).toEqual(['osm-nf1']);
    expect(matchRestaurants('mehmet usta', 5, center).map((r) => r.id)).toEqual(['osm-nf2']);
    expect(getRestaurant('osm-nf1')?.name).toBe('Demirkanat Şarküteri');
  });
});
