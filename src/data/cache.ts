import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ParkingResult } from './types';

const KEY = 'parkings-cache-v1';

/** Stores the last real (non-mock) result on the device only. */
export interface ParkingCache {
  load(): Promise<ParkingResult | null>;
  save(result: ParkingResult): Promise<void>;
}

function isResult(v: unknown): v is ParkingResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<ParkingResult>;
  return (
    Array.isArray(r.parkings) &&
    typeof r.fetchedAt === 'string' &&
    r.source !== undefined &&
    r.source !== 'mock'
  );
}

export const deviceCache: ParkingCache = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isResult(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  async save(result) {
    if (result.source === 'mock') return;
    const { offline: _offline, fallbackReason: _reason, ...clean } = result;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(clean));
    } catch {
      // A full disk must not break loading; the cache is best effort.
    }
  },
};
