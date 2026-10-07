import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import { deviceCache } from '../cache';
import type { ParkingResult } from '../types';
import { PARKINGS_QUERY_KEY, primeParkingsFromCache } from '../useParkings';

const result: ParkingResult = {
  parkings: [],
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
