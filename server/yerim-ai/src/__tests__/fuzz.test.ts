// Property-style tests with a fixed seed (no dependency): whatever the model returns, the worker
// answers 200 with something the app's strict schemas accept (or an honest "unknown" / null), and
// the app's client reads every worker-shaped answer. A failure prints the distinct failure kinds.
const mockParse = jest.fn();
const mockCreate = jest.fn();

jest.mock(
  '@anthropic-ai/sdk',
  () => ({
    __esModule: true,
    default: class {
      messages = { parse: mockParse, create: mockCreate };
    },
  }),
  { virtual: true },
);
jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }), {
  virtual: true,
});

import { createAiClient } from '../../../../src/lib/ai/client';
import {
  CHAT_ACTIONS,
  CLARIFY_ASKS,
  PARK_REASONS,
  PICK_REASONS,
  PLAN_WHENS,
  UnderstandingClientSchema,
  UnderstandingSchema,
  WISHES,
  chatOutputSchema,
  parkPickOutputSchema,
  pickOutputSchema,
  planOutputSchema,
  toUnderstanding,
} from '../../../../src/lib/ai/protocol';
import worker, { type Env } from '../index';

// Thousands of generated model outputs per case: under a full parallel jest run these can pass 5 s.
jest.setTimeout(30_000);

const RUNS = 2000;
const CATS = [
  'breakfast', 'soup', 'meat', 'lokanta', 'fish', 'cafe', 'meyhane', 'fast', 'world', 'dessert', 'none',
];

// --- a small seeded generator (mulberry32) ------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
  return r;
}
type Rng = ReturnType<typeof rng>;

const STRINGS = [
  '', '', ' ', '\n', 'a', 'selam', 'Bornova', 'kebap', 'none', 'NOT_AN_ENUM', 'null', '12345', '0',
  'İyiyim, sağ ol! Yemek ya da otopark için ne arıyorsun?', '🍽️', '🍽️'.repeat(150), 'x'.repeat(5000),
  'ş'.repeat(400), '\ud83d', 'a\u0000b', '"quoted" \\ back', 'Yakınımda tabikii',
];
const str = (r: Rng) => r.pick(STRINGS);
/** An enum value, or (a quarter of the time) any string: the model is not held to the enum. */
const code = (r: Rng, values: readonly string[]) => (r.chance(0.75) ? r.pick(values) : str(r));
const INTS = [0, 0, 1, 2, 3, 5, 6, 99, 100, -1, -50, 1e9, Number.MAX_SAFE_INTEGER, 2.5];
const anyInt = (r: Rng) => r.pick(INTS);
const list = <T>(r: Rng, make: () => T, max = 12): T[] =>
  Array.from({ length: r.chance(0.3) ? 0 : r.int(1, max) }, make);

function flatOutput(r: Rng) {
  return {
    kind: code(r, ['search', 'chat', 'unknown']),
    district: str(r),
    cat: code(r, CATS),
    dish: str(r),
    place: str(r),
    food: r.chance(0.5),
    requireParking: r.chance(0.5),
    appleQuery: str(r),
    nearMe: r.chance(0.5),
    dishServes: list(r, () => str(r)),
    wishes: list(r, () => code(r, WISHES)),
    partySize: anyInt(r),
    clarifyAsk: code(r, [...CLARIFY_ASKS, 'none']),
    clarifyText: str(r),
    planWhen: code(r, [...PLAN_WHENS, 'none']),
    tone: str(r),
    dishNote: str(r),
    reply: str(r),
    action: code(r, CHAT_ACTIONS),
  };
}

// --- the worker, with an in-memory KV and a fake Anthropic --------------------------------------

function fakeKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}
const env = {
  QUOTA: fakeKV(),
  ANTHROPIC_API_KEY: 'test-key',
  AI_GLOBAL_DAILY: '1000000000',
  AI_DAILY_PER_IP: '1000000000',
  CHAT_MIN_INTERVAL_MS: '0',
} as unknown as Env;

