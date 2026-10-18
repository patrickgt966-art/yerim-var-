// The app's real AI client wired to the real worker's fetch handler. Only the network (an in-memory
// KV and a fake Anthropic) is replaced, so a request the app builds that the worker would reject
// shows up here as a failed call. The chat flows run through the app's own assistant code, so the
// history, the ids and the pick / plan candidates are the ones the app really sends.
import { readFileSync } from 'fs';
import { join } from 'path';

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

import '@/i18n';
import i18n from 'i18next';

import { setActiveCity } from '@/data/cities';
import { useAi } from '@/store/ai';

import {
  answer,
  emptyContext,
  pickFromCards,
  type AssistantDeps,
  type ChatContext,
} from '../../../../src/data/assistant';
import { staticParkings } from '../../../../src/data/staticParkings';
import { createAiClient } from '../../../../src/lib/ai/client';
import {
  CHAT_HISTORY_LIMIT,
  FREE_DAILY,
  HISTORY_LIMIT,
  MAX_CANDIDATES,
  MAX_CHAT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_PARKINGS,
  chatSystem,
  understandSystem,
  type ChatTurn,
  type ParkPickCandidate,
  type PickCandidate,
  type PlanCandidate,
} from '../../../../src/lib/ai/protocol';
import worker, { type Env } from '../index';

// --- the worker's environment: the [vars] of wrangler.toml, an in-memory KV ---------------------

function wranglerVars(): Record<string, string> {
  const toml = readFileSync(join(__dirname, '../../wrangler.toml'), 'utf8');
  const vars = toml.slice(toml.indexOf('[vars]'));
  const out: Record<string, string> = {};
  for (const m of vars.matchAll(/^([A-Z_]+)\s*=\s*"([^"]*)"/gm)) out[m[1]!] = m[2]!;
  return out;
}

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

const kv = fakeKV();
const env = { QUOTA: kv, ANTHROPIC_API_KEY: 'test-key', ...wranglerVars() } as unknown as Env;

/** The app's fetch, answered by the worker. Every non-2xx is logged for the failure message. */
const rejected: string[] = [];
const toWorker = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('CF-Connecting-IP', '203.0.113.7');
  const req = new Request(String(url), { ...init, headers });
  const res = await worker.fetch(req, env);
  if (!res.ok) {
    const path = new URL(String(url)).pathname;
    rejected.push(`${path} -> ${res.status} ${await res.clone().text()}`);
  }
  return res;
}) as typeof fetch;

const client = createAiClient('https://yerim-ai.test', toWorker);

/** Raw request, the way an older app (no city, long history) would send it. */
const rawPost = (path: string, body: unknown) =>
  toWorker(`https://yerim-ai.test${path}`, { method: 'POST', body: JSON.stringify(body) });

// --- a fake Anthropic that returns valid structured outputs --------------------------------------

const searchOut = (district: string, food: boolean) => ({
  kind: 'search',
  district,
  cat: 'none',
  dish: '',
  place: '',
  food,
  requireParking: false,
  appleQuery: '',
  nearMe: false,
  dishServes: [],
  wishes: [],
  partySize: 0,
  clarifyAsk: 'none',
  clarifyText: '',
  planWhen: 'none',
  tone: '',
  dishNote: '',
  // The flat model output: the fields of the other kinds are empty.
  reply: '',
  action: 'none',
});

const anthropicCalls: { system: string; content: unknown }[] = [];
let routerDistrict = { district: 'Bornova', food: true };

mockParse.mockImplementation(
  async (args: { system: string; max_tokens: number; messages: { content: string }[] }) => {
    const last = args.messages[args.messages.length - 1]!.content;
    anthropicCalls.push({ system: args.system, content: last });
    const asked = ((): { candidates?: unknown; when?: unknown } | null => {
      try {
        return JSON.parse(last) as { candidates?: unknown; when?: unknown } | null;
      } catch {
        return null;
      }
    })();
    const done = (parsed_output: unknown) => ({ stop_reason: 'end_turn', parsed_output });
    if (asked?.when) return done({ restaurant: 0, parking: 0, reasons: [], tone: null });
    if (asked?.candidates) {
      return done({ pick: 0, reasons: [], runnerUp: null, runnerUpWhy: null, tone: null });
    }
    // Only /understand asks for 2048 tokens; the remaining JSON call without candidates is /chat.
    if (args.max_tokens !== 2048) return done({ reply: 'Selam!', action: 'none' });
    return done(searchOut(routerDistrict.district, routerDistrict.food));
  },
);

