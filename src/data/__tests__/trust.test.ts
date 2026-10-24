import '@/i18n';
import { changeLanguage } from 'i18next';

import { formatAge, lacksFreshCounts } from '../freshness';
import { IsparkProvider } from '../isparkProvider';
import { IzmirOpenDataProvider, PROVIDER_TIMEOUT_MS } from '../izmirProvider';
import { loadParkings, RETRY_DELAYS_MS, RETRY_START_LIMIT_MS } from '../repository';
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

  it('formatAge follows the UI language', async () => {
    await changeLanguage('en');
    try {
      expect(formatAge(5 * 60_000)).toBe('5 min');
      expect(formatAge(2 * 3600_000)).toBe('2 h');
      expect(formatAge(26 * 3600_000)).toBe('1 day');
      expect(formatAge(50 * 3600_000)).toBe('2 days');
    } finally {
      await changeLanguage('tr');
    }
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

describe('provider timeout by attempt', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  const hanging = () =>
    jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as unknown as typeof fetch;

  it.each([
    ['İzmir', () => new IzmirOpenDataProvider('https://example.test')],
    ['İSPARK', () => new IsparkProvider('https://example.test')],
  ])('%s waits 45 s on the first attempt and on retries', async (_name, make) => {
    jest.useFakeTimers();
    globalThis.fetch = hanging();
    const provider = make();
    for (const attempt of [0, 1]) {
      const run = expect(provider.list(undefined, attempt)).rejects.toThrow('Zaman aşımı (45 sn)');
      await jest.advanceTimersByTimeAsync(44_000);
      let settled = false;
      void run.then(() => (settled = true));
      await jest.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1_000);
      await run;
    }
  });

  it('still stops when the screen is closed, not as a timeout', async () => {
    globalThis.fetch = hanging();
    const controller = new AbortController();
    const run = new IzmirOpenDataProvider('https://example.test').list(controller.signal, 0);
    controller.abort();
    await expect(run).rejects.toThrow('Aborted');
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

  it('passes the attempt number and stops retrying after two slow attempts', async () => {
    let clock = 0;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const attempts: number[] = [];
    const primary: ParkingProvider = {
      source: 'izmir-open-data',
      list: async (_s, attempt) => {
        attempts.push(attempt ?? -1);
        // A full timeout (45 s) plus the first wait still leaves room for a second attempt.
        clock += 46_000;
        throw new Error('timeout');
      },
    };
    try {
      await loadParkings(primary, undefined, { cache, retryDelaysMs: [0, 0] });
    } finally {
      spy.mockRestore();
    }
    expect(attempts).toEqual([0, 1]);
  });

  it('lets a second attempt start after a first one that ran into its timeout', () => {
    expect(RETRY_START_LIMIT_MS).toBeGreaterThan(PROVIDER_TIMEOUT_MS + RETRY_DELAYS_MS[0]!);
    // ...but a third one cannot start after two full timeouts.
    expect(RETRY_START_LIMIT_MS).toBeLessThan(2 * PROVIDER_TIMEOUT_MS + RETRY_DELAYS_MS[0]!);
  });
});
