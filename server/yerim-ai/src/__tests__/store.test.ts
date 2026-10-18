import { FREE_DAILY } from '../../../../src/lib/ai/protocol';
import { type AiLimits, type KV } from '../quota';
import {
  QuotaCounter,
  localQuota,
  objectQuota,
  runOp,
  storageKV,
  type ObjectStorage,
  type QuotaNamespace,
} from '../store';

/** A KV whose every call yields first, like a real network store: parallel callers interleave. */
function slowKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    store,
    async get(key) {
      await tick();
      return store.get(key) ?? null;
    },
    async put(key, value) {
      await tick();
      store.set(key, value);
    },
  };
}

/** Durable Object storage in memory, also yielding on every call. */
function memoryStorage(): ObjectStorage & { map: Map<string, unknown>; alarm: number | null } {
  const map = new Map<string, unknown>();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const s = {
    map,
    alarm: null as number | null,
    async get<T>(key: string) {
      await tick();
      return map.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      await tick();
      map.set(key, value);
    },
    async delete(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) map.delete(k);
      return true;
    },
    async list<T>(opts: { limit?: number; startAfter?: string } = {}) {
      const keys = [...map.keys()].sort().filter((k) => !opts.startAfter || k > opts.startAfter);
      return new Map(keys.slice(0, opts.limit ?? keys.length).map((k) => [k, map.get(k) as T]));
    },
    async getAlarm() {
      return s.alarm;
    },
    async setAlarm(t: number) {
      s.alarm = t;
    },
  };
  return s;
}

const NOW = new Date('2026-10-16T12:00:00Z');
const limits = (over: Partial<AiLimits> = {}): AiLimits => ({
  global: 10000,
  perIp: 100,
  minIntervalMs: 0,
  ...over,
});
const begin = (i: number, l: AiLimits, device = 'dev-1') => ({
  deviceId: device,
  messageId: `m${i}`,
  callKey: `call:${device}:m${i}`,
  fingerprint: `f${i}`,
  now: NOW,
  limits: l,
});
const accepted = (rs: { conflict: boolean; q?: { ok: boolean } }[]) =>
  rs.filter((r) => !r.conflict && r.q?.ok).length;

describe('the counters cannot be raced', () => {
  it('without one-at-a-time, parallel calls all pass the same check (why the store exists)', async () => {
    const kv = slowKV();
    const out = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        runOp(kv, { op: 'begin', ...begin(i, limits({ global: 1 })), now: NOW.getTime() }),
      ),
    );
    expect(accepted(out as never)).toBeGreaterThan(1);
  });

  it('12 parallel new messages with a global cap of 1: exactly one passes', async () => {
    const quota = localQuota(slowKV());
    const out = await Promise.all(
      Array.from({ length: 12 }, (_, i) => quota.begin(begin(i, limits({ global: 1 })))),
    );
    expect(accepted(out)).toBe(1);
  });

  it('12 parallel new messages from one device: exactly the daily uses pass', async () => {
    const kv = slowKV();
    const quota = localQuota(kv);
    const out = await Promise.all(
      Array.from({ length: 12 }, (_, i) => quota.begin(begin(i, limits()))),
    );
    expect(accepted(out)).toBe(FREE_DAILY);
    expect(await quota.peek('dev-1', NOW)).toBe(0);
  });

  it('two parallel calls over an IP limit of 1: one passes', async () => {
    const quota = localQuota(slowKV());
    const out = await Promise.all([
      quota.ipGuard('1.2.3.4', NOW, 1),
      quota.ipGuard('1.2.3.4', NOW, 1),
    ]);
    expect(out.sort()).toEqual([false, true]);
  });

  it('the same stage with other content is a conflict, even when both arrive at once', async () => {
    const quota = localQuota(slowKV());
    const a = { ...begin(1, limits()), fingerprint: 'first' };
    const b = { ...begin(1, limits()), fingerprint: 'second' };
    const out = await Promise.all([quota.begin(a), quota.begin(b)]);
    expect(out.map((r) => r.conflict).sort()).toEqual([false, true]);
  });

  it('a give-back and a cancel stay idempotent under parallel calls', async () => {
    const quota = localQuota(slowKV());
    await quota.begin(begin(1, limits()));
    const before = await quota.peek('dev-1', NOW);
    await Promise.all([
      quota.release('dev-1', 'm1', NOW),
      quota.release('dev-1', 'm1', NOW),
      quota.cancel('dev-1', 'm1', NOW),
    ]);
    expect(await quota.peek('dev-1', NOW)).toBe(before + 1);
    expect(await quota.releaseIfCancelled('dev-1', 'm1', NOW)).toBe(FREE_DAILY);
  });
});

