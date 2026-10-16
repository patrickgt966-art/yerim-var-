import { setActiveCity } from '@/data/cities';

import { createAiClient } from '../client';
import { ROUTER_TIMEOUT_MS, type NarrateRequest, type UnderstandRequest } from '../protocol';

// The client warns about failures in dev; the tests that expect them look at the spy themselves.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const understandReq: UnderstandRequest = {
  deviceId: 'd-test',
  messageId: 'm1',
  text: 'bornova balık',
  history: [],
  section: 'food',
};

const narrateReq: NarrateRequest = {
  deviceId: 'd-test',
  messageId: 'm1',
  text: 'bornova balık',
  where: 'Bornova',
  what: 'balık restoranı',
  total: 3,
  withParking: 1,
  results: [{ n: 1, kind: 'restaurant', distanceM: 120, parkingM: 90 }],
};

/** What the client fills in for the newer fields an older server does not send. */
const NEW_DEFAULTS = {
  wishes: [],
  partySize: null,
  clarify: null,
  plan: null,
  tone: null,
  dishNote: null,
};

const fakeFetch = (status: number, body: unknown) =>
  jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;

describe('ai client', () => {
  it('returns the understanding and remaining count', async () => {
    const understanding = { kind: 'chat', reply: 'Selam!', action: 'none' };
    const f = fakeFetch(200, { understanding, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: true, value: understanding, remaining: 4 });
    expect(f).toHaveBeenCalledWith(
      'https://ai.test/understand',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reads the old server\'s "offtopic" as chat without an action', async () => {
    const f = fakeFetch(200, {
      understanding: { kind: 'offtopic', reply: 'Selam!' },
      remaining: 4,
    });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({
      ok: true,
      value: { kind: 'chat', reply: 'Selam!', action: 'none' },
      remaining: 4,
    });
  });

  it('a chat answer without an action gets "none"', async () => {
    const f = fakeFetch(200, { understanding: { kind: 'chat', reply: 'Selam!' }, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toMatchObject({ ok: true, value: { kind: 'chat', action: 'none' } });
  });

  it('sends lastCards to the router when given', async () => {
    const f = fakeFetch(200, { understanding: { kind: 'unknown' }, remaining: 4 });
    await createAiClient('https://ai.test', f).understand({
      ...understandReq,
      lastCards: { count: 3, kind: 'restaurant' },
    });
    const body = JSON.parse((f as unknown as jest.Mock).mock.calls[0]![1].body as string);
    expect(body.lastCards).toEqual({ count: 3, kind: 'restaurant' });
  });

  it('a 429 for being too fast or a busy server is no empty quota', async () => {
    for (const reason of ['slow', 'global']) {
      const f = fakeFetch(429, { error: 'rate_limited', reason, remaining: 6 });
      const r = await createAiClient('https://ai.test', f).understand(understandReq);
      expect(r).toEqual({ ok: false, reason: 'error', remaining: 6, detail: 'http' });
    }
  });

  describe('router timeout', () => {
    const hang = () =>
      jest.fn((url: string, init?: RequestInit) =>
        url.endsWith('/cancel')
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ remaining: 8 }) })
          : new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
      ) as unknown as typeof fetch;

    afterEach(() => jest.useRealTimers());

    it('gives up after ROUTER_TIMEOUT_MS (9 s) and tells the server to cancel the message', async () => {
      jest.useFakeTimers();
      const f = hang();
      const p = createAiClient('https://ai.test', f).understand(understandReq);
      await jest.advanceTimersByTimeAsync(ROUTER_TIMEOUT_MS - 100);
      let settled = false;
      void p.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(200);
      expect(await p).toEqual({ ok: false, reason: 'error', detail: 'timeout' });
      const calls = (f as unknown as jest.Mock).mock.calls;
      const cancel = calls.find((c) => String(c[0]).endsWith('/cancel'));
      expect(cancel).toBeDefined();
      expect(JSON.parse(cancel![1].body as string)).toEqual({
        deviceId: 'd-test',
        messageId: 'm1',
      });
    });

    it('does not cancel on an ordinary error or a quota stop', async () => {
      for (const status of [500, 429]) {
        const f = fakeFetch(status, {});
        await createAiClient('https://ai.test', f).understand(understandReq);
        expect((f as unknown as jest.Mock).mock.calls).toHaveLength(1);
      }
    });

    it('a failing cancel never throws', async () => {
      jest.useFakeTimers();
      const f = jest.fn((url: string, init?: RequestInit) =>
        url.endsWith('/cancel')
          ? Promise.reject(new Error('offline'))
          : new Promise((_r, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
      ) as unknown as typeof fetch;
      const p = createAiClient('https://ai.test', f).understand(understandReq);
      await jest.advanceTimersByTimeAsync(ROUTER_TIMEOUT_MS + 100);
      expect(await p).toEqual({ ok: false, reason: 'error', detail: 'timeout' });
    });
  });

  it('accepts an old-shape search understanding (no nearMe / dishServes)', async () => {
    const old = {
      kind: 'search',
      district: 'Bornova',
      cat: 'fish',
      dish: null,
      place: null,
      food: true,
      requireParking: false,
      appleQuery: null,
    };
    const f = fakeFetch(200, { understanding: old, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({
      ok: true,
      value: { ...old, ...NEW_DEFAULTS, nearMe: false, dishServes: null },
      remaining: 4,
    });
  });

  it('accepts a new-shape search understanding', async () => {
    const next = {
      kind: 'search',
      district: null,
      cat: 'breakfast',
      dish: 'çiğ börek',
      place: null,
      food: true,
      requireParking: false,
      appleQuery: null,
      nearMe: true,
      dishServes: ['börekçi'],
    };
    const f = fakeFetch(200, { understanding: next, remaining: 3 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: true, value: { ...next, ...NEW_DEFAULTS }, remaining: 3 });
  });

  it('returns the narration', async () => {
    const f = fakeFetch(200, { reply: 'Hocam {1} yakın', remaining: 3 });
    const r = await createAiClient('https://ai.test', f).narrate(narrateReq);
    expect(r).toEqual({ ok: true, value: 'Hocam {1} yakın', remaining: 3 });
  });

  it('maps 429 to quota', async () => {
    const r = await createAiClient('https://ai.test', fakeFetch(429, {})).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'quota', detail: 'http' });
  });

  it('maps a server error to error', async () => {
    const r = await createAiClient('https://ai.test', fakeFetch(500, {})).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'http' });
  });

  it('maps an invalid body to error', async () => {
    const f = fakeFetch(200, { understanding: { kind: 'nope' }, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'schema' });
  });

  it('understand: a network failure says network; the dev warning has the detail, never the text', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const f = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'network' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('network');
    expect(String(warn.mock.calls[0]![0])).not.toContain(understandReq.text);
    warn.mockRestore();
  });

  it('understand: dev warning names the HTTP status and the first schema issue path', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await createAiClient('https://ai.test', fakeFetch(503, {})).understand(understandReq);
    expect(String(warn.mock.calls[0]![0])).toContain('HTTP 503');
    warn.mockClear();
    const bad = fakeFetch(200, { understanding: { kind: 'weather' }, remaining: 4 });
    const r = await createAiClient('https://ai.test', bad).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'schema' });
    expect(String(warn.mock.calls[0]![0])).toContain('schema');
    expect(String(warn.mock.calls[0]![0])).toContain('first issue at');
    expect(String(warn.mock.calls[0]![0])).not.toContain(understandReq.text);
    warn.mockRestore();
  });

  it('maps a network failure to error', async () => {
    const f = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const r = await createAiClient('https://ai.test', f).narrate(narrateReq);
    expect(r).toEqual({ ok: false, reason: 'error' });
  });

  it('returns remaining from a 502 error body', async () => {
    const f = fakeFetch(502, { error: 'upstream', remaining: 4 });
    const r = await createAiClient('https://ai.test', f).narrate(narrateReq);
    expect(r).toEqual({ ok: false, reason: 'error', remaining: 4 });
  });

  it('returns remaining from a 429 body', async () => {
    const f = fakeFetch(429, { remaining: 0 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'quota', remaining: 0, detail: 'http' });
  });

  it('ignores a non-numeric remaining or a non-JSON error body', async () => {
    const bad = fakeFetch(502, { remaining: 'x' });
    const r1 = await createAiClient('https://ai.test', bad).understand(understandReq);
    expect(r1).toEqual({ ok: false, reason: 'error', detail: 'http' });
    const nonJson = jest.fn(async () => ({
      status: 502,
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    const r2 = await createAiClient('https://ai.test', nonJson).narrate(narrateReq);
    expect(r2).toEqual({ ok: false, reason: 'error' });
  });

  it('aborts a slow call after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const f = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ) as unknown as typeof fetch;
      const p = createAiClient('https://ai.test', f).narrate(narrateReq);
      await jest.advanceTimersByTimeAsync(14000);
      let settled = false;
      void p.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1500);
      expect(await p).toEqual({ ok: false, reason: 'error' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ai client history', () => {
  it('understand sends at most six turns, each clipped to 200 characters, without empty ones', async () => {
    const f = fakeFetch(200, { understanding: { kind: 'unknown' }, remaining: 4 });
    const history = [
      { role: 'user' as const, text: 'eski' },
      ...Array.from({ length: 5 }, (_, i) => ({
        role: i % 2 ? ('user' as const) : ('bot' as const),
        text: `${i}`.repeat(600),
      })),
      { role: 'bot' as const, text: '  ' },
    ];
    await createAiClient('https://ai.test', f).understand({ ...understandReq, history });
    const sent = JSON.parse((f as unknown as jest.Mock).mock.calls[0][1].body as string);
    expect(sent.history).toHaveLength(5);
    expect(sent.history[0].text).toBe('0'.repeat(200));
    for (const h of sent.history) expect(h.text.length).toBeLessThanOrEqual(200);
  });
});

describe('ai client upstream detail', () => {
  it('ignores the diagnostic field of a 502 and keeps the remaining count', async () => {
    const f = fakeFetch(502, {
      error: 'upstream',
      remaining: 10,
      detail: 'anthropic_401_authentication_error',
    });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', remaining: 10, detail: 'http' });
  });
});

describe('ai client dev warning for a failed call', () => {
  const warns = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

  it('prints the worker detail and message, each cut to 300 characters, never the text', async () => {
    const f = fakeFetch(502, {
      error: 'upstream',
      remaining: 9,
      detail: 'anthropic_400_invalid_request_error',
      message: 'messages.0.content: must not be empty ' + 'x'.repeat(400),
    });
    await createAiClient('https://ai.test', f).understand(understandReq);
    expect(warns()).toEqual([
      `[ai] /understand failed: http (HTTP 502) anthropic_400_invalid_request_error — messages.0.content: must not be empty ${'x'.repeat(300 - 'messages.0.content: must not be empty '.length)}`,
    ]);
    expect(warns().join('')).not.toContain(understandReq.text);
  });

  it('prints the detail alone, and ignores a detail or message that is not a string', async () => {
    await createAiClient('https://ai.test', fakeFetch(502, { detail: 'SyntaxError' })).understand(understandReq);
    await createAiClient('https://ai.test', fakeFetch(502, { detail: 7, message: { a: 1 } })).understand(understandReq);
    expect(warns()).toEqual([
      '[ai] /understand failed: http (HTTP 502) SyntaxError',
      '[ai] /understand failed: http (HTTP 502)',
    ]);
  });

  it('does the same for every other endpoint', async () => {
    const f = fakeFetch(502, { detail: 'anthropic_529_overloaded_error' });
    const c = createAiClient('https://ai.test', f);
    await c.narrate(narrateReq);
    await c.chat({ deviceId: 'd-test', messageId: 'm1', text: 'selam', history: [] });
    await c.quota('d-test');
    expect(warns()).toEqual([
      '[ai] /narrate failed: http (HTTP 502) anthropic_529_overloaded_error',
      '[ai] /chat failed: http (HTTP 502) anthropic_529_overloaded_error',
      '[ai] /quota failed: http (HTTP 502) anthropic_529_overloaded_error',
    ]);
  });

  it('a body that is not JSON still warns with the status', async () => {
    const f = jest.fn(async () => ({
      status: 502,
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    await createAiClient('https://ai.test', f).understand(understandReq);
    expect(warns()).toEqual(['[ai] /understand failed: http (HTTP 502)']);
  });
});

describe('ai client quota', () => {
  it('returns the remaining count', async () => {
    const f = fakeFetch(200, { remaining: 3 });
    expect(await createAiClient('https://ai.test', f).quota('d-test')).toBe(3);
    expect(f).toHaveBeenCalledWith(
      'https://ai.test/quota',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ deviceId: 'd-test' }) }),
    );
  });

  it('is null on 404 (older server), errors and bad bodies', async () => {
    expect(await createAiClient('https://ai.test', fakeFetch(404, {})).quota('d')).toBeNull();
    expect(await createAiClient('https://ai.test', fakeFetch(429, {})).quota('d')).toBeNull();
    expect(await createAiClient('https://ai.test', fakeFetch(200, {})).quota('d')).toBeNull();
    const down = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await createAiClient('https://ai.test', down).quota('d')).toBeNull();
  });
});

describe('ai client pick / plan / understand extras', () => {
  const pickReq = {
    deviceId: 'd-test',
    messageId: 'm1',
    text: 'romantik bir yer',
    candidates: [0, 1, 2].map((i) => ({
      i,
      kind: 'restaurant' as const,
      walkMin: 5,
      openState: 'unknown' as const,
      closesLate: false,
      parkingM: null,
      parkingFree: null,
      freeSpots: null,
      dishMatch: 'none' as const,
      outdoor: null,
    })),
  };
  const pick = { pick: 1, reasons: ['closest'], runnerUp: null, runnerUpWhy: null, tone: null };

  it('returns a pick that fits the candidates', async () => {
    const f = fakeFetch(200, { pick, remaining: 3 });
    const r = await createAiClient('https://ai.test', f).pick(pickReq);
    expect(r).toEqual({ ok: true, value: pick, remaining: 3 });
    expect(f).toHaveBeenCalledWith('https://ai.test/pick', expect.anything());
  });

  it('treats an out-of-range pick, or a null one, as an error', async () => {
    for (const b of [{ ...pick, pick: 3 }, { ...pick, pick: -1 }, { ...pick, pick: 0.5 }, null]) {
      const r = await createAiClient(
        'https://ai.test',
        fakeFetch(200, { pick: b, remaining: 3 }),
      ).pick(pickReq);
      expect(r).toEqual({ ok: false, reason: 'error' });
    }
  });

  it('keeps a pick whose extras are odd: unknown or extra reasons and an out-of-range runner-up are dropped', async () => {
    const cases: [object, object][] = [
      [{ ...pick, reasons: ['cheapest'] }, { ...pick, reasons: [] }],
      [
        { ...pick, reasons: ['closest', 'open_now', 'outdoor', 'free_parking'] },
        { ...pick, reasons: ['closest', 'open_now', 'outdoor'] },
      ],
      [{ ...pick, runnerUp: 7, runnerUpWhy: 'closest' }, { ...pick, runnerUp: null, runnerUpWhy: 'closest' }],
    ];
    for (const [sent, kept] of cases) {
      const r = await createAiClient(
        'https://ai.test',
        fakeFetch(200, { pick: sent, remaining: 3 }),
      ).pick(pickReq);
      expect(r).toEqual({ ok: true, value: kept, remaining: 3 });
    }
  });

  it('carries remaining on a 502 and 429', async () => {
    const r502 = await createAiClient(
      'https://ai.test',
      fakeFetch(502, { error: 'upstream', remaining: 4 }),
    ).pick(pickReq);
    expect(r502).toEqual({ ok: false, reason: 'error', remaining: 4 });
    const r429 = await createAiClient('https://ai.test', fakeFetch(429, { remaining: 0 })).pick(
      pickReq,
    );
    expect(r429).toEqual({ ok: false, reason: 'quota', remaining: 0 });
  });

  it('bounds a plan by the restaurants and the car parks sent', async () => {
    const planReq = {
      deviceId: 'd-test',
      messageId: 'm1',
      text: 'önce park sonra yemek',
      when: 'now' as const,
      candidates: [
        {
          ...pickReq.candidates[0]!,
          parkings: [
            { p: 0, walkMin: 1, parkingFree: null, freeSpots: null, openState: 'open' as const },
            { p: 1, walkMin: 2, parkingFree: null, freeSpots: null, openState: 'open' as const },
          ],
        },
      ],
    };
    const ok = { restaurant: 0, parking: 1, reasons: ['closest'], tone: null };
    const good = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { plan: ok, remaining: 2 }),
    ).plan(planReq);
    expect(good).toEqual({ ok: true, value: ok, remaining: 2 });
    const bad = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { plan: { ...ok, parking: 2 }, remaining: 2 }),
    ).plan(planReq);
    expect(bad).toEqual({ ok: false, reason: 'error' });
  });

  it('parses a car park pick with its own reason codes', async () => {
    const parkReq = {
      deviceId: 'd',
      messageId: 'm',
      text: 'konak otopark',
      candidates: [0, 1].map((i) => ({
        i,
        kind: 'parking' as const,
        walkMin: 3,
        openState: 'open' as const,
        nonstop: false,
        free: null,
        tariffKnown: false,
        covered: null,
        freeSpots: null,
        nearRail: false,
        capacity: null,
      })),
    };
    const ok = { pick: 0, reasons: ['near_rail'], runnerUp: null, runnerUpWhy: null, tone: null };
    const r = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { pick: ok, remaining: 1 }),
    ).pickPark(parkReq);
    expect(r.ok).toBe(true);
    const food = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { pick: { ...ok, reasons: ['outdoor'] }, remaining: 1 }),
    ).pickPark(parkReq);
    // A restaurant reason is not a car park reason: it is dropped, the pick stays.
    expect(food).toMatchObject({ ok: true, value: { pick: 0, reasons: [] } });
  });

  it('keeps an understanding with an unknown wish and drops the wish', async () => {
    const u = {
      kind: 'search',
      district: null,
      cat: null,
      dish: null,
      place: null,
      food: true,
      requireParking: false,
      appleQuery: null,
      wishes: ['spacey'],
    };
    const r = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { understanding: u, remaining: 3 }),
    ).understand(understandReq);
    expect(r).toMatchObject({ ok: true, value: { kind: 'search', wishes: [] } });
  });

  it('rejects an understanding of an unknown kind', async () => {
    const r = await createAiClient(
      'https://ai.test',
      fakeFetch(200, { understanding: { kind: 'weather' }, remaining: 3 }),
    ).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'schema' });
  });
});

