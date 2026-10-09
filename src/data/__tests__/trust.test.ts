import { formatAge, lacksFreshCounts } from '../freshness';
import { IzmirOpenDataProvider } from '../izmirProvider';
import { loadParkings } from '../repository';
import { hasRealTariffs } from '../tariffs';
import type { ParkingCache } from '../cache';
import type { Parking, ParkingProvider } from '../types';
import { LIVE_PREFERENCE_METERS, preferLive } from '../useParkings';

const r = (id: string, source: string, distance: number) => ({ id, source, distance });

describe('preferLive', () => {
  it('moves a nearby live car park ahead of static ones', () => {
    const out = preferLive([
      r('o1', 'osm', 50),
      r('o2', 'osm', 100),
      r('l1', 'izmir-open-data', 300),
      r('o3', 'osm', 320),
    ]);
    expect(out.map((x) => x.id)).toEqual(['l1', 'o1', 'o2', 'o3']);
  });

  it('leaves a far live car park where it was', () => {
    const list = [r('o1', 'osm', 50), r('l1', 'izmir-open-data', 50 + LIVE_PREFERENCE_METERS + 1)];
    expect(preferLive(list).map((x) => x.id)).toEqual(['o1', 'l1']);
  });

  it('does nothing when the nearest is live, or the list is empty', () => {
    const list = [r('l1', 'izmir-open-data', 10), r('o1', 'osm', 20)];
    expect(preferLive(list)).toBe(list);
    expect(preferLive([])).toEqual([]);
  });
});

describe('tariffs and freshness helpers', () => {
  it('hasRealTariffs ignores mock parkings and unknown ids', () => {
    const tariffs = [{ parkingId: 'A' }];
    expect(hasRealTariffs([{ id: 'A', source: 'mock' }], tariffs)).toBe(false);
    expect(hasRealTariffs([{ id: 'B', source: 'izmir-open-data' }], tariffs)).toBe(false);
    expect(hasRealTariffs([{ id: 'A', source: 'izmir-open-data' }], tariffs)).toBe(true);
  });

  it('hasRealTariffs is false for the bundled mock-only tariffs', () => {
    expect(hasRealTariffs([{ id: 'CPS-TR-IZM-M1-01', source: 'izmir-open-data' }])).toBe(false);
  });

  it('formatAge', () => {
    expect(formatAge(5 * 60_000)).toBe('5 dk');
    expect(formatAge(2 * 3600_000)).toBe('2 sa');
    expect(formatAge(50 * 3600_000)).toBe('2 gün');
  });

  it('lacksFreshCounts is true when only stale or static data exists', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const stale = { source: 'izmir-open-data', free: 5, fetchedAt: '2026-10-09T10:00:00Z' };
    const fresh = { ...stale, fetchedAt: '2026-10-09T11:55:00Z' };
    const osm = { source: 'osm', free: null, fetchedAt: null };
    expect(lacksFreshCounts([stale, osm] as unknown as Parking[], now)).toBe(true);
    expect(lacksFreshCounts([stale, fresh] as unknown as Parking[], now)).toBe(false);
    expect(lacksFreshCounts([], now)).toBe(false);
    expect(lacksFreshCounts([osm] as unknown as Parking[], now)).toBe(false);
  });
});

describe('IzmirOpenDataProvider timeout by attempt', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  it('uses 20 s for the first attempt and 30 s for retries', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as unknown as typeof fetch;
    const provider = new IzmirOpenDataProvider('https://example.test');
    const first = expect(provider.list(undefined, 0)).rejects.toThrow('Zaman aşımı (20 sn)');
    await jest.advanceTimersByTimeAsync(20_000);
    await first;
    const retry = expect(provider.list(undefined, 1)).rejects.toThrow('Zaman aşımı (30 sn)');
    await jest.advanceTimersByTimeAsync(29_000);
    let settled = false;
    void retry.then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1_000);
    await retry;
  });
});

describe('loadParkings retry limit', () => {
  const cache: ParkingCache = { load: async () => null, save: async () => {} };

  it('runs all 3 attempts when failures are fast', async () => {
    const attempts: number[] = [];
    const primary: ParkingProvider = {
      source: 'izmir-open-data',
      list: async (_s, attempt) => {
        attempts.push(attempt ?? -1);
        throw new Error('HTTP 500');
      },
    };
    await loadParkings(primary, undefined, { cache, retryDelaysMs: [0, 0] });
    expect(attempts).toEqual([0, 1, 2]);
  });

  it('passes the attempt number and stops retrying after a slow first attempts', async () => {
    jest.useFakeTimers({ now: 0 });
    const attempts: number[] = [];
    const primary: ParkingProvider = {
      source: 'izmir-open-data',
      list: async (_s, attempt) => {
        attempts.push(attempt ?? -1);
        jest.setSystemTime(Date.now() + 31_000);
        throw new Error('timeout');
      },
    };
    await loadParkings(primary, undefined, { cache, retryDelaysMs: [0, 0] });
    jest.useRealTimers();
    expect(attempts).toEqual([0]);
  });
});
