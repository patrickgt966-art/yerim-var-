import AsyncStorage from '@react-native-async-storage/async-storage';

import { setActiveCity } from '../cities';
import { deviceCache } from '../cache';
import { getFreshness, visibleFree } from '../freshness';
import { loadParkings, providerFor } from '../repository';
import { toParking, withStatic, type StaticRecord } from '../staticParkings';

const OSM_RECORD: StaticRecord = {
  id: 'osm-antalya-1',
  name: 'Kaleiçi Otopark',
  lat: 36.8969,
  lng: 30.7133,
  capacity: 120,
  isPaid: true,
  isIndoor: null,
  nonstop: null,
  openingHoursText: null,
  operator: null,
  address: null,
  access: null,
  source: 'osm',
};

afterEach(() => setActiveCity('izmir'));

describe('Antalya has no live parking source', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => AsyncStorage.clear());

  it('picks no provider', () => {
    expect(providerFor('antalya')).toBeNull();
  });

  it('loads a static-only result without a network call, an error or a cache entry', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setActiveCity('antalya');
    const res = await loadParkings();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.source).toBe('static-only');
    expect(res.parkings).toEqual([]);
    // No fallbackReason: nothing failed, so no outage banner is shown for it.
    expect(res.fallbackReason).toBeUndefined();
    expect(res.offline).toBeUndefined();
    expect(await deviceCache.load('antalya')).toBeNull();
  });

  it('shows the static car parks with a capacity and never a free count', () => {
    const [p] = withStatic([], [toParking(OSM_RECORD, '2026-10-01T00:00:00.000Z')]);
    expect(p).toMatchObject({ source: 'osm', capacity: 120, free: null });
    expect(getFreshness(p!)).toEqual({ kind: 'noData' });
    expect(visibleFree(p!)).toBeNull();
  });
});