// --- a chat session like src/app/sohbet.tsx: bindAi, one message id per user message -------------

type Msg = { role: 'user' | 'bot'; text: string };

const calls: { path: string; ok: boolean }[] = [];
/** Wraps every client method so a failed call (the app then falls back to its rules) is counted. */
function recording() {
  const wrap =
    <A extends unknown[], R>(path: string, fn: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      const r = await fn(...a);
      const bad =
        r === null || (typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok === false);
      calls.push({ path, ok: !bad });
      return r;
    };
  return {
    understand: wrap('/understand', client.understand),
    pick: wrap('/pick', client.pick),
    pickPark: wrap('/pick', client.pickPark),
    plan: wrap('/plan', client.plan),
    chat: wrap('/chat', client.chat),
    quota: wrap('/quota', client.quota),
  };
}

function session(section: 'food' | 'park') {
  const ai = recording();
  const deviceId = useAi.getState().deviceId;
  const messages: Msg[] = [];
  const bound = { messageId: '', text: '', history: [] as ChatTurn[] };
  let ctx: ChatContext = emptyContext(section);
  let n = 0;
  const bind = (text: string) => {
    // Same as bindAi in sohbet.tsx.
    bound.messageId = `u${Date.now().toString(36)}${n}`;
    bound.text = text;
    bound.history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, text: m.text }));
  };
  const deps: AssistantDeps = {
    here: async () => ({ lat: 38.437, lng: 27.143 }),
    geocode: async () => null,
    parkings: staticParkings(),
    // eslint-disable-next-line import/no-named-as-default-member
    t: (key, opts) => i18n.t(key, opts),
    ai: {
      understand: (_text, lastCards) =>
        ai.understand({
          ...bound,
          deviceId,
          section: ctx.section,
          ...(lastCards ? { lastCards } : {}),
        }),
      usesLeft: () => 10,
      pick: (rest) => ai.pick({ ...rest, deviceId, messageId: bound.messageId }),
      pickPark: (rest) => ai.pickPark({ ...rest, deviceId, messageId: bound.messageId }),
      plan: (rest) => ai.plan({ ...rest, deviceId, messageId: bound.messageId }),
      quotaNotice: () => true,
    },
  };
  return {
    messages,
    get ctx() {
      return ctx;
    },
    async send(text: string) {
      n++;
      bind(text);
      messages.push({ role: 'user', text });
      const res = await answer(text, ctx, deps);
      ctx = res.ctx;
      messages.push({ role: 'bot', text: res.reply.text });
      return res;
    },
    async tapPick(from: Awaited<ReturnType<typeof answer>>) {
      const chip = from.reply.actions.find((a) => a.kind === 'pick');
      if (chip?.kind !== 'pick') throw new Error('no pick chip');
      n++;
      bind(chip.label);
      messages.push({ role: 'user', text: chip.label });
      const res = await pickFromCards(chip.cards, chip.query, ctx, deps);
      ctx = res.ctx;
      messages.push({ role: 'bot', text: res.reply.text });
      return res;
    },
  };
}

// --- helpers ------------------------------------------------------------------------------------

const DEVICE = () => useAi.getState().deviceId;
const quotaLeft = async () => (await client.quota(DEVICE())) as number;
const failures = () => calls.filter((c) => !c.ok).map((c) => c.path);

/** Each new message must be a second apart from the last (CHAT_MIN_INTERVAL_MS from wrangler.toml). */
let clock = Date.parse('2026-10-14T09:00:00Z');
const tick = () => jest.setSystemTime((clock += 5000));

