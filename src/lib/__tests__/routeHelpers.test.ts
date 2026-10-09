import { appleWalkingUrl } from '@/data/geo';
import { migrateAppState } from '@/store/migrate';

describe('appleWalkingUrl', () => {
  it('builds walking directions from park to destination', () => {
    const url = appleWalkingUrl({ lat: 38.4, lng: 27.1 }, { lat: 38.41, lng: 27.12 }, 'Çiğ Köfte');
    expect(url).toBe(
      'https://maps.apple.com/?saddr=38.4,27.1&daddr=38.41,27.12&dirflg=w&q=%C3%87i%C4%9F%20K%C3%B6fte',
    );
  });
  it('omits the query without a name', () => {
    expect(appleWalkingUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toBe(
      'https://maps.apple.com/?saddr=1,2&daddr=3,4&dirflg=w',
    );
  });
});

describe('migrateAppState', () => {
  it('adds an empty restaurant favourites list to v1 state', () => {
    expect(migrateAppState({ onboarded: true, favorites: [] }, 1)).toEqual({
      onboarded: true,
      favorites: [],
      favoriteRestaurants: [],
    });
  });
  it('keeps existing v2 data', () => {
    const s = { favoriteRestaurants: ['a'] };
    expect(migrateAppState(s, 2)).toEqual(s);
  });
  it('passes through non-objects', () => {
    expect(migrateAppState(null, 1)).toBeNull();
  });
});
