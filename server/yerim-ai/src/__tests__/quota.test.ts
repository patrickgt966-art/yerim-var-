import { HISTORY_LIMIT, MAX_MESSAGE_CHARS } from '../../../../src/lib/ai/protocol';
import { charge, ipGuard, toMessages, validNarrate, validUnderstand } from '../quota';

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

const DAY1 = new Date('2026-10-09T10:00:00Z');
const DAY2 = new Date('2026-10-10T10:00:00Z');

describe('charge', () => {
  it('counts distinct messageIds', async () => {
    const kv = fakeKV();
    expect(await charge(kv, 'dev', 'm1', 5, DAY1)).toEqual({ allowed: true, remaining: 4 });
    expect(await charge(kv, 'dev', 'm2', 5, DAY1)).toEqual({ allowed: true, remaining: 3 });
  });

  it('does not double-charge the same messageId', async () => {
    const kv = fakeKV();
    await charge(kv, 'dev', 'm1', 5, DAY1);
    expect(await charge(kv, 'dev', 'm1', 5, DAY1)).toEqual({ allowed: true, remaining: 4 });
  });

  it('blocks at the limit', async () => {
    const kv = fakeKV();
    await charge(kv, 'dev', 'm1', 2, DAY1);
    await charge(kv, 'dev', 'm2', 2, DAY1);
    expect(await charge(kv, 'dev', 'm3', 2, DAY1)).toEqual({ allowed: false, remaining: 0 });
    expect((await charge(kv, 'dev', 'm2', 2, DAY1)).allowed).toBe(true);
  });

  it('resets on a new Istanbul day', async () => {
    const kv = fakeKV();
    await charge(kv, 'dev', 'm1', 1, DAY1);
    expect((await charge(kv, 'dev', 'm2', 1, DAY1)).allowed).toBe(false);
    expect(await charge(kv, 'dev', 'm2', 1, DAY2)).toEqual({ allowed: true, remaining: 0 });
  });

  it('survives corrupt JSON', async () => {
    const kv = fakeKV();
    kv.store.set('q:2026-10-09:dev', '{not json');
    expect(await charge(kv, 'dev', 'm1', 5, DAY1)).toEqual({ allowed: true, remaining: 4 });
  });
});

describe('ipGuard', () => {
  it('blocks after max', async () => {
    const kv = fakeKV();
    expect(await ipGuard(kv, '1.2.3.4', DAY1, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', DAY1, 2)).toBe(true);
    expect(await ipGuard(kv, '1.2.3.4', DAY1, 2)).toBe(false);
    expect(await ipGuard(kv, '5.6.7.8', DAY1, 2)).toBe(true);
  });
});

describe('validUnderstand', () => {
  const ok = { deviceId: 'dev-1', messageId: 'm_1', text: 'merhaba', history: [], section: 'park' };

  it('accepts a valid body', () => {
    expect(validUnderstand(ok)).not.toBeNull();
  });

  it('rejects long text', () => {
    expect(validUnderstand({ ...ok, text: 'a'.repeat(MAX_MESSAGE_CHARS + 1) })).toBeNull();
  });

  it('rejects bad ids', () => {
    expect(validUnderstand({ ...ok, deviceId: 'bad id!' })).toBeNull();
    expect(validUnderstand({ ...ok, messageId: '' })).toBeNull();
    expect(validUnderstand({ ...ok, deviceId: 'a'.repeat(65) })).toBeNull();
  });

  it('rejects more than the history limit', () => {
    const history = Array.from({ length: HISTORY_LIMIT + 1 }, () => ({ role: 'user', text: 'x' }));
    expect(validUnderstand({ ...ok, history })).toBeNull();
  });
});

describe('validNarrate', () => {
  it('rejects non-numeric result fields', () => {
    const body = {
      deviceId: 'd',
      messageId: 'm',
      text: 't',
      where: 'Alsancak',
      what: 'balik',
      total: 1,
      withParking: 0,
      results: [{ n: 1, kind: 'restaurant', distanceM: 'far', parkingM: null }],
    };
    expect(validNarrate(body)).toBeNull();
  });

  const base = {
    deviceId: 'd',
    messageId: 'm',
    text: 't',
    where: 'Alsancak',
    what: 'balik',
    total: 1,
    withParking: 1,
  };

  it('passes the optional fact fields through and drops unknown extras', () => {
    const result = {
      n: 1,
      kind: 'restaurant',
      distanceM: 120,
      parkingM: 80,
      cat: 'Köfte',
      open: 'unknown',
      parkingPaid: null,
      parkingFree: 12,
      name: 'Secret Place',
    };
    const out = validNarrate({ ...base, results: [result] });
    expect(out?.results).toEqual([
      {
        n: 1,
        kind: 'restaurant',
        distanceM: 120,
        parkingM: 80,
        cat: 'Köfte',
        open: 'unknown',
        parkingPaid: null,
        parkingFree: 12,
      },
    ]);
  });

  it('still accepts results without the optional fields', () => {
    const out = validNarrate({
      ...base,
      results: [{ n: 1, kind: 'parking', distanceM: 5, parkingM: null }],
    });
    expect(out?.results).toEqual([{ n: 1, kind: 'parking', distanceM: 5, parkingM: null }]);
  });

  it('rejects invalid optional fields', () => {
    const r = { n: 1, kind: 'restaurant', distanceM: 120, parkingM: null };
    expect(validNarrate({ ...base, results: [{ ...r, open: 'maybe' }] })).toBeNull();
    expect(validNarrate({ ...base, results: [{ ...r, cat: 'x'.repeat(21) }] })).toBeNull();
    expect(validNarrate({ ...base, results: [{ ...r, parkingFree: -1 }] })).toBeNull();
    expect(validNarrate({ ...base, results: [{ ...r, parkingFree: 1.5 }] })).toBeNull();
    expect(validNarrate({ ...base, results: [{ ...r, parkingPaid: 'yes' }] })).toBeNull();
  });
});

describe('toMessages', () => {
  it('drops a leading bot turn and appends the new text', () => {
    const out = toMessages(
      [
        { role: 'bot', text: 'selam' },
        { role: 'user', text: 'a' },
        { role: 'bot', text: 'b' },
      ],
      'c',
    );
    expect(out).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
  });
});
