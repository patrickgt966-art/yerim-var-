import { activeCity, cityAt, cityById, setActiveCity } from '@/data/cities';

import { useApp } from '../app';

const KONAK = { lat: 38.4189, lng: 27.1287 };
const SARAYBURNU = { lat: 41.0136, lng: 28.9503 };
const ANKARA = { lat: 39.9334, lng: 32.8597 };
const BURSA = { lat: 40.1826, lng: 29.0665 };
const ANTALYA = { lat: 36.8969, lng: 30.7133 };

beforeEach(() => {
  setActiveCity('izmir');
  useApp.setState({
    city: 'izmir',
    recentSearches: [],
    favorites: [],
    favoriteRestaurants: [],
    home: null,
    work: null,
  });
});

describe('setCity', () => {
  it("drops the recent searches of the old city and keeps the user's own places", () => {
    const fav = { id: 'p1', name: 'Otopark', lat: 38.4, lng: 27.1 };
    const home = { label: 'Ev', lat: 38.4, lng: 27.1 };
    useApp.setState({
      recentSearches: ['Alsancak otopark'],
      favorites: [fav],
      favoriteRestaurants: ['r1'],
      home,
    });
    useApp.getState().setCity('istanbul');
    const s = useApp.getState();
    expect(s.city).toBe('istanbul');
    expect(activeCity().id).toBe('istanbul');
    expect(s.recentSearches).toEqual([]);
    expect(s.favorites).toEqual([fav]);
    expect(s.favoriteRestaurants).toEqual(['r1']);
    expect(s.home).toEqual(home);
  });

  it('keeps the searches when the city does not change', () => {
    useApp.setState({ recentSearches: ['Alsancak otopark'] });
    useApp.getState().setCity('izmir');
    expect(useApp.getState().recentSearches).toEqual(['Alsancak otopark']);
  });

  it('ignores a city that is not open', () => {
    useApp.setState({ recentSearches: ['Alsancak otopark'] });
    useApp.getState().setCity('atlantis');
    expect(useApp.getState().city).toBe('izmir');
    expect(useApp.getState().recentSearches).toEqual(['Alsancak otopark']);
  });
});

it('setCity switches to ankara', () => {
  useApp.getState().setCity('ankara');
  expect(useApp.getState().city).toBe('ankara');
  expect(activeCity().id).toBe('ankara');
});

it('setCity switches to antalya', () => {
  useApp.getState().setCity('antalya');
  expect(useApp.getState().city).toBe('antalya');
  expect(activeCity().id).toBe('antalya');
});

it('setCity switches to bursa', () => {
  useApp.getState().setCity('bursa');
  expect(useApp.getState().city).toBe('bursa');
  expect(activeCity().id).toBe('bursa');
});

describe('cityAt', () => {
  it('finds the open city around a point', () => {
    expect(cityAt(KONAK)?.id).toBe('izmir');
    expect(cityAt(SARAYBURNU)?.id).toBe('istanbul');
    expect(cityAt(ANKARA)?.id).toBe('ankara');
    expect(cityAt(BURSA)?.id).toBe('bursa');
    expect(cityAt(ANTALYA)?.id).toBe('antalya');
  });

  it('finds nothing outside every open city or at sea', () => {
    expect(cityAt({ lat: 38.4, lng: 33.0 })).toBeUndefined(); // Konya plain, between Ankara and Antalya
    expect(cityAt({ lat: 0, lng: 0 })).toBeUndefined();
  });
});

describe('city names', () => {
  it('carry the Turkish locative per city', () => {
    expect(cityById('izmir').locative).toBe("İzmir'de");
    expect(cityById('istanbul').locative).toBe("İstanbul'da");
    expect(cityById('ankara').locative).toBe("Ankara'da");
    expect(cityById('bursa').locative).toBe("Bursa'da");
    expect(cityById('antalya').locative).toBe("Antalya'da");
  });
});
