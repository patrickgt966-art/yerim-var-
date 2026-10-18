import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp } from '@/store/app';
import {
  activeCity,
  CITIES,
  cityById,
  cityExamples,
  hasLiveParking,
  isAvailableCity,
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
    setActiveCity('atlantis');
    expect(activeCity().id).toBe('izmir');
    expect(isAvailableCity('atlantis')).toBe(false);
    expect(cityById('atlantis').id).toBe('izmir');
    // A city that is not open yet is ignored too (all five are open today).
    const antalya = cityById('antalya');
    antalya.available = false;
    try {
      setActiveCity('antalya');
      expect(activeCity().id).toBe('izmir');
      expect(isAvailableCity('antalya')).toBe(false);
    } finally {
      antalya.available = true;
    }
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

  it('opens bursa with its 17 districts and no live parking', () => {
    const bur = cityById('bursa');
    expect(bur).toMatchObject({
      available: true,
      parkingSource: 'osm',
      parkingAttribution: 'OpenStreetMap',
      locative: "Bursa'da",
      center: { lat: 40.1885, lng: 29.061 },
    });
    expect(bur.districts).toHaveLength(17);
    expect(bur.districtCenters.map((d) => d.name)).toEqual([...bur.districts]);
    expect(hasLiveParking(bur)).toBe(false);
    for (const d of bur.districtCenters) expect(isInCityArea(d, bur)).toBe(true);
    // Province corners stay inside; Balıkesir, İstanbul and the Marmara are outside.
    expect(isInCityArea({ lat: 39.6, lng: 28.3 }, bur)).toBe(true);
    expect(isInCityArea({ lat: 40.6, lng: 29.95 }, bur)).toBe(true);
    expect(isInCityArea({ lat: 39.65, lng: 27.9 }, bur)).toBe(false);
    expect(isInCityArea({ lat: 41.0082, lng: 28.9784 }, bur)).toBe(false);
    expect(cityExamples(bur)).toMatchObject({
      aLoc: "Nilüfer'de",
      bLoc: "Osmangazi'de",
      cLoc: "Mudanya'da",
      dLoc: "Görükle'de",
    });
  });

  it('opens antalya with its 19 districts and no live parking', () => {
    const ant = cityById('antalya');
    expect(ant).toMatchObject({
      available: true,
      parkingSource: 'osm',
      parkingAttribution: 'OpenStreetMap',
      locative: "Antalya'da",
      center: { lat: 36.8969, lng: 30.7133 },
    });
    expect(ant.districts).toHaveLength(19);
    expect(ant.districtCenters.map((d) => d.name)).toEqual([...ant.districts]);
    expect(hasLiveParking(ant)).toBe(false);
    for (const d of ant.districtCenters) expect(isInCityArea(d, ant)).toBe(true);
    // Province corners stay inside; Muğla, Konya, İstanbul and the open sea are outside.
    expect(isInCityArea({ lat: 36.05, lng: 32.6 }, ant)).toBe(true); // Gazipaşa coast
    expect(isInCityArea({ lat: 37.5, lng: 29.4 }, ant)).toBe(true);
    expect(isInCityArea({ lat: 36.8, lng: 29.0 }, ant)).toBe(false);
    expect(isInCityArea({ lat: 38.0, lng: 32.0 }, ant)).toBe(false);
    expect(isInCityArea({ lat: 35.5, lng: 30.7 }, ant)).toBe(false);
    expect(isInCityArea({ lat: 41.0082, lng: 28.9784 }, ant)).toBe(false);
    expect(cityExamples(ant)).toMatchObject({
      aLoc: "Konyaaltı'nda",
      bLoc: "Lara'da",
      cLoc: "Kaleiçi'nde",
      dLoc: "Muratpaşa'da",
    });
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
      'antalya',
      'bursa',
    ]);
    // All five cities are open: no city is left for the "Yakında" badge (its code path stays).
    expect(CITIES.every((c) => c.available)).toBe(true);
  });

  it('the store keeps the data layer in step', () => {
    useApp.getState().setCity('istanbul');
    expect(useApp.getState().city).toBe('istanbul');
    expect(activeCity().id).toBe('istanbul');
    useApp.getState().setCity('atlantis');
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

  it('parses bursa districts', () => {
    setActiveCity('bursa');
    const it1 = parseQuery("Nilüfer'de iskender");
    expect(it1.kind === 'search' && it1.district?.name).toBe('Nilüfer');
    const it2 = parseQuery("Mudanya'da balık");
    expect(it2.kind === 'search' && it2.district?.name).toBe('Mudanya');
    const it3 = parseQuery('osmangazi otopark');
    expect(it3.kind === 'search' && it3.district?.name).toBe('Osmangazi');
    const it4 = parseQuery('Bornova kebap');
    expect(it4.kind === 'search' && it4.district).toBeNull();
  });

  it('parses antalya districts', () => {
    setActiveCity('antalya');
    const it1 = parseQuery("Konyaaltı'nda balık");
    expect(it1.kind === 'search' && it1.district?.name).toBe('Konyaaltı');
    const it2 = parseQuery("Muratpaşa'da kebap");
    expect(it2.kind === 'search' && it2.district?.name).toBe('Muratpaşa');
    const it3 = parseQuery('alanya otopark');
    expect(it3.kind === 'search' && it3.district?.name).toBe('Alanya');
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

describe('province outlines hold the bundled data', () => {
  type Row = { a?: number; o?: number; lat?: number; lng?: number };
  const points = (file: { items?: Row[]; parkings?: Row[] }) =>
    [...(file.items ?? []), ...(file.parkings ?? [])].map((r) => ({
      lat: (r.lat ?? r.a)!,
      lng: (r.lng ?? r.o)!,
    }));
  const outside = (city: string, files: { items?: Row[]; parkings?: Row[] }[]) =>
    files.flatMap(points).filter((p) => !isInCityArea(p, cityById(city)));

  it('keeps Çeşme-Dalyan and western Karaburun inside İzmir', () => {
    const izmir = cityById('izmir');
    expect(isInCityArea({ lat: 38.3619, lng: 26.2881 }, izmir)).toBe(true); // Dalyan
    expect(isInCityArea({ lat: 38.48412, lng: 26.42632 }, izmir)).toBe(true); // Karareis
    expect(isInCityArea({ lat: 38.37, lng: 26.14 }, izmir)).toBe(false); // Chios town
    expect(isInCityArea({ lat: 38.52, lng: 26.25 }, izmir)).toBe(false); // Oinousses
    expect(
      outside('izmir', [
        require('../../../data/parkings-static.json'),
        require('../../../data/places-izmir.json'),
        require('../../../data/rail-izmir.json'),
        require('../../../data/food-izmir.json'),
        require('../../../data/food-overture-izmir.json'),
      ]),
    ).toEqual([]);
  });

  it('keeps western Karacabey inside Bursa', () => {
    expect(isInCityArea({ lat: 40.24172, lng: 28.21009 }, cityById('bursa'))).toBe(true); // Dağkadı
    expect(
      outside('bursa', [
        require('../../../data/parkings-static-bursa.json'),
        require('../../../data/places-bursa.json'),
        require('../../../data/rail-bursa.json'),
        require('../../../data/food-bursa.json'),
        require('../../../data/food-overture-bursa.json'),
      ]),
    ).toEqual([]);
  });
});
