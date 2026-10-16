import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp } from '@/store/app';
import {
  activeCity,
  CITIES,
  cityById,
  cityExamples,
  hasLiveParking,
  isInCityArea,
  setActiveCity,
} from '../cities';
import { distanceMeters } from '../geo';
import { parseQuery } from '../intent';
import { cleanName } from '../names';
import { isInIzmirArea, isNearRail } from '../places';
import { providerFor, loadParkings } from '../repository';
import { allRestaurants, getRestaurant } from '../restaurants';
import { searchPlaces } from '../search';
import { staticParkings } from '../staticParkings';
import { addStatic, STATIC_ONLY_PLACEHOLDER } from '../useParkings';
import { deviceCache } from '../cache';
import { IsparkProvider } from '../isparkProvider';
import { IzmirOpenDataProvider } from '../izmirProvider';
import type { Parking, ParkingResult } from '../types';

import sample from './fixtures/ispark-sample.json';

const SARAYBURNU = { lat: 41.0136, lng: 28.9503 };
const KONAK = { lat: 38.4189, lng: 27.1287 };

/** The invariant in İstanbul: every hit lies in İstanbul and none is near İzmir's Konak. */
const expectOnlyIstanbul = (query: string) => {
  const istanbul = cityById('istanbul');
  for (const p of searchPlaces(query)) {
    expect(isInCityArea(p, istanbul)).toBe(true);
    expect(distanceMeters(p, KONAK)).toBeGreaterThan(50_000);
  }
};

afterEach(() => {
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir' });
});

describe('active city', () => {
  it('starts on izmir and follows setActiveCity', () => {
    expect(activeCity().id).toBe('izmir');
    setActiveCity('istanbul');
    expect(activeCity().id).toBe('istanbul');
    expect(activeCity().center).toEqual({ lat: 41.0082, lng: 28.9784 });
  });

  it('ignores unknown and unavailable cities', () => {
    setActiveCity('antalya');
    expect(activeCity().id).toBe('izmir');
    setActiveCity('atlantis');
    expect(activeCity().id).toBe('izmir');
    expect(cityById('antalya').available).toBe(false);
  });

  it('opens ankara with its 25 districts and no live parking', () => {
    const ank = cityById('ankara');
    expect(ank).toMatchObject({
      available: true,
      parkingSource: 'osm',
      parkingAttribution: 'OpenStreetMap',
      locative: "Ankara'da",
    });
    expect(ank.districts).toHaveLength(25);
    expect(ank.districtCenters.map((d) => d.name)).toEqual([...ank.districts]);
    expect(hasLiveParking(ank)).toBe(false);
    expect(hasLiveParking(cityById('izmir'))).toBe(true);
    expect(hasLiveParking(cityById('istanbul'))).toBe(true);
    for (const d of ank.districtCenters) expect(isInCityArea(d, ank)).toBe(true);
    expect(cityExamples(ank).bLoc).toBe("Çankaya'da");
    expect(cityExamples(ank).dLoc).toBe("Bahçelievler'de");
  });

  it('opens istanbul with its 39 districts', () => {
    const ist = cityById('istanbul');
    expect(ist).toMatchObject({ available: true, parkingSource: 'ispark' });
    expect(ist.districts).toHaveLength(39);
    expect(ist.districtCenters.map((d) => d.name)).toEqual([...ist.districts]);
    expect(CITIES.filter((c) => c.available).map((c) => c.id)).toEqual([
      'izmir',
      'istanbul',
      'ankara',
    ]);
  });

  it('the store keeps the data layer in step', () => {
    useApp.getState().setCity('istanbul');
    expect(useApp.getState().city).toBe('istanbul');
    expect(activeCity().id).toBe('istanbul');
    useApp.getState().setCity('antalya');
    expect(useApp.getState().city).toBe('istanbul');
    expect(activeCity().id).toBe('istanbul');
  });
});

