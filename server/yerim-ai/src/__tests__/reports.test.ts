// Place reports: anonymous, capped, and a place is hidden only after distinct devices say closed.
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: class {} }), { virtual: true });
jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }), {
  virtual: true,
});

import worker, { type Env } from '../index';
import { REPORTS_PER_DEVICE_DAILY, validReport } from '../reports';

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

const envOf = (kv: ReturnType<typeof fakeKV>) =>
  ({ QUOTA: kv, ANTHROPIC_API_KEY: 'k' }) as unknown as Env;

const report = (env: Env, body: Record<string, unknown>, ip = '1.1.1.1') =>
  worker.fetch(
    new Request('https://w.test/report', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': ip },
      body: JSON.stringify({ city: 'izmir', place: 'food', placeId: 'osm-n1', ...body }),
    }),
    env,
  );

const hidden = async (env: Env, city = 'izmir') => {
  const res = await worker.fetch(new Request(`https://w.test/hidden?city=${city}`), env);
  return {
    status: res.status,
    body: (await res.json()) as { city?: string; ids?: string[]; flagged?: string[] },
  };
};

describe('validReport', () => {
  const ok = {
    deviceId: 'd1',
    placeId: 'apple-38.41234,27.12345',
    place: 'parking',
    kind: 'closed',
    city: 'izmir',
  };
  it('accepts a well-formed report', () => {
    expect(validReport(ok)).toEqual(ok);
  });
  it.each([
    { kind: 'spam' },
    { place: 'cafe' },
    { city: 'paris' },
    { placeId: 'a b' },
    { placeId: 'x'.repeat(81) },
    { deviceId: '' },
  ])('rejects %p', (bad) => {
    expect(validReport({ ...ok, ...bad })).toBeNull();
  });
});

const DAY1 = new Date('2026-10-18T09:00:00Z');
const DAY2 = new Date('2026-10-19T09:00:00Z');
const at = (d: Date) => jest.setSystemTime(d);

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

const admin = (env: Env, path: string, init: RequestInit = {}, token = 'sekret') =>
  worker.fetch(
    new Request(`https://w.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '7.7.7.7' },
    }),
    env,
  );

describe('/report and /hidden', () => {
  it('flags a place after three networks on two days say closed, never hides it', async () => {
    const env = envOf(fakeKV());
    at(DAY1);
    await report(env, { deviceId: 'a', kind: 'closed' }, '1.1.1.1');
    await report(env, { deviceId: 'b', kind: 'closed' }, '2.2.2.2');
    // Three networks, but all on one day: not yet.
    const sameDay = await report(env, { deviceId: 'c', kind: 'closed' }, '3.3.3.3');
    expect(await sameDay.json()).toEqual({ ok: true, flagged: false });
    at(DAY2);
    const next = await report(env, { deviceId: 'd', kind: 'closed' }, '4.4.4.4');
    expect(await next.json()).toEqual({ ok: true, flagged: true });
    expect((await hidden(env)).body).toEqual({ city: 'izmir', ids: [], flagged: ['osm-n1'] });
    expect((await hidden(env, 'ankara')).body).toEqual({ city: 'ankara', ids: [], flagged: [] });
  });

  it('counts one network once: reinstalls behind one Wi-Fi or carrier block do nothing', async () => {
    const env = envOf(fakeKV());
    for (const [i, d] of ['a', 'b', 'c', 'd', 'e'].entries()) {
      at(i % 2 ? DAY2 : DAY1);
      // The same /24, a new device id each time (a reinstall).
      await report(env, { deviceId: d, kind: 'closed' }, `5.5.5.${i + 1}`);
    }
    expect((await hidden(env)).body.flagged).toEqual([]);
  });

  it('never flags on wrong location or wrong info', async () => {
    const env = envOf(fakeKV());
    for (const [i, d] of ['a', 'b', 'c', 'd'].entries()) {
      at(i % 2 ? DAY2 : DAY1);
      await report(env, { deviceId: d, kind: 'info' }, `${i + 1}.0.0.1`);
    }
    expect((await hidden(env)).body.flagged).toEqual([]);
  });

  it('stores no device id or address in the clear', async () => {
    const kv = fakeKV();
    at(DAY1);
    await report(envOf(kv), { deviceId: 'my-device-123', kind: 'closed' }, '203.0.113.9');
    // The anti-abuse IP counter ("ip:" keys, gone within 49 h) is the only place the address is.
    const kept = [...kv.store].filter(([k]) => !k.startsWith('ip:'));
    expect(kept.length).toBeGreaterThan(0);
    const all = kept.flat().join(' ');
    expect(all).not.toContain('my-device-123');
    expect(all).not.toContain('203.0.113');
  });

  it('caps reports per device per day', async () => {
    const env = envOf(fakeKV());
    at(DAY1);
    for (let i = 0; i < REPORTS_PER_DEVICE_DAILY; i++) {
      const res = await report(
        env,
        { deviceId: 'a', kind: 'info', placeId: `osm-n${i}` },
        `9.9.${i}.1`,
      );
      expect(res.status).toBe(200);
    }
    expect((await report(env, { deviceId: 'a', kind: 'info' }, '8.8.8.8')).status).toBe(429);
  });

  it('rejects bad requests', async () => {
    const env = envOf(fakeKV());
    expect((await report(env, { deviceId: 'a', kind: 'nope' })).status).toBe(400);
    expect((await hidden(env, 'paris')).status).toBe(400);
  });
});

describe('/admin', () => {
  const flagIt = async (env: Env) => {
    for (const [i, d] of ['a', 'b', 'c'].entries()) {
      at(i ? DAY2 : DAY1);
      await report(env, { deviceId: d, kind: 'closed' }, `${i + 1}.1.1.1`);
    }
  };

  it('does not exist without ADMIN_TOKEN and refuses a wrong token', async () => {
    const kv = fakeKV();
    expect((await admin(envOf(kv), '/admin/flagged?city=izmir')).status).toBe(404);
    const env = { ...envOf(kv), ADMIN_TOKEN: 'sekret' } as Env;
    expect((await admin(env, '/admin/flagged?city=izmir', {}, 'wrong')).status).toBe(401);
    expect((await admin(env, '/admin/flagged?city=izmir', {}, '')).status).toBe(401);
  });

  it('lists flagged places; hide hides them for everyone, keep clears the reports', async () => {
    const env = { ...envOf(fakeKV()), ADMIN_TOKEN: 'sekret' } as Env;
    await flagIt(env);
    const list = await admin(env, '/admin/flagged?city=izmir');
    expect(await list.json()).toEqual({
      city: 'izmir',
      places: [
        {
          placeId: 'osm-n1',
          place: 'food',
          closedNetworks: 3,
          closedDays: 2,
          location: 0,
          info: 0,
          hidden: false,
        },
      ],
    });
    const review = (action: string) =>
      admin(env, '/admin/review', {
        method: 'POST',
        body: JSON.stringify({ city: 'izmir', placeId: 'osm-n1', action }),
      });
    expect((await review('hide')).status).toBe(200);
    expect((await hidden(env)).body).toEqual({ city: 'izmir', ids: ['osm-n1'], flagged: [] });
    expect((await review('keep')).status).toBe(200);
    expect((await hidden(env)).body).toEqual({ city: 'izmir', ids: [], flagged: [] });
    // Kept: one more report does not flag it again; it takes new reports on new days.
    at(DAY2);
    await report(env, { deviceId: 'z', kind: 'closed' }, '9.1.1.1');
    expect((await hidden(env)).body.flagged).toEqual([]);
    expect((await review('nope')).status).toBe(400);
  });
});
