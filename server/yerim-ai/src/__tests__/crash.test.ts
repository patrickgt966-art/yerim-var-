// POST /crash and GET /admin/crashes: anonymous JS error reports from the app.
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: class {} }), { virtual: true });
jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }), {
  virtual: true,
});

import { ADMIN_PAGE_HTML } from '../adminPage';
import { CRASH_BODY_MAX, validCrash } from '../crashes';
import worker, { type Env } from '../index';

function fakeKV() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, value);
      ttls.set(key, opts?.expirationTtl);
    },
    async list({ prefix, limit = 1000 }: { prefix: string; limit?: number }) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

const envOf = (kv: ReturnType<typeof fakeKV>) =>
  ({ QUOTA: kv, ANTHROPIC_API_KEY: 'k', ADMIN_TOKEN: 'sekret' }) as unknown as Env;

const sample = {
  message: 'undefined is not a function',
  stack: 'TypeError: x\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)',
  appVersion: '0.1.0',
  buildNumber: '12',
  os: 'ios',
  osVersion: '19.0',
  route: '/restoran/osm-n1',
  fatal: false,
};

const crash = (env: Env, body: unknown, ip = '1.1.1.1', raw?: string) =>
  worker.fetch(
    new Request('https://w.test/crash', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': ip },
      body: raw ?? JSON.stringify(body),
    }),
    env,
  );

const admin = (env: Env, path: string, token = 'sekret') =>
  worker.fetch(
    new Request(`https://w.test${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '7.7.7.7' },
    }),
    env,
  );

const crashKeys = (kv: ReturnType<typeof fakeKV>) =>
  [...kv.store.keys()].filter((k) => k.startsWith('crash:'));

beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

describe('validCrash', () => {
  it('accepts a well-formed report', () => {
    expect(validCrash(sample)).toEqual(sample);
    expect(validCrash({ ...sample, stack: '' })).not.toBeNull();
  });

  it.each([
    ['not an object', 'x'],
    ['a missing field', { ...sample, route: undefined }],
    ['a wrong type', { ...sample, fatal: 'yes' }],
    ['an empty message', { ...sample, message: '' }],
    ['a long message', { ...sample, message: 'x'.repeat(301) }],
    ['a long stack', { ...sample, stack: 'x'.repeat(4001) }],
    ['a long route', { ...sample, route: '/' + 'x'.repeat(200) }],
    ['a long version', { ...sample, appVersion: '1'.repeat(33) }],
  ])('rejects %s', (_name, body) => {
    expect(validCrash(body)).toBeNull();
  });
});

describe('POST /crash', () => {
  it('stores one record per day and error with a counter, and keeps it for 30 days', async () => {
    jest.setSystemTime(new Date('2026-10-19T09:00:00Z'));
    const kv = fakeKV();
    const env = envOf(kv);
    const first = await crash(env, sample);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    jest.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    await crash(env, sample);
    const keys = crashKeys(kv);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^crash:2026-10-19:[0-9a-f]{16}$/);
    expect(kv.ttls.get(keys[0]!)).toBe(30 * 86400);
    expect(JSON.parse(kv.store.get(keys[0]!)!)).toEqual({
      count: 2,
      first: '2026-10-19T09:00:00.000Z',
      last: '2026-10-19T10:00:00.000Z',
      sample,
    });
    // Another error is another record.
    await crash(env, { ...sample, message: 'other' });
    expect(crashKeys(kv)).toHaveLength(2);
  });

  it('rejects a bad body', async () => {
    const env = envOf(fakeKV());
    expect((await crash(env, { ...sample, fatal: 'x' })).status).toBe(400);
    expect((await crash(env, null, '1.1.1.1', 'not json')).status).toBe(400);
  });

  it('rejects a body over 8 KB', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    const big = JSON.stringify({ ...sample, pad: 'x'.repeat(CRASH_BODY_MAX) });
    const res = await crash(env, null, '1.1.1.1', big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
    expect(crashKeys(kv)).toEqual([]);
  });

  it('limits one network to 30 reports a day', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    for (let i = 0; i < 30; i++) {
      expect((await crash(env, { ...sample, message: `e${i}` })).status).toBe(200);
    }
    const res = await crash(env, { ...sample, message: 'e31' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    // Another network is not affected.
    expect((await crash(env, sample, '2.2.2.2')).status).toBe(200);
  });
});

describe('GET /admin/crashes', () => {
  it('needs the admin token', async () => {
    const env = envOf(fakeKV());
    expect((await admin(env, '/admin/crashes', 'wrong')).status).toBe(401);
    const off = { ...env, ADMIN_TOKEN: undefined } as Env;
    expect((await admin(off, '/admin/crashes')).status).toBe(404);
  });

  it('lists the errors most frequent first, merging days', async () => {
    const env = envOf(fakeKV());
    jest.setSystemTime(new Date('2026-10-18T09:00:00Z'));
    await crash(env, { ...sample, message: 'rare' });
    await crash(env, sample);
    jest.setSystemTime(new Date('2026-10-19T09:00:00Z'));
    await crash(env, sample);
    await crash(env, sample);
    const res = await admin(env, '/admin/crashes');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const { crashes } = (await res.json()) as {
      crashes: { count: number; first: string; last: string; sample: { message: string } }[];
    };
    expect(crashes.map((c) => [c.sample.message, c.count])).toEqual([
      [sample.message, 3],
      ['rare', 1],
    ]);
    expect(crashes[0]).toMatchObject({
      first: '2026-10-18T09:00:00.000Z',
      last: '2026-10-19T09:00:00.000Z',
    });
  });

  it('returns markup in a message as plain JSON text', async () => {
    const env = envOf(fakeKV());
    const evil = '<img src=x onerror=alert(1)>';
    await crash(env, { ...sample, message: evil, route: '/<script>' });
    const res = await admin(env, '/admin/crashes');
    expect(res.headers.get('content-type')).toBe('application/json');
    const text = await res.text();
    expect(JSON.parse(text).crashes[0].sample.message).toBe(evil);
  });
});

describe('the Hatalar section of /admin', () => {
  it('is in the page, and fills the list with textContent only', () => {
    expect(ADMIN_PAGE_HTML).toContain('<h2>Hatalar</h2>');
    expect(ADMIN_PAGE_HTML).toContain('/admin/crashes');
    expect(ADMIN_PAGE_HTML).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    const start = ADMIN_PAGE_HTML.indexOf('function loadCrashes');
    const section = ADMIN_PAGE_HTML.slice(start, ADMIN_PAGE_HTML.indexOf('function start', start));
    for (const field of ['message', 'count', 'last', 'appVersion', 'route']) {
      expect(section).toContain(field);
    }
    // Every value goes through el(tag, text), which sets textContent.
    expect(section).toMatch(/el\('p', s\.message, 'id'\)/);
  });
});
