// The worker end to end with a fake KV and a fake Anthropic: one counter, the cancel orders,
// refunds and the log line.
const mockParse = jest.fn();
const mockCreate = jest.fn();

// Virtual: CI installs only the app's packages, so the worker's SDK may not be on disk.
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

import worker, { type Env } from '../index';

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

type Kv = ReturnType<typeof fakeKV>;
const envOf = (kv: Kv, vars: Partial<Env> = {}): Env =>
  ({ QUOTA: kv, ANTHROPIC_API_KEY: 'k', CHAT_MIN_INTERVAL_MS: '0', ...vars }) as unknown as Env;

const post = (env: Env, path: string, body: unknown, ip = '1.1.1.1') =>
  worker.fetch(
    new Request(`https://w.test${path}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  );

const understandBody = (messageId: string, deviceId = 'dev-1') => ({
  deviceId,
  messageId,
  text: 'gizli kullanıcı metni',
  history: [],
  section: 'food',
});
const searchOut = {
  kind: 'search',
  district: null,
  cat: null,
  dish: null,
  place: null,
  food: true,
  requireParking: false,
  appleQuery: null,
  nearMe: true,
  dishServes: null,
  wishes: [],
  partySize: null,
  clarify: null,
  plan: null,
  tone: null,
  dishNote: null,
  meaning: null,
  notCat: null,
};
// What the model returns (the flat schema, sentinels instead of nulls) for `searchOut` above.
const flatSearch = {
  kind: 'search',
  district: '',
  cat: 'none',
  notCat: 'none',
  dish: '',
  place: '',
  food: true,
  requireParking: false,
  appleQuery: '',
  nearMe: true,
  dishServes: [],
  wishes: [],
  partySize: 0,
  clarifyAsk: 'none',
  clarifyText: '',
  planWhen: 'none',
  tone: '',
  dishNote: '',
  reply: '',
  action: 'none',
};
const pickBody = (messageId: string, deviceId = 'dev-1') => ({
  deviceId,
  messageId,
  text: 'gizli kullanıcı metni',
  candidates: [0, 1].map((i) => ({
    i,
    kind: 'restaurant',
    walkMin: 3 + i,
    openState: 'open',
    closesLate: false,
    parkingM: 50,
    parkingFree: null,
    freeSpots: null,
    dishMatch: 'none',
    outdoor: null,
  })),
});
const pickOut = { pick: 0, reasons: ['closest'], runnerUp: null, runnerUpWhy: null, tone: null };

const narrateBody = (messageId: string, deviceId = 'dev-1') => ({
  deviceId,
  messageId,
  text: 'gizli kullanıcı metni',
  where: 'Bornova',
  what: 'restoran',
  total: 1,
  withParking: 0,
  results: [{ n: 1, kind: 'restaurant', distanceM: 120, parkingM: null }],
});
/** What the SDK throws for an HTTP error: a status and the API's JSON body. */
const apiError = (status: number, type: string) =>
  Object.assign(new Error(`${status} invalid x-api-key sk-ant-SECRET`), {
    name: 'AuthenticationError',
    status,
    error: { type: 'error', error: { type, message: 'invalid x-api-key sk-ant-SECRET' } },
  });

const remainingOf = async (kv: Kv, deviceId = 'dev-1') => {
  const res = await post(envOf(kv), '/quota', { deviceId }, '9.9.9.9');
  return ((await res.json()) as { remaining: number }).remaining;
};

let logs: string[];
beforeEach(() => {
  mockParse.mockReset();
  mockCreate.mockReset();
  logs = [];
  jest.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('one counter across the endpoints', () => {
  it('reports an IP limit without pretending the device used all ten messages', async () => {
    const env = envOf(fakeKV(), { AI_DAILY_PER_IP: '1' });
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', understandBody('first'));
    const blocked = await post(env, '/understand', understandBody('second'));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ reason: 'ip', remaining: 9 });
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('allows retrying a failed stage after its use was refunded', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockRejectedValueOnce(new Error('upstream'));
    expect((await post(env, '/understand', understandBody('retry'))).status).toBe(502);
    expect(await remainingOf(kv)).toBe(10);
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    expect((await post(env, '/understand', understandBody('retry'))).status).toBe(200);
    expect(await remainingOf(kv)).toBe(9);
  });

  it('keeps a successful message bound after a later identical retry fails', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', understandBody('bound'));
    mockParse.mockRejectedValueOnce(new Error('retry failed'));
    expect((await post(env, '/understand', understandBody('bound'))).status).toBe(502);
    expect(
      (
        await post(env, '/understand', {
          ...understandBody('bound'),
          text: 'yeni soru',
        })
      ).status,
    ).toBe(409);
    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  it('does not run a completed endpoint again when a client reuses its messageId with new text', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    expect((await post(env, '/understand', understandBody('reused'))).status).toBe(200);
    const duplicate = await post(env, '/understand', {
      ...understandBody('reused'),
      text: 'tamamen farklı bir soru',
    });
    expect(duplicate.status).toBe(409);
    expect(mockParse).toHaveBeenCalledTimes(1);
    // The legitimate second stage of the same message still runs for the same use.
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: pickOut });
    expect((await post(env, '/pick', pickBody('reused'))).status).toBe(200);
  });
  it('understand + pick + plan of one message are one use; the next message is another', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    const u = await post(env, '/understand', understandBody('msg-1'));
    expect(u.status).toBe(200);
    expect(((await u.json()) as { remaining: number }).remaining).toBe(9);

    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: pickOut });
    const p = await post(env, '/pick', pickBody('msg-1'));
    expect(p.status).toBe(200);
    expect(((await p.json()) as { remaining: number }).remaining).toBe(9);
    expect(await remainingOf(kv)).toBe(9);
    const day = [...kv.store.keys()].find((k) => k.startsWith('ai:global:'))!;
    expect(kv.store.get(day)).toBe('1');

    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', understandBody('msg-2'));
    expect(await remainingOf(kv)).toBe(8);
  });

  it('/chat (old apps) charges the same counter', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { reply: 'Selam!', action: 'none' },
    });
    const c = await post(env, '/chat', {
      deviceId: 'dev-1',
      messageId: 'msg-1',
      text: 'selam',
      history: [],
    });
    expect(await c.json()).toEqual({ reply: 'Selam!', action: 'none' });
    expect(await remainingOf(kv)).toBe(9);
  });

  it('the 11th message gets a 429 with remaining 0 and Anthropic is not called', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    for (let i = 0; i < 10; i++) {
      expect((await post(env, '/understand', understandBody(`m${i}`))).status).toBe(200);
    }
    const calls = mockParse.mock.calls.length;
    const res = await post(env, '/understand', understandBody('m10'));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ remaining: 0 });
    expect(mockParse.mock.calls.length).toBe(calls);
  });

  it('the global cap counts every endpoint and stops Anthropic calls ("global", 429)', async () => {
    const kv = fakeKV();
    const env = envOf(kv, { AI_GLOBAL_DAILY: '2' });
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    expect((await post(env, '/understand', understandBody('m1', 'a'), '1.1.1.1')).status).toBe(200);
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: pickOut });
    expect((await post(env, '/pick', pickBody('m2', 'b'), '2.2.2.2')).status).toBe(200);
    const calls = mockParse.mock.calls.length;
    const blocked = await post(env, '/understand', understandBody('m3', 'c'), '3.3.3.3');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: 'rate_limited', reason: 'global' });
    expect(mockParse.mock.calls.length).toBe(calls);
    // The old name still works as the cap.
    const old = envOf(fakeKV(), { CHAT_GLOBAL_DAILY: '0' });
    const res = await post(old, '/understand', understandBody('m1'));
    expect(res.status).toBe(429);
  });

  it('a second new message within the interval is "slow"; a pick of the first is not', async () => {
    const kv = fakeKV();
    const env = envOf(kv, { CHAT_MIN_INTERVAL_MS: '60000' });
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    expect((await post(env, '/understand', understandBody('m1'))).status).toBe(200);
    const slow = await post(env, '/understand', understandBody('m2'));
    expect(slow.status).toBe(429);
    expect(await slow.json()).toMatchObject({ reason: 'slow', remaining: 9 });
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: pickOut });
    expect((await post(env, '/pick', pickBody('m1'))).status).toBe(200);
  });

  it('gives the use back on an Anthropic error (not billed)', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockRejectedValueOnce(new Error('boom'));
    const bad = await post(env, '/understand', understandBody('m1'));
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: 'upstream', remaining: 10, detail: 'Error' });
    mockParse.mockRejectedValueOnce(apiError(529, 'overloaded_error'));
    expect((await post(env, '/pick', pickBody('m2'))).status).toBe(502);
    expect(await remainingOf(kv)).toBe(10);
    const day = [...kv.store.keys()].find((k) => k.startsWith('ai:global:'))!;
    expect(kv.store.get(day)).toBe('0');
  });

  it('keeps the use of an answer Anthropic billed but that cannot be used', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null });
    const refused = await post(env, '/understand', understandBody('m1'));
    expect(await refused.json()).toEqual({ understanding: { kind: 'unknown' }, remaining: 9 });
    mockParse.mockResolvedValueOnce({ stop_reason: 'max_tokens', parsed_output: null });
    const cut = await post(env, '/understand', understandBody('m2'));
    expect(await cut.json()).toEqual({ understanding: { kind: 'unknown' }, remaining: 8 });
    mockParse.mockRejectedValueOnce(new Error('Failed to parse structured output: cut off'));
    const unreadable = await post(env, '/understand', understandBody('m3'));
    expect(await unreadable.json()).toEqual({ understanding: { kind: 'unknown' }, remaining: 7 });
    mockParse.mockResolvedValueOnce({ stop_reason: 'max_tokens', parsed_output: null });
    const pick = await post(env, '/pick', pickBody('m4'));
    expect(pick.status).toBe(502);
    expect(await pick.json()).toMatchObject({ remaining: 6, detail: 'no_output_max_tokens' });
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: { reply: '' } });
    await post(env, '/chat', { deviceId: 'dev-1', messageId: 'm5', text: 'selam', history: [] });
    mockCreate.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [] });
    expect((await post(env, '/narrate', narrateBody('m6'))).status).toBe(502);
    expect(await remainingOf(kv)).toBe(4);
    const day = [...kv.store.keys()].find((k) => k.startsWith('ai:global:'))!;
    expect(kv.store.get(day)).toBe('6');
    // The stage stays bound to the text it was billed for: other text on it is a conflict.
    const other = await post(env, '/understand', { ...understandBody('m1'), text: 'başka' });
    expect(other.status).toBe(409);
  });
});

describe('/cancel', () => {
  it('after the call finished: the use comes back', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', understandBody('m1'));
    expect(await remainingOf(kv)).toBe(9);
    const res = await post(env, '/cancel', { deviceId: 'dev-1', messageId: 'm1' });
    expect(res.status).toBe(200);
    expect(await remainingOf(kv)).toBe(10);
    // A repeat changes nothing.
    await post(env, '/cancel', { deviceId: 'dev-1', messageId: 'm1' });
    expect(await remainingOf(kv)).toBe(10);
  });

  it('while the call runs: the use is released, and when the call ends nothing is kept or released twice', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    let finish!: (v: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    mockParse.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => (finish = resolve));
    });
    const running = post(env, '/understand', understandBody('m1'));
    await started;
    expect(await remainingOf(kv)).toBe(9);
    await post(env, '/cancel', { deviceId: 'dev-1', messageId: 'm1' });
    expect(await remainingOf(kv)).toBe(10);
    finish({ stop_reason: 'end_turn', parsed_output: flatSearch });
    const res = await running;
    expect(((await res.json()) as { remaining: number }).remaining).toBe(10);
    expect(await remainingOf(kv)).toBe(10);
    const day = [...kv.store.keys()].find((k) => k.startsWith('ai:global:'))!;
    expect(kv.store.get(day)).toBe('0');
    expect(JSON.parse(logs[0]!)).toMatchObject({
      endpoint: '/understand',
      outcome: 'timeout-cancelled',
    });
  });

  it('rejects a bad body', async () => {
    const res = await post(envOf(fakeKV()), '/cancel', { deviceId: 'dev-1' });
    expect(res.status).toBe(400);
  });
});

describe('the log line', () => {
  it('has endpoint, ms, outcome and remaining, and never the text or the device id', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', understandBody('m1', 'secret-device'));
    mockParse.mockRejectedValueOnce(new Error('boom'));
    await post(env, '/pick', pickBody('m2', 'secret-device'));
    mockParse.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null });
    await post(env, '/pick', pickBody('m3', 'secret-device'));
    const lines = logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => [l.endpoint, l.outcome])).toEqual([
      ['/understand', 'ok'],
      ['/pick', 'error'],
      ['/pick', 'refusal'],
    ]);
    for (const l of lines) {
      expect(Object.keys(l).sort()).toEqual(['endpoint', 'ms', 'outcome', 'remaining']);
      expect(typeof l.ms).toBe('number');
      expect(typeof l.remaining).toBe('number');
    }
    const all = logs.join('\n');
    expect(all).not.toContain('secret-device');
    expect(all).not.toContain('gizli');
  });
});

describe('city', () => {
  const systemOfLastCall = () => (mockParse.mock.calls.at(-1)![0] as { system: string }).system;

  it('a request with city istanbul gets the İstanbul prompt; without a city it is İzmir', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', { ...understandBody('m1'), city: 'istanbul' });
    expect(systemOfLastCall()).toContain('İstanbul için');
    expect(systemOfLastCall()).not.toContain('İzmir');
    await post(env, '/understand', understandBody('m2'));
    expect(systemOfLastCall()).toContain('İzmir için');
    expect(systemOfLastCall()).not.toContain('İstanbul');
  });

  it('an English app gets the free text in English; any other lang is Turkish', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    await post(env, '/understand', { ...understandBody('m1'), lang: 'en' });
    expect(systemOfLastCall()).toContain('DİL (');
    await post(env, '/understand', { ...understandBody('m2'), lang: 'de' });
    expect(systemOfLastCall()).not.toContain('DİL (');
    await post(env, '/understand', understandBody('m3'));
    expect(systemOfLastCall()).not.toContain('DİL (');
  });

  it('a request with city ankara gets the Ankara prompt', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    const res = await post(env, '/understand', { ...understandBody('m1'), city: 'ankara' });
    expect(res.status).toBe(200);
    expect(systemOfLastCall()).toContain('Ankara için');
    expect(systemOfLastCall()).not.toContain('İzmir');
    expect(systemOfLastCall()).not.toContain('İstanbul');
  });

  it('a request with city bursa gets the Bursa prompt', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    const res = await post(env, '/understand', { ...understandBody('m1'), city: 'bursa' });
    expect(res.status).toBe(200);
    expect(systemOfLastCall()).toContain('Bursa için');
    expect(systemOfLastCall()).not.toContain('İzmir');
    expect(systemOfLastCall()).not.toContain('İstanbul');
  });

  it('a request with city antalya gets the Antalya prompt', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: flatSearch });
    const res = await post(env, '/understand', { ...understandBody('m1'), city: 'antalya' });
    expect(res.status).toBe(200);
    expect(systemOfLastCall()).toContain('Antalya için');
    expect(systemOfLastCall()).not.toContain('İzmir');
    expect(systemOfLastCall()).not.toContain('İstanbul');
  });

  it('pick and plan follow the city too', async () => {
    const env = envOf(fakeKV());
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: pickOut });
    await post(env, '/pick', { ...pickBody('m1'), city: 'istanbul' });
    expect(systemOfLastCall()).toContain('İstanbul için');
    await post(env, '/pick', pickBody('m2'));
    expect(systemOfLastCall()).toContain('İzmir için');
  });

  it('an unknown city is a bad request and costs nothing', async () => {
    const kv = fakeKV();
    const res = await post(envOf(kv), '/understand', { ...understandBody('m1'), city: 'atlantis' });
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
    expect(await remainingOf(kv)).toBe(10);
  });
});

describe('upstream failure detail', () => {
  it('a 401 says so in detail, with no message, key or text', async () => {
    const kv = fakeKV();
    mockParse.mockRejectedValueOnce(apiError(401, 'authentication_error'));
    const res = await post(envOf(kv), '/understand', understandBody('m1'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'upstream',
      remaining: 10,
      detail: 'anthropic_401_authentication_error',
    });
    const logged = (console.error as jest.Mock).mock.calls.flat().join(' ');
    expect(logged).toContain('anthropic_401_authentication_error');
    expect(logged).not.toMatch(/SECRET|gizli/);
  });

  it('a 400 invalid_request_error adds the API message, cut and without long quoted text', async () => {
    const kv = fakeKV();
    const quoted = 'gizli kullanıcı metni '.repeat(4);
    const err = Object.assign(new Error('400 sk-ant-SECRET'), {
      name: 'BadRequestError',
      status: 400,
      error: {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Schema is too complex: 17 parameters use union types (limit 16). "short" "${quoted}" ${'x'.repeat(400)}`,
        },
      },
    });
    mockParse.mockRejectedValueOnce(err);
    const res = await post(envOf(kv), '/understand', understandBody('m1'));
    const body = (await res.json()) as { detail: string; message: string; remaining: number };
    expect(res.status).toBe(502);
    expect(body.detail).toBe('anthropic_400_invalid_request_error');
    expect(body.remaining).toBe(10);
    expect(body.message).toContain('Schema is too complex: 17 parameters use union types');
    expect(body.message).toContain('"short"');
    expect(body.message).not.toContain('gizli');
    expect(body.message.length).toBeLessThanOrEqual(300);
    const logged = (console.error as jest.Mock).mock.calls.flat().join(' ');
    expect(logged).toContain('Schema is too complex');
    expect(logged).not.toMatch(/SECRET|gizli/);
  });

  it('other API errors get no message', async () => {
    const kv = fakeKV();
    mockParse.mockRejectedValueOnce(apiError(401, 'authentication_error'));
    const a = await post(envOf(kv), '/understand', understandBody('m1'));
    expect(await a.json()).not.toHaveProperty('message');
    mockParse.mockRejectedValueOnce(apiError(400, 'other_error'));
    const b = await post(envOf(kv), '/understand', understandBody('m2'));
    expect(await b.json()).not.toHaveProperty('message');
  });

  it('an error that is not an APIError gives its name; no output gives the stop reason', async () => {
    const kv = fakeKV();
    mockParse.mockRejectedValueOnce(new TypeError('x'));
    const a = await post(envOf(kv), '/pick', pickBody('m1'));
    expect(((await a.json()) as { detail: string }).detail).toBe('TypeError');
    mockParse.mockResolvedValueOnce({ stop_reason: 'max_tokens', parsed_output: null });
    const b = await post(envOf(kv), '/pick', pickBody('m2'));
    expect(((await b.json()) as { detail: string }).detail).toBe('no_output_max_tokens');
  });
});