let seq = 0;
async function call(path: string, body: Record<string, unknown>) {
  seq++;
  const res = await worker.fetch(
    new Request(`https://w.test${path}`, {
      method: 'POST',
      body: JSON.stringify({ deviceId: `dev${seq}`, messageId: `msg${seq}`, ...body }),
      headers: { 'CF-Connecting-IP': `10.0.${seq % 250}.${seq % 200}` },
    }),
    env,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** Distinct failure kinds, with a count each; a test expects none. */
function kinds() {
  const seen = new Map<string, number>();
  return {
    add: (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1),
    all: () => Object.fromEntries(seen),
  };
}
const firstIssue = (e: { issues: { path: PropertyKey[]; code: string }[] }) =>
  `${e.issues[0]?.path.join('.') || '(root)'}:${e.issues[0]?.code}`;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const restaurant = (i: number) => ({
  i, kind: 'restaurant', walkMin: 5, openState: 'open', closesLate: false, parkingM: 100,
  parkingFree: null, freeSpots: null, dishMatch: 'none', outdoor: null,
});
const parking = (i: number) => ({
  i, kind: 'parking', walkMin: 5, openState: 'open', nonstop: false, free: null, tariffKnown: false,
  covered: null, freeSpots: null, nearRail: false, capacity: null,
});

describe('worker: any model output gives a 200 the app can read', () => {
  it('/understand', async () => {
    const r = rng(1);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      const out = flatOutput(r);
      mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: out });
      const res = await call('/understand', {
        text: 'selam', history: [], section: 'food', city: 'izmir',
      });
      if (res.status !== 200) {
        bad.add(`understand:${res.status}:${String(res.json.detail)}`);
        continue;
      }
      const u = res.json.understanding;
      const strict = UnderstandingSchema.safeParse(u);
      if (!strict.success) bad.add(`understand:server-schema:${firstIssue(strict.error)}`);
      const client = UnderstandingClientSchema.safeParse(u);
      if (!client.success) bad.add(`understand:client-schema:${firstIssue(client.error)}`);
      if (typeof res.json.remaining !== 'number') bad.add('understand:no-remaining');
    }
    expect(bad.all()).toEqual({});
  });

  it('/pick (restaurants and car parks)', async () => {
    const r = rng(2);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      const park = r.chance(0.5);
      const n = r.int(1, 5);
      const reasons = park ? PARK_REASONS : PICK_REASONS;
      const index = () => (r.chance(0.5) ? r.int(0, n - 1) : anyInt(r));
      mockParse.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        parsed_output: {
          pick: index(),
          reasons: list(r, () => code(r, reasons), 8),
          runnerUp: r.chance(0.4) ? null : index(),
          runnerUpWhy: r.chance(0.4) ? null : code(r, reasons),
          tone: r.chance(0.3) ? null : str(r),
        },
      });
      const res = await call('/pick', {
        text: 'selam',
        candidates: Array.from({ length: n }, (_, k) => (park ? parking(k) : restaurant(k))),
      });
      const name = park ? 'pickPark' : 'pick';
      if (res.status !== 200) {
        bad.add(`${name}:${res.status}:${String(res.json.detail)}`);
        continue;
      }
      if (res.json.pick !== null) {
        const strict = (park ? parkPickOutputSchema(n) : pickOutputSchema(n)).safeParse(res.json.pick);
        if (!strict.success) bad.add(`${name}:schema:${firstIssue(strict.error)}`);
      }
      if (typeof res.json.remaining !== 'number') bad.add(`${name}:no-remaining`);
    }
    expect(bad.all()).toEqual({});
  });

  it('/plan', async () => {
    const r = rng(3);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      const n = r.int(1, 5);
      let p = 0;
      const candidates = Array.from({ length: n }, (_, k) => ({
        i: k, kind: 'restaurant', walkMin: 3, openState: 'open', closesLate: false,
        dishMatch: 'none', outdoor: null,
        parkings: Array.from({ length: r.int(1, 3) }, () => ({
          p: p++, walkMin: 2, parkingFree: null, freeSpots: null, openState: 'open',
        })),
      }));
      const index = (max: number) => (r.chance(0.5) ? r.int(0, max - 1) : anyInt(r));
      mockParse.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        parsed_output: {
          restaurant: index(n),
          parking: index(p),
          reasons: list(r, () => code(r, PICK_REASONS), 8),
          tone: r.chance(0.3) ? null : str(r),
        },
      });
      const res = await call('/plan', { text: 'selam', when: 'tonight', candidates });
      if (res.status !== 200) {
        bad.add(`plan:${res.status}:${String(res.json.detail)}`);
        continue;
      }
      if (res.json.plan !== null) {
        const strict = planOutputSchema(n, p).safeParse(res.json.plan);
        if (!strict.success) bad.add(`plan:schema:${firstIssue(strict.error)}`);
      }
      if (typeof res.json.remaining !== 'number') bad.add('plan:no-remaining');
    }
    expect(bad.all()).toEqual({});
  });

  it('/chat', async () => {
    const r = rng(4);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      mockParse.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        parsed_output: { reply: str(r), action: code(r, CHAT_ACTIONS) },
      });
      const res = await call('/chat', { text: 'selam', history: [] });
      if (res.status !== 200) {
        bad.add(`chat:${res.status}:${String(res.json.detail)}`);
        continue;
      }
      const strict = chatOutputSchema.safeParse(res.json);
      if (!strict.success) bad.add(`chat:schema:${firstIssue(strict.error)}`);
    }
    expect(bad.all()).toEqual({});
  });

  it('an SDK that throws while reading the output is a 200, not a 502 (understand, pick, plan)', async () => {
    const zodLike = Object.assign(new Error('bad output'), { name: 'ZodError' });
    const syntax = new SyntaxError('Unexpected end of JSON input');
    const bad = kinds();
    const sdk = new Error('Failed to parse structured output: boom');
    for (const err of [zodLike, syntax, sdk]) {
      for (const [path, body] of [
        ['/understand', { text: 'selam', history: [], section: 'food' }],
        ['/pick', { text: 'selam', candidates: [restaurant(0)] }],
        ['/plan', {
          text: 'selam', when: 'now',
          candidates: [{ ...restaurant(0), parkings: [{ p: 0, walkMin: 1, parkingFree: null, freeSpots: null, openState: 'open' }] }],
        }],
      ] as const) {
        mockParse.mockRejectedValueOnce(err);
        const res = await call(path, body);
        if (res.status !== 200) bad.add(`${path}:${err.name}:${res.status}`);
      }
    }
    expect(bad.all()).toEqual({});
  });

  it('a real API error stays a 502 with its detail', async () => {
    mockParse.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 400, error: { error: { type: 'invalid_request_error', message: 'bad' } } }),
    );
    const res = await call('/understand', { text: 'selam', history: [], section: 'food' });
    expect(res.status).toBe(502);
    expect(res.json).toMatchObject({ detail: 'anthropic_400_invalid_request_error', message: 'bad' });
  });
});

