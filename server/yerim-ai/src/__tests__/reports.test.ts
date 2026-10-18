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
  return { status: res.status, body: (await res.json()) as { ids?: string[] } };
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

describe('/report and /hidden', () => {
  it('hides a place after three distinct devices report it closed', async () => {
    const env = envOf(fakeKV());
    for (const d of ['a', 'a', 'b']) {
      const res = await report(env, { deviceId: d, kind: 'closed' });
      expect(await res.json()).toEqual({ ok: true, hidden: false });
    }
    expect((await hidden(env)).body.ids).toEqual([]);
    const res = await report(env, { deviceId: 'c', kind: 'closed' });
    expect(await res.json()).toEqual({ ok: true, hidden: true });
    expect((await hidden(env)).body.ids).toEqual(['osm-n1']);
    expect((await hidden(env, 'ankara')).body.ids).toEqual([]);
  });

  it('never hides on wrong location or wrong info', async () => {
    const env = envOf(fakeKV());
    for (const d of ['a', 'b', 'c', 'd']) await report(env, { deviceId: d, kind: 'info' });
    expect((await hidden(env)).body.ids).toEqual([]);
  });

  it('stores no device id in the clear', async () => {
    const kv = fakeKV();
    await report(envOf(kv), { deviceId: 'my-device-123', kind: 'closed' });
    expect([...kv.store.keys(), ...kv.store.values()].join(' ')).not.toContain('my-device-123');
  });

  it('caps reports per device per day', async () => {
    const env = envOf(fakeKV());
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
