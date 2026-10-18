import { FREE_DAILY } from '../../../../src/lib/ai/protocol';
import {
  MAX_CANCELS_PER_DAY,
  cancelUse,
  peek,
  releaseUse,
  takeCancelMark,
  takeUse,
  wasCancelled,
  type AiLimits,
} from '../quota';

function fakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const T0 = new Date('2026-10-09T10:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const limits: AiLimits = { global: 10000, perIp: 100, minIntervalMs: 1000 };
const free: AiLimits = { ...limits, minIntervalMs: 0 };

describe('one counter for every AI endpoint', () => {
  it('is 10 messages per device per day, the first message included', async () => {
    const kv = fakeKV();
    expect(FREE_DAILY).toBe(10);
    for (let i = 0; i < FREE_DAILY; i++) {
      expect(await takeUse(kv, 'dev', `m${i}`, later(i * 2000), limits)).toEqual({
        ok: true,
        remaining: FREE_DAILY - 1 - i,
        added: true,
      });
    }
    expect(await takeUse(kv, 'dev', 'm10', later(60_000), limits)).toEqual({
      ok: false,
      reason: 'quota',
      remaining: 0,
    });
    // Another device is not affected; the next Istanbul day starts fresh.
    expect((await takeUse(kv, 'other', 'm0', later(60_000), limits)).ok).toBe(true);
    expect((await takeUse(kv, 'dev', 'n0', new Date('2026-10-10T10:00:00Z'), limits)).ok).toBe(
      true,
    );
  });

  it('understand + pick + plan of one messageId are one use', async () => {
    const kv = fakeKV();
    const first = await takeUse(kv, 'dev', 'msg-1', T0, limits);
    expect(first).toEqual({ ok: true, remaining: 9, added: true });
    // /pick and /plan come at once: no interval, no second charge, no second global count.
    expect(await takeUse(kv, 'dev', 'msg-1', later(10), limits)).toEqual({
      ok: true,
      remaining: 9,
      added: false,
    });
    expect(await takeUse(kv, 'dev', 'msg-1', later(20), limits)).toEqual({
      ok: true,
      remaining: 9,
      added: false,
    });
    expect(await peek(kv, 'dev', T0)).toBe(9);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
  });

  it('a follow-up call of a counted message still passes when the device is at its limit', async () => {
    const kv = fakeKV();
    for (let i = 0; i < FREE_DAILY; i++) await takeUse(kv, 'dev', `m${i}`, later(i * 2000), free);
    expect((await takeUse(kv, 'dev', 'm9', later(99_000), free)).ok).toBe(true);
    expect((await takeUse(kv, 'dev', 'm10', later(99_000), free)).ok).toBe(false);
  });

  it('the global cap counts every message across devices and endpoints, then stops with "global"', async () => {
    const kv = fakeKV();
    const small = { ...free, global: 3 };
    for (const d of ['a', 'b', 'c']) expect((await takeUse(kv, d, 'm1', T0, small)).ok).toBe(true);
    expect(await takeUse(kv, 'd', 'm1', T0, small)).toEqual({
      ok: false,
      reason: 'global',
      remaining: 10,
    });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('3');
    // A message that is already counted still gets its pick / plan.
    expect((await takeUse(kv, 'a', 'm1', T0, small)).ok).toBe(true);
    // The cap resets with the (Istanbul) day.
    expect((await takeUse(kv, 'd', 'm1', new Date('2026-10-10T10:00:00Z'), small)).ok).toBe(true);
  });

  it('rejects a second new message within the interval with "slow", without counting it', async () => {
    const kv = fakeKV();
    expect((await takeUse(kv, 'dev', 'm1', T0, limits)).ok).toBe(true);
    expect(await takeUse(kv, 'dev', 'm2', later(999), limits)).toEqual({
      ok: false,
      reason: 'slow',
      remaining: 9,
    });
    expect(await peek(kv, 'dev', T0)).toBe(9);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
    expect((await takeUse(kv, 'dev', 'm2', later(1000), limits)).ok).toBe(true);
    // Another device is not slowed down by it.
    expect((await takeUse(kv, 'other', 'm1', later(1001), limits)).ok).toBe(true);
  });

  it('the interval does not touch a counted message (its pick right after understand)', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', T0, limits);
    expect((await takeUse(kv, 'dev', 'm1', later(5), limits)).ok).toBe(true);
  });
});

describe('refunds', () => {
  it('releaseUse gives the use and the global count back, once', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', T0, free);
    await takeUse(kv, 'dev', 'm2', T0, free);
    expect(await releaseUse(kv, 'dev', 'm2', T0)).toEqual({ removed: true, remaining: 9 });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
    // Idempotent: the second call changes nothing and never goes below zero.
    expect(await releaseUse(kv, 'dev', 'm2', T0)).toEqual({ removed: false, remaining: 9 });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
    expect(await releaseUse(kv, 'dev', 'unknown', T0)).toEqual({ removed: false, remaining: 9 });
  });

  it('frees the slot of a failed call at both caps', async () => {
    const kv = fakeKV();
    const one = { ...free, global: 1 };
    expect((await takeUse(kv, 'dev', 'm1', T0, one)).ok).toBe(true);
    expect((await takeUse(kv, 'dev2', 'm1', T0, one)).ok).toBe(false);
    await releaseUse(kv, 'dev', 'm1', T0);
    expect((await takeUse(kv, 'dev2', 'm1', T0, one)).ok).toBe(true);
  });
});