// --- the app's client reads every worker-shaped answer ------------------------------------------

function clientWith(body: unknown) {
  const fetchImpl = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  return createAiClient('https://w.test', fetchImpl);
}
const base = { deviceId: 'dev-c', messageId: 'msg-c' };

describe('client: an odd field never turns a 200 into a failure', () => {
  it('understand', async () => {
    const r = rng(5);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      const u: Record<string, unknown> = { ...toUnderstanding(flatOutput(r)) };
      // What a newer or older worker may add: unknown codes, extra keys, more list items.
      if (r.chance(0.3)) u.surprise = { nested: [1, 2, 3] };
      if (r.chance(0.3) && Array.isArray(u.wishes)) u.wishes = [...u.wishes, 'teleport'];
      if (r.chance(0.2) && u.kind === 'chat') u.action = 'new_action';
      if (r.chance(0.2) && u.kind === 'search') u.dishServes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      if (r.chance(0.2) && u.kind === 'search') u.partySize = r.pick([0, 150, -2, 3.5]);
      if (r.chance(0.2) && u.kind === 'search') u.cat = 'new_category';
      const res = await clientWith({ understanding: u, remaining: r.int(0, 10) }).understand({
        ...base, text: 'selam', history: [], section: 'food',
      });
      if (!res.ok) bad.add(`understand:${res.reason}:${res.detail}`);
    }
    expect(bad.all()).toEqual({});
  });

  it('pick, pickPark and plan', async () => {
    const r = rng(6);
    const bad = kinds();
    for (let i = 0; i < RUNS; i++) {
      const n = r.int(1, 5);
      const odd = () => ({
        reasons: list(r, () => code(r, PICK_REASONS), 8),
        runnerUp: r.chance(0.5) ? null : r.int(0, n - 1),
        runnerUpWhy: r.chance(0.5) ? null : code(r, PICK_REASONS),
        tone: r.chance(0.5) ? null : str(r),
        extra: r.chance(0.3) ? 1 : undefined,
      });
      const pickOut = { pick: r.int(0, n - 1), ...odd() };
      const res = await clientWith({ pick: pickOut, remaining: 3 }).pick({
        ...base, text: 'selam', candidates: Array.from({ length: n }, (_, k) => restaurant(k)) as never,
      });
      if (!res.ok) bad.add(`pick:${res.reason}`);
      const park = await clientWith({ pick: pickOut, remaining: 3 }).pickPark({
        ...base, text: 'selam', candidates: Array.from({ length: n }, (_, k) => parking(k)) as never,
      });
      if (!park.ok) bad.add(`pickPark:${park.reason}`);
      const plan = await clientWith({
        plan: { restaurant: r.int(0, n - 1), parking: 0, reasons: odd().reasons, tone: odd().tone },
        remaining: 3,
      }).plan({
        ...base, text: 'selam', when: 'now',
        candidates: Array.from({ length: n }, (_, k) => ({
          ...restaurant(k),
          parkings: [{ p: k, walkMin: 1, parkingFree: null, freeSpots: null, openState: 'open' }],
        })) as never,
      });
      if (!plan.ok) bad.add(`plan:${plan.reason}`);
    }
    expect(bad.all()).toEqual({});
  });

  it('a null pick from the worker is a plain failure, never a throw', async () => {
    const res = await clientWith({ pick: null, remaining: 4 }).pick({
      ...base, text: 'selam', candidates: [restaurant(0)] as never,
    });
    expect(res).toMatchObject({ ok: false, reason: 'error' });
  });
});
