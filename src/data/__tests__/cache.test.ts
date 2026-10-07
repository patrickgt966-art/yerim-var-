import AsyncStorage from '@react-native-async-storage/async-storage';

import { deviceCache } from '../cache';
import type { ParkingResult } from '../types';

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