describe('cancel (the app gave up waiting)', () => {
  it('after the call finished: refunds the charged use, and a repeat does nothing', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', T0, free);
    expect(await cancelUse(kv, 'dev', 'm1', later(7000))).toEqual({ removed: true, remaining: 10 });
    expect(await peek(kv, 'dev', T0)).toBe(10);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('0');
    expect(await cancelUse(kv, 'dev', 'm1', later(7100))).toEqual({
      removed: false,
      remaining: 10,
    });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('0');
  });

  it('before the call finished: refunds now and marks the message, so the running handler sees it without refunding twice', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', T0, free);
    await takeUse(kv, 'dev', 'm2', T0, free);
    expect(await wasCancelled(kv, 'dev', 'm1')).toBe(false);
    await cancelUse(kv, 'dev', 'm1', later(6000));
    expect(await wasCancelled(kv, 'dev', 'm1')).toBe(true);
    expect(await wasCancelled(kv, 'dev', 'm2')).toBe(false);
    // The handler finishes: it learns the client left, and nothing is released twice.
    expect(await takeCancelMark(kv, 'dev', 'm1', later(9000))).toBe(9);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
    expect(await wasCancelled(kv, 'dev', 'm1')).toBe(false);
  });

  it('before the handler even charged: the mark is there, the late charge is released at the end', async () => {
    const kv = fakeKV();
    expect(await cancelUse(kv, 'dev', 'm1', T0)).toEqual({ removed: false, remaining: 10 });
    await takeUse(kv, 'dev', 'm1', later(50), free);
    expect(await wasCancelled(kv, 'dev', 'm1')).toBe(true);
    expect(await takeCancelMark(kv, 'dev', 'm1', later(2000))).toBe(10);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('0');
    expect(await takeCancelMark(kv, 'dev', 'm1', later(2100))).toBeNull();
  });

  it('one cancel gives one refund: later calls with the cancelled messageId are charged and kept', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', T0, free);
    await takeCancelMark(kv, 'dev', 'm1', T0);
    expect((await cancelUse(kv, 'dev', 'm1', later(1000))).remaining).toBe(10);
    // A repeated cancel does not refund again.
    await takeUse(kv, 'dev', 'm1', later(2000), free);
    expect((await cancelUse(kv, 'dev', 'm1', later(2100))).removed).toBe(false);
    // The same message sent again is charged; its handler uses the mark up, without a refund.
    expect(await takeCancelMark(kv, 'dev', 'm1', later(3000))).toBe(9);
    for (let i = 0; i < 3; i++) {
      expect((await takeUse(kv, 'dev', 'm1', later(4000 + i), free)).ok).toBe(true);
      expect(await takeCancelMark(kv, 'dev', 'm1', later(4000 + i))).toBeNull();
    }
    expect(await peek(kv, 'dev', later(5000))).toBe(9);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
  });

  it('refunds at most MAX_CANCELS_PER_DAY messages a day per device', async () => {
    const kv = fakeKV();
    for (let i = 0; i < MAX_CANCELS_PER_DAY + 1; i++) await takeUse(kv, 'dev', `m${i}`, T0, free);
    for (let i = 0; i < MAX_CANCELS_PER_DAY; i++) {
      expect((await cancelUse(kv, 'dev', `m${i}`, T0)).removed).toBe(true);
    }
    expect((await cancelUse(kv, 'dev', `m${MAX_CANCELS_PER_DAY}`, T0)).removed).toBe(false);
    expect(await wasCancelled(kv, 'dev', `m${MAX_CANCELS_PER_DAY}`)).toBe(false);
    expect(await peek(kv, 'dev', T0)).toBe(10 - 1);
  });
});

describe('a message across Istanbul midnight', () => {
  // 00:00 in Istanbul is 21:00 UTC.
  const before = new Date('2026-10-09T20:59:59.500Z');
  const after = new Date('2026-10-09T21:00:00.200Z');

  it('its later stages are free on the next day, even within the interval', async () => {
    const kv = fakeKV();
    expect((await takeUse(kv, 'dev', 'm1', before, limits)).remaining).toBe(9);
    expect(await takeUse(kv, 'dev', 'm1', after, limits)).toEqual({
      ok: true,
      remaining: 10,
      added: false,
    });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('1');
    expect(kv.store.get('ai:global:2026-10-10')).toBeUndefined();
    expect(await peek(kv, 'dev', after)).toBe(10);
  });

  it('a cancel after midnight refunds the day it was charged on', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', before, free);
    expect(await cancelUse(kv, 'dev', 'm1', after)).toEqual({ removed: true, remaining: 10 });
    expect(await peek(kv, 'dev', before)).toBe(10);
    expect(kv.store.get('ai:global:2026-10-09')).toBe('0');
    // The handler that started before midnight still finds the mark.
    expect(await takeCancelMark(kv, 'dev', 'm1', before)).toBe(10);
  });

  it('an outage refund after midnight also goes to that day', async () => {
    const kv = fakeKV();
    await takeUse(kv, 'dev', 'm1', before, free);
    await takeUse(kv, 'dev', 'm2', after, free);
    expect(await releaseUse(kv, 'dev', 'm1', after)).toEqual({ removed: true, remaining: 9 });
    expect(kv.store.get('ai:global:2026-10-09')).toBe('0');
    expect(kv.store.get('ai:global:2026-10-10')).toBe('1');
  });
});
