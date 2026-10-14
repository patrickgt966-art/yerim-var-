import { CHAT_HISTORY_LIMIT, MAX_CHAT_CHARS } from '../../../../src/lib/ai/protocol';
import { AI_DEFAULTS, aiLimits, ipGuard, validChat } from '../quota';

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
    expect(
      validChat({ ...good, history: Array(CHAT_HISTORY_LIMIT + 1).fill(turn) })?.history,
    ).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(validChat({ ...good, history: [{ role: 'system', text: 'a' }] })).toBeNull();
    expect(
      validChat({ ...good, history: [{ role: 'user', text: 'x'.repeat(301) }] })?.history,
    ).toEqual([{ role: 'user', text: 'x'.repeat(MAX_CHAT_CHARS) }]);
    expect(validChat({ ...good, history: 'x' })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: 2, kind: 'cafe' } })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: -1, kind: 'parking' } })).toBeNull();
    expect(validChat({ ...good, lastCards: { count: 50, kind: 'parking' } })).toBeNull();
    expect(validChat({ ...good, lastCards: 'x' })).toBeNull();
  });
});

describe('aiLimits', () => {
  it('uses the defaults when nothing is set', () => {
    expect(aiLimits({})).toEqual(AI_DEFAULTS);
    expect(AI_DEFAULTS).toEqual({ global: 10000, perIp: 100, minIntervalMs: 1000 });
  });

  it('reads the vars and ignores invalid ones', () => {
    expect(
      aiLimits({ AI_GLOBAL_DAILY: '20', AI_DAILY_PER_IP: '7', CHAT_MIN_INTERVAL_MS: '0' }),
    ).toEqual({ global: 20, perIp: 7, minIntervalMs: 0 });
    expect(aiLimits({ AI_GLOBAL_DAILY: '-3', AI_DAILY_PER_IP: '' })).toEqual(AI_DEFAULTS);
  });

  it('reads the former CHAT_GLOBAL_DAILY when AI_GLOBAL_DAILY is not set (or empty)', () => {
    expect(aiLimits({ CHAT_GLOBAL_DAILY: '50' }).global).toBe(50);
    expect(aiLimits({ AI_GLOBAL_DAILY: '', CHAT_GLOBAL_DAILY: '50' }).global).toBe(50);
    // The new name wins when both are set.
    expect(aiLimits({ AI_GLOBAL_DAILY: '7', CHAT_GLOBAL_DAILY: '50' }).global).toBe(7);
  });
});

describe('the per-IP guard is configurable and counts every AI call', () => {
  it('stops at the configured max', async () => {
    const kv = fakeKV();
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', T0, 2)).toBe(false);
    expect(await ipGuard(kv, '5.6.7.8', T0, 2)).toBe(true);
  });
});