describe('the flat model output', () => {
  const flat = flatSearch;

  it('/understand answers the union shape apps read, not the flat object', async () => {
    const kv = fakeKV();
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flat });
    const res = await post(envOf(kv), '/understand', understandBody('m1'));
    const body = (await res.json()) as {
      understanding: Record<string, unknown>;
      remaining: number;
    };
    expect(body.remaining).toBe(9);
    expect(body.understanding).toEqual(searchOut);
    expect(body.understanding).not.toHaveProperty('reply');

    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { ...flat, kind: 'chat', reply: 'Selam!', action: 'none' },
    });
    const chat = await post(envOf(kv), '/understand', understandBody('m2'));
    expect(((await chat.json()) as { understanding: unknown }).understanding).toEqual({
      kind: 'chat',
      reply: 'Selam!',
      action: 'none',
    });
  });

  it('/pick cuts a long reason list instead of failing, and answers an out-of-range index with pick null (200) and keeps the billed use', async () => {
    const kv = fakeKV();
    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { ...pickOut, reasons: ['closest', 'open_now', 'open_late', 'outdoor'] },
    });
    const ok = await post(envOf(kv), '/pick', pickBody('m1'));
    expect(((await ok.json()) as { pick: { reasons: string[] } }).pick.reasons).toHaveLength(3);

    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { ...pickOut, pick: 7 },
    });
    const bad = await post(envOf(kv), '/pick', pickBody('m2'));
    expect(bad.status).toBe(200);
    expect(await bad.json()).toEqual({ pick: null, remaining: 8 });
  });
});
