import { appleMapsUrl, distanceMeters, walkMinutes } from '../geo';
import { loadParkings } from '../repository';
import { parkingsQuery } from '../useParkings';

import live from './fixtures/izmir-live-2026-10-07.json';
import { estimateCost, tariffFor } from '../tariffs';
import type { ParkingCache } from '../cache';
import type { Parking, ParkingProvider, ParkingResult } from '../types';

describe('geo', () => {
  it('computes plausible distances', () => {
    const d = distanceMeters({ lat: 38.4189, lng: 27.1287 }, { lat: 38.4381, lng: 27.1415 });
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2700);
    expect(walkMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(1);
  });

  it('builds an Apple Maps hand-off URL', () => {
    expect(appleMapsUrl({ lat: 38.1, lng: 27.2 }, 'A B')).toBe(
      'http://maps.apple.com/?daddr=38.1,27.2&dirflg=d&q=A%20B',
    );
  });
});

describe('tariffs', () => {
  it('never reports an unverified tariff as official', () => {
    const t = tariffFor('mock-alsancak-katli');
    expect(t?.priceKind).toBe('estimated');
    expect(tariffFor('nope')).toBeNull();
  });

  it('bills every started hour', () => {
    expect(estimateCost(60, 72)).toBe(120);
    expect(estimateCost(60, 0)).toBe(60);
    expect(estimateCost(null, 30)).toBeNull();
  });
});

describe('loadParkings', () => {
  const fast = { retryDelaysMs: [0, 0] };

  function memoryCache(initial: ParkingResult | null = null): ParkingCache & {
    saved: ParkingResult | null;
  } {
    return {
      saved: initial,
      async load() {
        return this.saved;
      },
      async save(r) {
        this.saved = r;
      },
    };
  }

  function provider(results: (Parking[] | Error)[]): ParkingProvider & { calls: number } {
    return {
      source: 'izmir-open-data',
      calls: 0,
      list() {
        const r = results[Math.min(this.calls++, results.length - 1)];
        return r instanceof Error ? Promise.reject(r) : Promise.resolve(r ?? []);
      },
    };
  }

  const real = { id: 'CPS-TR-IZM-M1-01', name: 'Konak Katlı Otopark' } as Parking;

  it('retries before giving up and saves a good result', async () => {
    const cache = memoryCache();
    const primary = provider([new Error('timeout'), new Error('timeout'), [real]]);
    const res = await loadParkings(primary, undefined, { ...fast, cache });
    expect(primary.calls).toBe(3);
    expect(res.source).toBe('izmir-open-data');
    expect(res.offline).toBeUndefined();
    expect(cache.saved?.parkings).toEqual([real]);
  });

  it('shows the last good result as offline when every attempt fails', async () => {
    const saved: ParkingResult = {
      parkings: [real],
      source: 'izmir-open-data',
      fetchedAt: '2026-10-07T10:00:00.000Z',
    };
    const cache = memoryCache(saved);
    const primary = provider([new Error('HTTP 503')]);
    const res = await loadParkings(primary, undefined, { ...fast, cache });
    expect(primary.calls).toBe(3);
    expect(res).toMatchObject({
      parkings: [real],
      source: 'izmir-open-data',
      offline: true,
      fallbackReason: 'HTTP 503',
      // Keeps the original download time, so the 15 minute rule applies.
      fetchedAt: '2026-10-07T10:00:00.000Z',
    });
  });

  it('falls back to sample data only when nothing was ever saved', async () => {
    const cache = memoryCache();
    const res = await loadParkings(provider([new Error('HTTP 403')]), undefined, {
      ...fast,
      cache,
    });
    expect(res.source).toBe('mock');
    expect(res.fallbackReason).toBe('HTTP 403');
    expect(res.parkings.length).toBeGreaterThan(0);
    expect(res.parkings.every((p) => p.source === 'mock')).toBe(true);
    expect(cache.saved).toBeNull();
  });

  it('stops retrying when the request is cancelled', async () => {
    const controller = new AbortController();
    const primary: ParkingProvider = {
      source: 'izmir-open-data',
      list: () => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      },
    };
    await expect(
      loadParkings(primary, undefined, {
        ...fast,
        cache: memoryCache(),
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
  });
});

describe('parkings query', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('does not read the abort signal, so leaving a screen keeps the download', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => live,
    })) as unknown as typeof fetch;
    const fn = parkingsQuery.queryFn as unknown as (ctx: object) => Promise<unknown>;
    let signalRead = false;
    const ctx = {};
    Object.defineProperty(ctx, 'signal', {
      get() {
        signalRead = true;
        return new AbortController().signal;
      },
    });
    await fn(ctx);
    expect(signalRead).toBe(false);
  });
});
