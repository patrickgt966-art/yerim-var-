import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import { deviceCache } from '../cache';
import type { Parking, ParkingResult } from '../types';
import { PARKINGS_QUERY_KEY, primeParkingsFromCache, warmUpParkings } from '../useParkings';

import live from './fixtures/izmir-live-2026-10-07.json';

const parking: Parking = {
  id: 'p1',
  name: 'Test',
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

const result: ParkingResult = {
  parkings: [parking],
  source: 'izmir-open-data',
  fetchedAt: '2026-10-07T10:00:00.000Z',
};

describe('deviceCache', () => {
  beforeEach(() => AsyncStorage.clear());

  it('round-trips a real result without the offline flags', async () => {
    await deviceCache.save({ ...result, offline: true, fallbackReason: 'x' });
    expect(await deviceCache.load()).toEqual(result);
  });

  it('never stores sample data', async () => {
    await deviceCache.save({ ...result, source: 'mock' });
    expect(await deviceCache.load()).toBeNull();
  });

  it('ignores corrupt entries', async () => {
    await AsyncStorage.setItem('parkings-cache-v1', '{not json');
    expect(await deviceCache.load()).toBeNull();
  });
});

describe('deviceCache validation', () => {
  beforeEach(() => AsyncStorage.clear());
  const put = (v: unknown) => AsyncStorage.setItem('parkings-cache-v1', JSON.stringify(v));

  it('drops unusable records and keeps the good ones', async () => {
    await put({
      ...result,
      parkings: [
        null,
        42,
        { ...parking, id: 7 },
        { ...parking, id: 'nan', lat: null },
        { ...parking, id: 'far', lat: 200 },
        { ...parking, id: 'str', free: '3' },
        { ...parking, id: 'nosrc', source: undefined },
        parking,
      ],
    });
    expect((await deviceCache.load())?.parkings.map((p) => p.id)).toEqual(['p1']);
  });
  it('treats a cache with no usable record as no cache', async () => {
    await put({ ...result, parkings: [null] });
    expect(await deviceCache.load()).toBeNull();
    await put({ ...result, parkings: [] });
    expect(await deviceCache.load()).toBeNull();
  });
  it('rejects an unparsable fetchedAt and static-only results', async () => {
    await put({ ...result, fetchedAt: 'yesterday' });
    expect(await deviceCache.load()).toBeNull();
    await put({ ...result, source: 'static-only' });
    expect(await deviceCache.load()).toBeNull();
  });
});

describe('primeParkingsFromCache', () => {
  it('shows saved data at once but still downloads fresh data', async () => {
    await deviceCache.save(result);
    const client = new QueryClient();
    await primeParkingsFromCache(client);
    const state = client.getQueryState(PARKINGS_QUERY_KEY);
    expect(state?.data).toEqual(result);
    // updatedAt 0 marks it stale, so the first screen still fetches.
    expect(state?.dataUpdatedAt).toBe(0);
    client.clear();
  });

  it('does not overwrite data that already arrived', async () => {
    await deviceCache.save(result);
    const client = new QueryClient();
    const fresh = { ...result, fetchedAt: '2026-10-07T11:00:00.000Z' };
    client.setQueryData(PARKINGS_QUERY_KEY, fresh);
    await primeParkingsFromCache(client);
    expect(client.getQueryData(PARKINGS_QUERY_KEY)).toEqual(fresh);
    client.clear();
  });
});

describe('warmUpParkings', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('downloads at launch, before any screen asks for the data', async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => live,
    })) as unknown as typeof fetch;
    const client = new QueryClient();
    await warmUpParkings(client);
    const data = client.getQueryData<ParkingResult>(PARKINGS_QUERY_KEY);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(data?.source).toBe('izmir-open-data');
    expect(data?.parkings).toHaveLength(live.length);
    // The result is saved for the next launch.
    expect((await deviceCache.load())?.parkings).toHaveLength(live.length);
    client.clear();
  });
});
