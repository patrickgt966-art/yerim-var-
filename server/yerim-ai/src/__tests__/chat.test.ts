import { CHAT_HISTORY_LIMIT, MAX_CHAT_CHARS } from '../../../../src/lib/ai/protocol';
import {
  CHAT_DEFAULTS,
  chatCharge,
  chatLimits,
  chatRefund,
  ipGuard,
  validChat,
  type ChatLimits,
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
const limits: ChatLimits = { perDevice: 15, global: 10000, perIp: 100, minIntervalMs: 1000 };

const good = { deviceId: 'dev-1', messageId: 'm1', text: 'iyi günler', history: [] };

describe('validChat', () => {
  it('accepts a text with up to four turns and optional lastCards', () => {
    expect(validChat(good)).toEqual(good);
    const full = {
      ...good,
      history: [
        { role: 'user', text: 'selam' },
        { role: 'bot', text: 'Selam!' },
      ],
      lastCards: { count: 3, kind: 'restaurant' },
    };
    expect(validChat(full)).toEqual(full);
  });

  it('rejects bad ids, empty or long text, long history, bad roles and bad lastCards', () => {
    expect(validChat(null)).toBeNull();
    expect(validChat({ ...good, deviceId: 'a b' })).toBeNull();
    expect(validChat({ ...good, messageId: '' })).toBeNull();
    expect(validChat({ ...good, text: '' })).toBeNull();
    expect(validChat({ ...good, text: 'x'.repeat(MAX_CHAT_CHARS + 1) })).toBeNull();
    expect(validChat({ ...good, text: 'x'.repeat(MAX_CHAT_CHARS) })).not.toBeNull();
    const turn = { role: 'user', text: 'a' };
    expect(validChat({ ...good, history: Array(CHAT_HISTORY_LIMIT).fill(turn) })).not.toBeNull();
    expect(validChat({ ...good, history: Array(CHAT_HISTORY_LIMIT + 1).fill(turn) })).toBeNull();
    expect(validChat({ ...good, history: [{ role: 'system', text: 'a' }] })).toBeNull();
    expect(validChat({ ...good, history: [{ role: 'user', text: 'x'.repeat(301) }] })).toBeNull();
    expect(validChat({ ...good, history: 'x' })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: 2, kind: 'cafe' } })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: -1, kind: 'parking' } })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: 50, kind: 'parking' } })).toBeNull();
    expect(validChat({ ...good, lastCards: 'x' })).toBeNull();
  });
});

describe('chatLimits', () => {
  it('uses the defaults when nothing is set', () => {
    expect(chatLimits({})).toEqual(CHAT_DEFAULTS);
    expect(CHAT_DEFAULTS).toEqual(limits);
  });

  it('reads the vars and ignores invalid ones', () => {
    expect(
      chatLimits({
        CHAT_DAILY_PER_DEVICE: '5',
        CHAT_GLOBAL_DAILY: '20',
        AI_DAILY_PER_IP: '7',
        CHAT_MIN_INTERVAL_MS: '0',
      }),
    ).toEqual({ perDevice: 5, global: 20, perIp: 7, minIntervalMs: 0 });
    expect(
      chatLimits({ CHAT_DAILY_PER_DEVICE: 'abc', CHAT_GLOBAL_DAILY: '-3', AI_DAILY_PER_IP: '' }),
    ).toEqual(CHAT_DEFAULTS);
  });
});