describe('ai client chat', () => {
  const chatReq = {
    deviceId: 'd-test',
    messageId: 'm1',
    text: 'iyi günler',
    history: [],
  };

  it('returns the reply and action', async () => {
    const body = { reply: 'Size de iyi günler!', action: 'none' };
    const f = fakeFetch(200, body);
    const r = await createAiClient('https://ai.test', f).chat(chatReq);
    expect(r).toEqual(body);
    expect(f).toHaveBeenCalledWith(
      'https://ai.test/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends at most four turns and clips long texts', async () => {
    const f = fakeFetch(200, { reply: 'Selam!', action: 'none' });
    const turn = { role: 'user' as const, text: 'x'.repeat(400) };
    await createAiClient('https://ai.test', f).chat({
      ...chatReq,
      text: 'y'.repeat(400),
      history: Array(6).fill(turn),
    });
    const sent = JSON.parse((f as unknown as jest.Mock).mock.calls[0][1].body as string);
    expect(sent.text).toHaveLength(300);
    expect(sent.history).toHaveLength(4);
    expect(sent.history[0].text).toHaveLength(300);
  });

  it('returns null on a limit, a server error, a bad shape or a network error', async () => {
    const client = (f: typeof fetch) => createAiClient('https://ai.test', f);
    expect(await client(fakeFetch(429, { reason: 'global' })).chat(chatReq)).toBeNull();
    expect(await client(fakeFetch(502, { error: 'upstream' })).chat(chatReq)).toBeNull();
    expect(await client(fakeFetch(200, { reply: 7, action: 'none' })).chat(chatReq)).toBeNull();
    expect(await client(fakeFetch(200, { reply: 5, action: 'none' })).chat(chatReq)).toBeNull();
    const down = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await client(down).chat(chatReq)).toBeNull();
  });
});

describe('ai client city', () => {
  afterEach(() => setActiveCity('izmir'));

  const sentBody = (f: typeof fetch, call = 0) => {
    const init = (f as unknown as jest.Mock).mock.calls[call]![1] as { body: string };
    return JSON.parse(init.body) as Record<string, unknown>;
  };

  it('sends the selected city with every request', async () => {
    const f = fakeFetch(200, { reply: 'Selam', remaining: 3 });
    await createAiClient('https://ai.test', f).narrate(narrateReq);
    expect(sentBody(f).city).toBe('izmir');

    setActiveCity('istanbul');
    const g = fakeFetch(200, { understanding: { kind: 'unknown' }, remaining: 3 });
    await createAiClient('https://ai.test', g).understand(understandReq);
    expect(sentBody(g).city).toBe('istanbul');
  });

  it('retries once without the city when an older worker answers 400 (unknown city)', async () => {
    setActiveCity('ankara');
    const ok = { understanding: { kind: 'unknown' }, remaining: 3 };
    const f = jest
      .fn()
      .mockResolvedValueOnce({ status: 400, ok: false, json: async () => ({ error: 'bad_request' }) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ok }) as unknown as typeof fetch;
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sentBody(f, 0).city).toBe('ankara');
    expect('city' in sentBody(f, 1)).toBe(false);
  });

  it('retries only once: a second 400 is a failure', async () => {
    setActiveCity('ankara');
    const f = fakeFetch(400, { error: 'bad_request' });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toMatchObject({ ok: false, reason: 'error' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('keeps a city the caller set', async () => {
    setActiveCity('istanbul');
    const f = fakeFetch(200, { understanding: { kind: 'unknown' }, remaining: 3 });
    await createAiClient('https://ai.test', f).understand({ ...understandReq, city: 'izmir' });
    expect(sentBody(f).city).toBe('izmir');
  });
});
