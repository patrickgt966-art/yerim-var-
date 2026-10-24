import { deviceCache, type ParkingCache } from './cache';
import { activeCity, cityById } from './cities';
import { IsparkProvider } from './isparkProvider';
import { IzmirOpenDataProvider } from './izmirProvider';
import { MockProvider } from './mockProvider';
import type { ParkingProvider, ParkingResult } from './types';

/** Waits before the 2nd and 3rd attempt: up to 3 attempts in total. */
export const RETRY_DELAYS_MS = [1000, 3000];

/**
 * No new attempt starts once this much time has passed. It is longer than a first attempt that
 * ran into its timeout plus the first wait (45 s + 1 s), so a second attempt still starts; a
 * third never does, so a dead API costs at most ~45 s + 1 s + 45 s before the cache fallback.
 */
export const RETRY_START_LIMIT_MS = 50_000;

export type LoadOptions = {
  signal?: AbortSignal;
  cache?: ParkingCache;
  retryDelaysMs?: number[];
  /** City to load; defaults to the active one. Fixed at the start, so a switch mid-load cannot mix cities. */
  cityId?: string;
};

/**
 * The live provider of a city; null for a city without a live API (Ankara, Bursa, Antalya: bundled car parks
 * only). Cities not open yet fall back to İzmir's.
 */
export function providerFor(cityId: string): ParkingProvider | null {
  switch (cityById(cityId).id) {
    case 'istanbul':
      return new IsparkProvider();
    case 'ankara':
    case 'bursa':
    case 'antalya':
      return null;
    default:
      return new IzmirOpenDataProvider();
  }
}

/** Only İzmir has sample data; elsewhere nothing is shown instead of another city's pins. */
function fallbackFor(cityId: string): ParkingProvider | null {
  return cityById(cityId).id === 'izmir' ? new MockProvider() : null;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}

/**
 * Loads parkings in this order:
 * 1. the primary provider, retried with RETRY_DELAYS_MS;
 * 2. the last good result saved on the device, flagged `offline`;
 * 3. sample data, flagged by `source: 'mock'` ("Deneme bilgisi gösteriliyor"), for İzmir
 *    only; other cities get an empty 'static-only' result carrying the error.
 * The provider and the device cache follow the city (the active one by default). A city without a
 * live provider (Ankara) gets an empty 'static-only' result without an error.
 */
export async function loadParkings(
  primary?: ParkingProvider,
  fallback?: ParkingProvider | null,
  {
    signal,
    cache = deviceCache,
    retryDelaysMs = RETRY_DELAYS_MS,
    cityId = activeCity().id,
  }: LoadOptions = {},
): Promise<ParkingResult> {
  const city = cityById(cityId);
  const source = primary ?? providerFor(city.id);
  // No live API in this city: the bundled car parks are all there is, and that is not a failure
  // (no fallbackReason, so no outage banner). Nothing to cache either.
  if (!source) {
    return { parkings: [], source: 'static-only', fetchedAt: new Date().toISOString() };
  }
  const sample = fallback === undefined ? fallbackFor(city.id) : fallback;
  let error: unknown;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) {
      if (Date.now() - startedAt >= RETRY_START_LIMIT_MS) break;
      await wait(retryDelaysMs[attempt - 1] ?? 0, signal);
    }
    try {
      const parkings = await source.list(signal, attempt);
      const result: ParkingResult = {
        parkings,
        source: source.source,
        fetchedAt: new Date().toISOString(),
      };
      await cache.save(result, city.id);
      return result;
    } catch (e) {
      error = e;
      // A cancelled query (screen closed) must not keep retrying.
      if (signal?.aborted) throw e;
    }
  }

  const reason = error instanceof Error ? error.message : String(error);
  // Shows up in the `expo start` terminal during development only.
  if (__DEV__) console.warn(`[yerim-var] ${city.name} verisi alınamadı: ${reason}`);
  const cached = await cache.load(city.id);
  if (cached) {
    // Keep the record of why: Profil shows it. The next good download clears it.
    const lastFailure = { reason, at: new Date().toISOString() };
    await cache.save({ ...cached, lastFailure }, city.id);
    return { ...cached, offline: true, fallbackReason: reason, lastFailure };
  }

  if (!sample) {
    return {
      parkings: [],
      source: 'static-only',
      fetchedAt: new Date().toISOString(),
      fallbackReason: reason,
    };
  }
  const parkings = await sample.list(signal);
  return {
    parkings,
    source: sample.source,
    fetchedAt: new Date().toISOString(),
    fallbackReason: reason,
  };
}