describe('isInCityArea', () => {
  it('uses the active city by default', () => {
    expect(isInCityArea(KONAK)).toBe(true);
    expect(isInCityArea(SARAYBURNU)).toBe(false);
    setActiveCity('istanbul');
    expect(isInCityArea(SARAYBURNU)).toBe(true);
    expect(isInCityArea(KONAK)).toBe(false);
  });

  it('takes an explicit city and respects the box, radius and west coast', () => {
    const ist = cityById('istanbul');
    expect(isInCityArea({ lat: 41.175, lng: 29.613 }, ist)).toBe(true); // Şile
    expect(isInCityArea({ lat: 41.9, lng: 28.9 }, ist)).toBe(false); // north of the box
    expect(isInCityArea({ lat: 40.7, lng: 29.0 }, ist)).toBe(false); // south of the box
    // Inside İzmir's box, but in the Aegean west of the coast.
    expect(isInCityArea({ lat: 38.4, lng: 26.3 }, cityById('izmir'))).toBe(false);
  });

  it('keeps isInIzmirArea fixed to izmir', () => {
    setActiveCity('istanbul');
    expect(isInIzmirArea(KONAK)).toBe(true);
    expect(isInIzmirArea(SARAYBURNU)).toBe(false);
  });
});

describe('per-city data never leaks', () => {
  it('serves izmir restaurants only while izmir is active', () => {
    const izmirList = allRestaurants();
    expect(izmirList.length).toBeGreaterThan(1000);
    const id = izmirList[0]!.id;
    setActiveCity('istanbul');
    const istList = allRestaurants();
    const istanbul = cityById('istanbul');
    expect(istList.length).toBeGreaterThan(0);
    expect(istList.every((r) => isInCityArea(r, istanbul))).toBe(true);
    const izmirIds = new Set(izmirList.map((r) => r.id));
    expect(istList.some((r) => izmirIds.has(r.id))).toBe(false);
    expect(getRestaurant(id)).toBeNull();
    setActiveCity('izmir');
    // Memoized per city: the same list comes back.
    expect(allRestaurants()).toBe(izmirList);
    expect(getRestaurant(id)?.id).toBe(id);
  });

  it('serves izmir places, rail and car parks only while izmir is active', () => {
    expect(searchPlaces('alsancak').length).toBeGreaterThan(0);
    expect(staticParkings().length).toBeGreaterThan(0);
    expect(isNearRail({ lat: 38.4381, lng: 27.1415 }, 100_000)).toBe(true);
    setActiveCity('istanbul');
    expect(searchPlaces('alsancak')).toEqual([]);
    expectOnlyIstanbul('saat kulesi');
    const istParkings = staticParkings();
    expect(istParkings.length).toBeGreaterThan(0);
    expect(istParkings.every((p) => isInCityArea(p, cityById('istanbul')))).toBe(true);
    expect(isNearRail({ lat: 38.4381, lng: 27.1415 }, 100_000)).toBe(false);
    setActiveCity('izmir');
    expect(searchPlaces('alsancak').length).toBeGreaterThan(0);
  });

  it('drops the popular and curated places of izmir in istanbul', () => {
    expect(searchPlaces('konak')[0]?.lat).toBeCloseTo(KONAK.lat, 1);
    setActiveCity('istanbul');
    expectOnlyIstanbul('konak');
  });
});

describe('addStatic', () => {
  it('does not serve one city its placeholder merge from another', () => {
    const izmirMerge = addStatic(STATIC_ONLY_PLACEHOLDER);
    expect(izmirMerge.parkings.length).toBeGreaterThan(0);
    setActiveCity('istanbul');
    const istParkings = addStatic(STATIC_ONLY_PLACEHOLDER).parkings;
    const izmirIds = new Set(izmirMerge.parkings.map((p) => p.id));
    expect(istParkings.every((p) => isInCityArea(p, cityById('istanbul')))).toBe(true);
    expect(istParkings.some((p) => izmirIds.has(p.id))).toBe(false);
    setActiveCity('izmir');
    expect(addStatic(STATIC_ONLY_PLACEHOLDER)).toEqual(izmirMerge);
  });
});