describe('the quota Durable Object', () => {
  const objectOf = (storage: ObjectStorage) => {
    const counter = new QuotaCounter({ storage });
    const ns: QuotaNamespace = {
      idFromName: () => 'id',
      get: () => ({ fetch: (input, init) => counter.fetch(new Request(input, init)) }),
    };
    return { counter, quota: objectQuota(ns) };
  };

  it('holds the limits over its fetch interface with parallel callers', async () => {
    const { quota } = objectOf(memoryStorage());
    const out = await Promise.all(
      Array.from({ length: 12 }, (_, i) => quota.begin(begin(i, limits({ global: 3 })))),
    );
    expect(accepted(out)).toBe(3);
    expect(await quota.ipGuard('9.9.9.9', NOW, 1)).toBe(true);
    expect(await quota.ipGuard('9.9.9.9', NOW, 1)).toBe(false);
  });

  it('answers 400 to an unreadable body and 500 to an unknown operation', async () => {
    const { counter } = objectOf(memoryStorage());
    expect(
      (await counter.fetch(new Request('https://q/op', { method: 'POST', body: '{' }))).status,
    ).toBe(400);
    const unknown = new Request('https://q/op', { method: 'POST', body: '{"op":"nope"}' });
    expect((await counter.fetch(unknown)).status).toBe(500);
  });

  it('values expire like KV, and the hourly alarm sweeps the old ones', async () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const kv = storageKV(storage, () => now);
    await kv.put('a', '1', { expirationTtl: 60 });
    await kv.put('b', '2', { expirationTtl: 3600 });
    expect(storage.alarm).toBe(1_000_000 + 3_600_000);
    expect(await kv.get('a')).toBe('1');
    now += 61_000;
    expect(await kv.get('a')).toBeNull();
    await kv.put('c', '3', { expirationTtl: 60 });
    now += 3_600_000;
    expect(await kv.sweep()).toBe(2);
    expect([...storage.map.keys()]).toEqual([]);
  });

  it('never extends an expiry: later writes keep the one of the first write', async () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const kv = storageKV(storage, () => now);
    await kv.put('ip:x', '1', { expirationTtl: 172800 });
    now += 47 * 3_600_000;
    await kv.put('ip:x', '2', { expirationTtl: 172800 });
    expect(await kv.get('ip:x')).toBe('2');
    now += 3_600_000;
    // 48 h after the first write, although the last write was an hour ago.
    expect(await kv.get('ip:x')).toBeNull();
    // A shorter TTL on a later write can only bring it forward; an expired key starts over.
    await kv.put('ip:x', '3', { expirationTtl: 3600 });
    await kv.put('ip:x', '4', { expirationTtl: 60 });
    now += 61_000;
    expect(await kv.get('ip:x')).toBeNull();
  });

  it('moves the daily alarm of an older version forward to the hourly one', async () => {
    const storage = memoryStorage();
    storage.alarm = 1_000_000 + 86_400_000;
    const kv = storageKV(storage, () => 1_000_000);
    await kv.put('a', '1');
    expect(storage.alarm).toBe(1_000_000 + 3_600_000);
  });

  it('the alarm sweeps and sets the next one an hour later', async () => {
    const storage = memoryStorage();
    const { counter } = objectOf(storage);
    await counter.alarm();
    expect(storage.alarm).toBeGreaterThan(Date.now() + 3_500_000);
    expect(storage.alarm).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });
});
