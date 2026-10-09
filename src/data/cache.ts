import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Parking, ParkingResult } from './types';

const KEY = 'parkings-cache-v1';

/** Stores the last real (non-mock) result on the device only. */
export interface ParkingCache {
  load(): Promise<ParkingResult | null>;
  save(result: ParkingResult): Promise<void>;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || v === undefined || num(v);
const boolOrNull = (v: unknown) => v === null || v === undefined || typeof v === 'boolean';
const strOrNull = (v: unknown) => v === null || v === undefined || typeof v === 'string';

/** A cached record must be safe for the code that ranks and merges it. */
function isParking(v: unknown): v is Parking {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id !== '' &&
    typeof p.name === 'string' &&
    num(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    num(p.lng) &&
    Math.abs(p.lng) <= 180 &&
    typeof p.source === 'string' &&
    p.source !== 'mock' &&
    numOrNull(p.capacity) &&
    numOrNull(p.free) &&
    boolOrNull(p.isIndoor) &&
    boolOrNull(p.isOpen) &&
    boolOrNull(p.isPaid) &&
    boolOrNull(p.nonstop) &&
    strOrNull(p.updatedAt) &&
    typeof p.fetchedAt === 'string'
  );
}

/** Returns the cache with unusable records dropped, or null if nothing usable is left. */
function validResult(v: unknown): ParkingResult | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<ParkingResult>;
  if (
    !Array.isArray(r.parkings) ||
    typeof r.fetchedAt !== 'string' ||
    Number.isNaN(new Date(r.fetchedAt).getTime()) ||
    typeof r.source !== 'string' ||
    r.source === 'mock' ||
    r.source === 'static-only'
  )
    return null;
  const parkings = r.parkings.filter(isParking);
  if (parkings.length === 0) return null;
  return { ...(r as ParkingResult), parkings };
}

export const deviceCache: ParkingCache = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return validResult(parsed);
    } catch {
      return null;
    }
  },
  async save(result) {
    if (result.source === 'mock' || result.source === 'static-only') return;
    const { offline: _offline, fallbackReason: _reason, ...clean } = result;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(clean));
    } catch {
      // A full disk must not break loading; the cache is best effort.
    }
  },
};
