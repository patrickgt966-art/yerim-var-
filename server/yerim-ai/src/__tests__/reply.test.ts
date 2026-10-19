// POST /reply: the AI's wording of a reply the app built. It rides on the message the router
// charged: no use of its own, one wording per message, and only for a charged message.
const mockParse = jest.fn();

// Virtual: CI installs only the app's packages, so the worker's SDK may not be on disk.
jest.mock(
  '@anthropic-ai/sdk',
  () => ({
    __esModule: true,
    default: class {
      messages = { parse: mockParse, create: jest.fn() };
    },
  }),
  { virtual: true },
);
jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }), {
  virtual: true,
});

import { REPLY_CASES } from '../../../../src/data/eval/replyCases';
import { MAX_CHAT_CHARS, replySystem } from '../../../../src/lib/ai/protocol';
import worker, { type Env } from '../index';
import { validReply } from '../quota';

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
const understandBody = (messageId: string, deviceId = 'dev-1') => ({
  deviceId,
  messageId,
  text: 'gizli kullanıcı metni',
  history: [],
  section: 'food',
});
const replyBody = (messageId: string, over: Record<string, unknown> = {}) => ({
  deviceId: 'dev-1',
  messageId,
  lang: 'tr',
  userText: 'Alsancak balık',
  kind: 'food',
  facts: {
    where: 'Alsancak',
    what: 'balık restoranı',
    count: 12,
    items: [{ name: 'Mavi Balık', walkMin: 3, openNow: true }],
    daypart: 'evening',
  },
  ...over,
});

const remainingOf = async (kv: Kv, deviceId = 'dev-1') => {
  const res = await post(envOf(kv), '/quota', { deviceId }, '9.9.9.9');
  return ((await res.json()) as { remaining: number }).remaining;
};

let logs: string[];
beforeEach(() => {
  mockParse.mockReset();
  logs = [];
  jest.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** The router call that charges a message, as the app makes it first. */
async function charge(env: Env, messageId: string, ip = '3.3.3.3') {
  mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: flatSearch });
  expect((await post(env, '/understand', understandBody(messageId), ip)).status).toBe(200);
}