beforeAll(() => {
  jest.useFakeTimers({
    now: clock,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
});
afterAll(() => {
  jest.useRealTimers();
  setActiveCity('izmir');
});
beforeEach(() => {
  rejected.length = 0;
  calls.length = 0;
  anthropicCalls.length = 0;
  routerDistrict = { district: 'Bornova', food: true };
  setActiveCity('izmir');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  // Fresh device (and so a fresh quota) for every test.
  useAi.setState({ deviceId: `d-${Math.random().toString(36).slice(2, 18).padEnd(16, '0')}` });
});

const noRejections = () => expect(rejected).toEqual([]);

describe('ids the app makes fit the worker', () => {
  it('the app device id and a sohbet message id pass the worker', async () => {
    const q = await client.quota(DEVICE());
    expect(q).toBe(FREE_DAILY);
    tick();
    const u = await client.understand({
      deviceId: DEVICE(),
      messageId: `u${Date.now().toString(36)}${12}`,
      text: 'merhaba',
      history: [],
      section: 'food',
    });
    expect(u).toMatchObject({ ok: true, remaining: 9 });
    noRejections();
  });
});

describe('a food chat through the real assistant and the real worker', () => {
  it('first message, a follow-up after a long bot reply, pick chip, quota, plan', async () => {
    const chat = session('food');
    expect(await quotaLeft()).toBe(10);

    // a. first message, empty history
    tick();
    const first = await chat.send("Bornova'da köfteci");
    expect(calls.filter((c) => c.path === '/understand')).toEqual([
      { path: '/understand', ok: true },
    ]);
    expect(await quotaLeft()).toBe(9);

    // b. the bot's reply (or any long bot text) is in the history of the next message
    chat.messages.push({ role: 'bot', text: 'Önceki cevap. '.repeat(45) });
    tick();
    await chat.send("Bornova'da balık");
    expect(await quotaLeft()).toBe(8);

    // d. the pick chip is a new message: one more use; pick shares nothing with the router call
    tick();
    const second = await chat.send("Bornova'da köfteci");
    expect(await quotaLeft()).toBe(7);
    tick();
    const picksBefore = calls.filter((c) => c.path === '/pick').length;
    await chat.tapPick(second);
    expect(calls.filter((c) => c.path === '/pick').length).toBe(picksBefore + 1);
    expect(await quotaLeft()).toBe(6);

    // d. plan: understand + plan of one message are one use
    tick();
    await chat.send("Bornova'da önce park sonra yemek");
    expect(calls.filter((c) => c.path === '/plan').length).toBeGreaterThan(0);
    expect(await quotaLeft()).toBe(5);

    expect(first.reply.text.length).toBeGreaterThan(0);
    expect(failures()).toEqual([]);
    noRejections();
  });
});

describe('a car park chat through the real assistant and the real worker', () => {
  it('router, then the car park pick chip', async () => {
    routerDistrict = { district: 'Konak', food: false };
    const chat = session('park');
    tick();
    const first = await chat.send('Konak otopark');
    expect(await quotaLeft()).toBe(9);
    tick();
    const picksBefore = calls.filter((c) => c.path === '/pick').length;
    await chat.tapPick(first);
    expect(calls.filter((c) => c.path === '/pick').length).toBe(picksBefore + 1);
    expect(await quotaLeft()).toBe(8);
    expect(failures()).toEqual([]);
    noRejections();
  });
});

describe('history of any length', () => {
  const longBot = 'b'.repeat(600);
  const turns: ChatTurn[] = [
    { role: 'user', text: 'u'.repeat(400) },
    { role: 'bot', text: longBot },
    { role: 'user', text: 'Bornova köfteci' },
    { role: 'bot', text: longBot },
    { role: 'user', text: '' },
    { role: 'bot', text: 'x'.repeat(250) },
    { role: 'user', text: 'merhaba' },
    { role: 'bot', text: longBot },
  ];

  it('b. a follow-up whose history holds a 600-char bot reply is answered', async () => {
    tick();
    const r = await client.understand({
      deviceId: DEVICE(),
      messageId: 'm-long',
      text: 'peki ya balık',
      history: [
        { role: 'user', text: 'köfteci' },
        { role: 'bot', text: longBot },
      ],
      section: 'food',
    });
    expect(r).toMatchObject({ ok: true, remaining: 9 });
    noRejections();
  });

  it('the client sends at most HISTORY_LIMIT clipped, non-empty turns', async () => {
    tick();
    const r = await client.understand({
      deviceId: DEVICE(),
      messageId: 'm-many',
      text: 'selam',
      history: turns,
      section: 'park',
    });
    expect(r).toMatchObject({ ok: true, remaining: 9 });
    noRejections();
  });

  it('an older app that sends the history unclipped is answered too', async () => {
    tick();
    const res = await rawPost('/understand', {
      deviceId: DEVICE(),
      messageId: 'm-old',
      text: 'selam',
      history: [...turns, ...turns],
      section: 'food',
    });
    expect(res.status).toBe(200);
    // The model saw clipped turns only.
    const sent = mockParse.mock.calls.at(-1)![0] as { messages: { content: string }[] };
    expect(sent.messages.every((m) => m.content.length <= MAX_MESSAGE_CHARS)).toBe(true);
    expect(sent.messages.length).toBeLessThanOrEqual(HISTORY_LIMIT + 1);
  });

  it('/chat: long history, and the same message id charges once', async () => {
    tick();
    const reply = await client.chat({
      deviceId: DEVICE(),
      messageId: 'm-chat',
      text: 'y'.repeat(500),
      history: turns,
    });
    expect(reply).toEqual({ reply: 'Selam!', action: 'none' });
    expect(MAX_CHAT_CHARS).toBeGreaterThan(MAX_MESSAGE_CHARS);
    expect(CHAT_HISTORY_LIMIT).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(await quotaLeft()).toBe(9);
    noRejections();
  });
});

describe('quota', () => {
  it('c. the count refreshes, drops by one per message id and not for a repeated id', async () => {
    expect(await quotaLeft()).toBe(10);
    const send = async (messageId: string) => {
      tick();
      return client.understand({
        deviceId: DEVICE(),
        messageId,
        text: 'merhaba',
        history: [],
        section: 'food',
      });
    };
    let left = 10;
    for (const id of ['a1', 'a2', 'a3']) {
      left -= 1;
      expect(await send(id)).toMatchObject({ ok: true, remaining: left });
      expect(await quotaLeft()).toBe(left);
    }
    expect(await send('a2')).toMatchObject({ ok: true, remaining: left });
    expect(await quotaLeft()).toBe(left);
    noRejections();
  });
});

describe('pick and plan with the most the app can send', () => {
  const restaurant = (i: number): PickCandidate => ({
    i,
    kind: 'restaurant',
    walkMin: 99999,
    openState: 'unknown',
    closesLate: true,
    parkingM: 99999,
    parkingFree: false,
    freeSpots: 99999,
    dishMatch: 'likely',
    outdoor: true,
  });
  const park = (i: number): ParkPickCandidate => ({
    i,
    kind: 'parking',
    walkMin: 12,
    openState: 'open',
    nonstop: true,
    free: false,
    tariffKnown: true,
    covered: null,
    freeSpots: 0,
    nearRail: true,
    capacity: 99999,
  });
  const planCandidates = (): PlanCandidate[] => {
    let p = 0;
    return Array.from({ length: MAX_CANDIDATES }, (_, i) => ({
      i,
      kind: 'restaurant' as const,
      walkMin: 99999,
      openState: 'unknown' as const,
      closesLate: true,
      dishMatch: 'likely' as const,
      outdoor: true,
      parkings: Array.from({ length: MAX_PLAN_PARKINGS }, () => ({
        p: p++,
        walkMin: 7,
        parkingFree: null,
        freeSpots: 3,
        openState: 'open' as const,
      })),
    }));
  };
  const text = 'x'.repeat(MAX_MESSAGE_CHARS + 50);

  it('d. five restaurants, five car parks and five restaurants with three car parks each', async () => {
    const deviceId = DEVICE();
    tick();
    const pick = await client.pick({
      deviceId,
      messageId: 'p1',
      text,
      candidates: Array.from({ length: MAX_CANDIDATES }, (_, i) => restaurant(i)),
    });
    expect(pick).toMatchObject({ ok: true, remaining: 9 });
    tick();
    const parkPick = await client.pickPark({
      deviceId,
      messageId: 'p2',
      text,
      candidates: Array.from({ length: MAX_CANDIDATES }, (_, i) => park(i)),
    });
    expect(parkPick).toMatchObject({ ok: true, remaining: 8 });
    tick();
    const plan = await client.plan({
      deviceId,
      messageId: 'p3',
      text,
      when: 'tonight',
      candidates: planCandidates(),
    });
    expect(plan).toMatchObject({ ok: true, remaining: 7 });
    expect(await quotaLeft()).toBe(7);
    noRejections();
  });
});

describe('city', () => {
  it('e. city istanbul reaches the İstanbul prompt on every endpoint', async () => {
    setActiveCity('istanbul');
    tick();
    const u = await client.understand({
      deviceId: DEVICE(),
      messageId: 'c1',
      text: 'Kadıköy balık',
      history: [{ role: 'bot', text: 'z'.repeat(600) }],
      section: 'food',
    });
    expect(u).toMatchObject({ ok: true, remaining: 9 });
    expect(anthropicCalls[0]!.system).toBe(understandSystem('istanbul'));
    tick();
    const c = await client.chat({
      deviceId: DEVICE(),
      messageId: 'c2',
      text: 'selam',
      history: [],
    });
    expect(c).not.toBeNull();
    expect(anthropicCalls[1]!.system).toBe(chatSystem('istanbul'));
    noRejections();
  });

  it('f. a request without a city (an older app) is answered with the İzmir prompt', async () => {
    tick();
    const res = await rawPost('/understand', {
      deviceId: DEVICE(),
      messageId: 'old1',
      text: 'Bornova köfte',
      history: [{ role: 'bot', text: 'z'.repeat(600) }],
      section: 'food',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { remaining: number }).remaining).toBe(9);
    expect(anthropicCalls[0]!.system).toBe(understandSystem());
    tick();
    const q = await rawPost('/quota', { deviceId: DEVICE() });
    expect(((await q.json()) as { remaining: number }).remaining).toBe(9);
  });
});

describe('the phone request that failed with a 502', () => {
  // The history, city and ids of a real phone session (no lastCards on that message).
  const phoneHistory: ChatTurn[] = [
    { role: 'user', text: 'Oo kingo naber lo' },
    { role: 'bot', text: 'İyiyim, sağ ol! Yemek ya da otopark için ne arıyorsun? ✨' },
    { role: 'user', text: 'Hocam bana bir diyet menü sporcuyumda' },
    { role: 'bot', text: 'Hangi semtte arayayım?' },
  ];
  const ask = (extra: Record<string, unknown> = {}) =>
    client.understand({
      deviceId: DEVICE(),
      messageId: `ph${Date.now().toString(36)}`,
      text: 'Yakınımda tabikii',
      history: phoneHistory,
      section: 'food',
      city: 'izmir',
      ...extra,
    });

  it('is answered, and the model sees a clean message list', async () => {
    tick();
    mockParse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: { ...searchOut('', true), nearMe: true, dish: 'diyet', wishes: ['healthy'] },
    });
    const r = await ask({ lastCards: { count: 3, kind: 'restaurant' } });
    expect(r).toMatchObject({ ok: true, value: { kind: 'search', nearMe: true, wishes: ['healthy'] } });
    const sent = mockParse.mock.calls.at(-1)![0] as {
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(sent.system).toContain(understandSystem('izmir'));
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(sent.messages.every((m) => m.content.trim() !== '')).toBe(true);
    noRejections();
  });

  it('a history cut in the middle of an emoji is still valid JSON for the API', async () => {
    tick();
    const bot = `${'a'.repeat(MAX_MESSAGE_CHARS - 1)}🍽️ tail`;
    await ask({ history: [{ role: 'user', text: 'selam' }, { role: 'bot', text: bot }] });
    const sent = mockParse.mock.calls.at(-1)![0] as { messages: { content: string }[] };
    for (const m of sent.messages) expect(m.content.isWellFormed()).toBe(true);
    noRejections();
  });

  it('a whitespace-only message is a 400 from the worker, not a call that Anthropic rejects', async () => {
    tick();
    const res = await rawPost('/understand', {
      deviceId: DEVICE(), messageId: 'ws1', text: '   ', history: [], section: 'food',
    });
    expect(res.status).toBe(400);
    rejected.length = 0;
  });

  it.each([
    ['empty strings everywhere', { ...searchOut('', false), kind: 'search' }],
    ['a chat with an empty reply', { ...searchOut('', false), kind: 'chat', reply: '', action: 'none' }],
    ['a chat with an odd action', { ...searchOut('', false), kind: 'chat', reply: 'Selam!', action: 'dance' }],
    ['a search with an unknown wish and a huge party', {
      ...searchOut('', true), wishes: ['teleport', 'cheap', 'cheap'], partySize: 5000,
      dishServes: ['a', 'a', 'b', 'c', 'd', 'e', 'f'],
    }],
  ])('%s: a 200, never a 502', async (_name, out) => {
    tick();
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: out });
    const r = await ask();
    expect(r.ok).toBe(true);
    noRejections();
  });

  it.each([
    ['pick', "Bornova'da köfteci", { pick: 42, reasons: ['teleport'], runnerUp: 9, runnerUpWhy: 'x', tone: null }],
    ['plan', "Bornova'da önce park sonra yemek", { restaurant: -3, parking: 1e9, reasons: [], tone: 'x' }],
  ])('an unusable %s in the same message keeps the search reply', async (_n, text, bad) => {
    const chat = session('food');
    tick();
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: searchOut('Bornova', true) });
    mockParse.mockResolvedValueOnce({ stop_reason: 'end_turn', parsed_output: bad });
    const res = await chat.send(text);
    expect(failures()).toEqual([_n === 'pick' ? '/pick' : '/plan']);
    expect(res.reply.cards.length).toBeGreaterThan(0);
    expect(res.reply.text).not.toBe(i18n.t('chat.pickUnavailable'));
    expect(res.reply.notice).toBeUndefined();
    // Only the router call is charged: the failed pick / plan gave nothing and shares its use.
    expect(await quotaLeft()).toBe(9);
    noRejections();
  });
});