describe('chatCharge', () => {
  it('allows 15 replies per device per day, then stops with "device"', async () => {
    const kv = fakeKV();
    for (let i = 0; i < 15; i++) {
      expect(await chatCharge(kv, 'dev', later(i * 2000), limits)).toEqual({ ok: true });
    }
    expect(await chatCharge(kv, 'dev', later(40_000), limits)).toEqual({
      ok: false,
      reason: 'device',
    });
    // Another device is not affected; the next day starts fresh.
    expect(await chatCharge(kv, 'other', later(40_000), limits)).toEqual({ ok: true });
    const tomorrow = new Date('2026-10-10T10:00:00Z');
    expect(await chatCharge(kv, 'dev', tomorrow, limits)).toEqual({ ok: true });
  });

  it('does not touch the ✨ counter', async () => {
    const kv = fakeKV();
    await chatCharge(kv, 'dev', T0, limits);
    expect([...kv.store.keys()].some((k) => k.startsWith('q:'))).toBe(false);
  });

  it('stops at the global cap with "global", across devices', async () => {
    const kv = fakeKV();
    const small = { ...limits, global: 3 };
    for (const d of ['a', 'b', 'c'])
      expect(await chatCharge(kv, d, T0, small)).toEqual({ ok: true });
    expect(await chatCharge(kv, 'd', T0, small)).toEqual({ ok: false, reason: 'global' });
    expect(kv.store.get('chat:global:2026-10-09')).toBe('3');
    // The global counter resets with the (Istanbul) day.
    expect(await chatCharge(kv, 'd', new Date('2026-10-10T10:00:00Z'), small)).toEqual({
      ok: true,
    });
  });

  it('rejects a second call within the minimum interval with "slow", without counting it', async () => {
    const kv = fakeKV();
    expect(await chatCharge(kv, 'dev', T0, limits)).toEqual({ ok: true });
    expect(await chatCharge(kv, 'dev', later(999), limits)).toEqual({ ok: false, reason: 'slow' });
    expect(kv.store.get('chat:2026-10-09:dev')).toBe('1');
    expect(kv.store.get('chat:global:2026-10-09')).toBe('1');
    expect(await chatCharge(kv, 'dev', later(1000), limits)).toEqual({ ok: true });
    // Another device is not slowed down by it.
    expect(await chatCharge(kv, 'other', later(1001), limits)).toEqual({ ok: true });
  });

  it('honours a configured limit', async () => {
    const kv = fakeKV();
    const two = { ...limits, perDevice: 2, minIntervalMs: 0 };
    expect(await chatCharge(kv, 'dev', T0, two)).toEqual({ ok: true });
    expect(await chatCharge(kv, 'dev', T0, two)).toEqual({ ok: true });
    expect(await chatCharge(kv, 'dev', T0, two)).toEqual({ ok: false, reason: 'device' });
  });
});

describe('chatRefund', () => {
  it('gives the device and global counters back, never below zero', async () => {
    const kv = fakeKV();
    await chatCharge(kv, 'dev', T0, limits);
    await chatCharge(kv, 'dev', later(2000), limits);
    await chatRefund(kv, 'dev', later(2000));
    expect(kv.store.get('chat:2026-10-09:dev')).toBe('1');
    expect(kv.store.get('chat:global:2026-10-09')).toBe('1');
    await chatRefund(kv, 'dev', T0);
    await chatRefund(kv, 'dev', T0);
    expect(kv.store.get('chat:2026-10-09:dev')).toBe('0');
    expect(kv.store.get('chat:global:2026-10-09')).toBe('0');
  });

  it('frees the slot of a failed call at the cap', async () => {
    const kv = fakeKV();
    const one = { ...limits, perDevice: 1, global: 1, minIntervalMs: 0 };
    expect(await chatCharge(kv, 'dev', T0, one)).toEqual({ ok: true });
    expect((await chatCharge(kv, 'dev', T0, one)).ok).toBe(false);
    await chatRefund(kv, 'dev', T0);
    expect(await chatCharge(kv, 'dev', T0, one)).toEqual({ ok: true });
  });
});

describe('the per-IP guard is configurable and counts /chat calls', () => {
  it('stops at the configured max', async () => {
    const kv = fakeKV();
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(false);
    expect(await ipGuard(kv, '5.6.7.8', T0, 2)).toBe(true);
  });
});