describe('POST /reply', () => {
  it('answers with the model text, using the cached system prompt and the given facts', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    await charge(env, 'm1');
    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { text: "  Alsancak'ta akşam için on iki balıkçı var.\n" },
    });
    const res = await post(env, '/reply', replyBody('m1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Alsancak'ta akşam için on iki balıkçı var." });

    const call = mockParse.mock.calls[1]![0] as {
      model: string;
      max_tokens: number;
      system: { text: string; cache_control?: unknown }[];
      output_config: { effort: string };
      messages: { content: string }[];
    };
    expect(call.model).toBe('claude-haiku-5-5');
    expect(call.max_tokens).toBe(200);
    expect(call.output_config.effort).toBe('low');
    expect(call.system[0]).toEqual({
      type: 'text',
      text: replySystem(),
      cache_control: { type: 'ephemeral' },
    });
    expect(JSON.parse(call.messages[0]!.content)).toEqual({
      lang: 'tr',
      userText: 'Alsancak balık',
      kind: 'food',
      facts: replyBody('m1').facts,
    });
  });

  it('costs no use: the count and the global counter stay as the router left them', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    await charge(env, 'm1');
    const global = [...kv.store.keys()].find((k) => k.startsWith('ai:global:'))!;
    const before = { remaining: await remainingOf(kv), global: kv.store.get(global) };
    expect(before).toEqual({ remaining: 9, global: '1' });
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: { text: 'Selam!' } });
    expect(
      (await post(env, '/reply', replyBody('m1', { kind: 'greeting', facts: {} }))).status,
    ).toBe(200);
    expect({ remaining: await remainingOf(kv), global: kv.store.get(global) }).toEqual(before);
    expect(JSON.stringify(await (await post(env, '/reply', replyBody('m1'))).json())).not.toContain(
      'remaining',
    );
  });

  it('allows one wording per message: the second for the same message is refused', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    await charge(env, 'm1');
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { text: 'Merhaba.' } });
    expect((await post(env, '/reply', replyBody('m1'))).status).toBe(200);
    const again = await post(env, '/reply', replyBody('m1'));
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ error: 'rate_limited', reason: 'used' });
    // Router call + one wording; the refused one never reached the model.
    expect(mockParse).toHaveBeenCalledTimes(2);
    // Another message has its own wording.
    await charge(env, 'm2');
    expect((await post(env, '/reply', replyBody('m2'))).status).toBe(200);
  });

  it('refuses a message the router did not charge, without calling the model', async () => {
    const kv = fakeKV();
    const res = await post(envOf(kv), '/reply', replyBody('never-charged'));
    expect(res.status).toBe(409);
    expect(mockParse).not.toHaveBeenCalled();
    expect(await remainingOf(kv)).toBe(10);
  });

  it('rejects oversize or malformed input before anything is spent', async () => {
    const kv = fakeKV();
    const env = envOf(kv);
    await charge(env, 'm1');
    const bad = [
      replyBody('m1', { userText: 'x'.repeat(MAX_CHAT_CHARS + 1) }),
      replyBody('m1', { userText: '' }),
      replyBody('m1', { kind: 'chitchat' }),
      replyBody('m1', { facts: { items: Array(4).fill({ name: 'A' }) } }),
      replyBody('m1', { facts: { where: 'x'.repeat(81) } }),
      replyBody('m1', { facts: { count: -1 } }),
      replyBody('m1', { facts: { items: [{ name: 'A', walkMin: 'x' }] } }),
      replyBody('m1', { facts: 'x' }),
      replyBody('m1', { deviceId: 'a b' }),
    ];
    for (const body of bad) expect((await post(env, '/reply', body)).status).toBe(400);
    expect(mockParse).toHaveBeenCalledTimes(1);
    // The wording of m1 is still available: the bad requests did not use it up.
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: { text: 'Tamam.' } });
    expect((await post(env, '/reply', replyBody('m1'))).status).toBe(200);
  });

  it('accepts every facts shape the live eval sends', () => {
    for (const c of REPLY_CASES) {
      const parsed = validReply(
        replyBody('m1', { kind: c.kind, userText: c.userText, facts: c.facts }),
      );
      expect(parsed?.facts).toEqual(c.facts);
    }
  });

  it('keeps only the known fields of the facts', () => {
    const parsed = validReply(
      replyBody('m1', {
        facts: { where: 'Alsancak', lat: 38.4, items: [{ name: 'A', walkMin: 2, lng: 27.1 }] },
      }),
    );
    expect(parsed?.facts).toEqual({ where: 'Alsancak', items: [{ name: 'A', walkMin: 2 }] });
  });

  it('rate-limits per IP on its own counter, not the one of the other endpoints', async () => {
    const kv = fakeKV();
    const env = envOf(kv, { AI_DAILY_PER_IP: '2' });
    // The router calls come from another address: only /reply's own counter is under test.
    await charge(env, 'm1', '3.0.0.1');
    mockParse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { text: 'Merhaba.' } });
    expect((await post(env, '/reply', replyBody('m1'))).status).toBe(200);
    await charge(env, 'm2', '3.0.0.2');
    await post(env, '/reply', replyBody('m2'));
    await charge(env, 'm3', '3.0.0.3');
    const blocked = await post(env, '/reply', replyBody('m3'));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited', reason: 'ip' });
  });

  it('answers 502 on an upstream failure or an empty text, and logs without the text', async () => {
    const env = envOf(fakeKV());
    await charge(env, 'm1');
    mockParse.mockRejectedValueOnce(new Error('boom sk-ant-SECRET'));
    const failed = await post(env, '/reply', replyBody('m1'));
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain('SECRET');

    await charge(env, 'm2');
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: { text: '   ' } });
    expect((await post(env, '/reply', replyBody('m2'))).status).toBe(502);
    for (const line of logs) {
      expect(line).not.toContain('Alsancak balık');
      expect(line).not.toContain('gizli');
    }
    expect(logs.some((l) => l.includes('"endpoint":"/reply"'))).toBe(true);
  });

  it('clips a long text from the model', async () => {
    const env = envOf(fakeKV());
    await charge(env, 'm1');
    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { text: 'a'.repeat(900) },
    });
    const res = await post(env, '/reply', replyBody('m1'));
    expect(((await res.json()) as { text: string }).text).toHaveLength(400);
  });
});
