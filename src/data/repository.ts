import { deviceCache, type ParkingCache } from './cache';
import { IzmirOpenDataProvider } from './izmirProvider';
import { MockProvider } from './mockProvider';
import type { ParkingProvider, ParkingResult } from './types';

/** Waits before the 2nd and 3rd attempt: up to 3 attempts in total. */
export const RETRY_DELAYS_MS = [1000, 3000];

/**
 * No new attempt starts once this much time has passed, so a slow API costs
 * at most ~20 s + 1 s + 30 s before the cache fallback (not ~94 s).
 */
export const RETRY_START_LIMIT_MS = 30_000;

export type LoadOptions = {
  signal?: AbortSignal;
  cache?: ParkingCache;
  retryDelaysMs?: number[];
};

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
 * 3. sample data, flagged by `source: 'mock'` ("Deneme bilgisi gösteriliyor").
 */
export async function loadParkings(
  primary: ParkingProvider = new IzmirOpenDataProvider(),
  fallback: ParkingProvider = new MockProvider(),
  { signal, cache = deviceCache, retryDelaysMs = RETRY_DELAYS_MS }: LoadOptions = {},
): Promise<ParkingResult> {
  let error: unknown;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) {
      if (Date.now() - startedAt >= RETRY_START_LIMIT_MS) break;
      await wait(retryDelaysMs[attempt - 1] ?? 0, signal);
    }
    try {
      const parkings = await primary.list(signal, attempt);
      const result: ParkingResult = {
        parkings,
        source: primary.source,
        fetchedAt: new Date().toISOString(),
      };
      await cache.save(result);
      return result;
    } catch (e) {
      error = e;
      // A cancelled query (screen closed) must not keep retrying.
      if (signal?.aborted) throw e;
    }
  }

  const reason = error instanceof Error ? error.message : String(error);
  // Shows up in the `expo start` terminal during development only.
  if (__DEV__) console.warn(`[yerim-var] İzmir verisi alınamadı: ${reason}`);
  const cached = await cache.load();
  if (cached) return { ...cached, offline: true, fallbackReason: reason };

  const parkings = await fallback.list(signal);
  return {
    parkings,
    source: fallback.source,
    fetchedAt: new Date().toISOString(),
    fallbackReason: reason,
  };
}