describe('districts and names follow the city', () => {
  it('parses an istanbul district', () => {
    setActiveCity('istanbul');
    const it1 = parseQuery("Kadıköy'de balık");
    expect(it1).toMatchObject({ kind: 'search', cat: 'fish', placeQuery: '' });
    expect(it1.kind === 'search' && it1.district?.name).toBe('Kadıköy');
    const it2 = parseQuery('kadıköyde balık');
    expect(it2.kind === 'search' && it2.district?.name).toBe('Kadıköy');
  });

  it('parses ankara districts', () => {
    setActiveCity('ankara');
    const it1 = parseQuery("Kızılay'da döner");
    expect(it1.kind).toBe('search');
    const it2 = parseQuery("Çankaya'da otopark");
    expect(it2.kind === 'search' && it2.district?.name).toBe('Çankaya');
    const it3 = parseQuery('kecioren kebap');
    expect(it3.kind === 'search' && it3.district?.name).toBe('Keçiören');
    const it4 = parseQuery('Bornova kebap');
    expect(it4.kind === 'search' && it4.district).toBeNull();
  });

  it('does not know the districts of another city', () => {
    setActiveCity('istanbul');
    const it1 = parseQuery('Bornova kebap');
    expect(it1.kind === 'search' && it1.district).toBeNull();
    setActiveCity('izmir');
    const it2 = parseQuery('Kadıköy balık');
    expect(it2.kind === 'search' && it2.district).toBeNull();
  });

  it('keeps the izmir typo fix to izmir', () => {
    const typo = parseQuery('bornava balık');
    expect(typo.kind === 'search' && typo.district?.name).toBe('Bornova');
    setActiveCity('istanbul');
    const near = parseQuery('kadikoi balık');
    expect(near.kind === 'search' && near.district).toBeNull();
  });

  it('strips the trailing name of the active city only', () => {
    expect(cleanName('Pişiricisi, Bostanlı-İzmir')).toBe('Pişiricisi, Bostanlı');
    expect(cleanName('Balıkçı Kadıköy İstanbul')).toBe('Balıkçı Kadıköy İstanbul');
    setActiveCity('istanbul');
    expect(cleanName('Balıkçı Kadıköy İstanbul')).toBe('Balıkçı Kadıköy');
    expect(cleanName('Çiya, Istanbul')).toBe('Çiya');
    expect(cleanName('Sarraf İstanbul')).toBe('Sarraf İstanbul');
    expect(cleanName('Bergama izmir')).toBe('Bergama İzmir');
  });
});

describe('repository picks the provider per city', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    return AsyncStorage.clear();
  });

  const fast = { retryDelaysMs: [0, 0] };

  it('maps the city to its provider', () => {
    expect(providerFor('izmir')).toBeInstanceOf(IzmirOpenDataProvider);
    expect(providerFor('istanbul')).toBeInstanceOf(IsparkProvider);
  });

  it('downloads istanbul from İSPARK and caches it under istanbul', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => sample }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setActiveCity('istanbul');
    const res = await loadParkings(undefined, undefined, fast);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('api.ibb.gov.tr/ispark');
    expect(res.source).toBe('ispark');
    expect(res.parkings).toHaveLength(4);
    expect((await deviceCache.load('istanbul'))?.source).toBe('ispark');
    expect(await deviceCache.load('izmir')).toBeNull();
  });

  it('an explicit cityId wins over the active city', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => sample }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await loadParkings(undefined, undefined, { ...fast, cityId: 'istanbul' });
    expect(res.source).toBe('ispark');
    expect(await deviceCache.load('istanbul')).not.toBeNull();
  });

  it("never shows izmir's saved car parks in istanbul", async () => {
    const parking: Parking = {
      id: 'p1',
      name: 'Konak Katlı',
      lat: 38.4,
      lng: 27.1,
      capacity: 100,
      free: 10,
      isIndoor: null,
      isOpen: null,
      isPaid: null,
      nonstop: null,
      openingHours: null,
      address: null,
      source: 'izmir-open-data',
      updatedAt: null,
      fetchedAt: '2026-10-07T10:00:00.000Z',
      occupancyKind: 'estimated',
    };
    const saved: ParkingResult = {
      parkings: [parking],
      source: 'izmir-open-data',
      fetchedAt: '2026-10-07T10:00:00.000Z',
    };
    await deviceCache.save(saved, 'izmir');
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    setActiveCity('istanbul');
    // No İstanbul cache, no İzmir sample pins: an empty list that carries the error.
    const res = await loadParkings(undefined, undefined, fast);
    expect(res).toMatchObject({ parkings: [], source: 'static-only', fallbackReason: 'HTTP 503' });
    // The same failure in izmir still shows the saved list.
    setActiveCity('izmir');
    const back = await loadParkings(undefined, undefined, fast);
    expect(back).toMatchObject({ source: 'izmir-open-data', offline: true });
  });

  it('falls back to the sample pins in izmir only', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    expect((await loadParkings(undefined, undefined, fast)).source).toBe('mock');
  });
});
