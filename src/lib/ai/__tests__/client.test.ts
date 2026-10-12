import { createAiClient } from '../client';
import type { NarrateRequest, UnderstandRequest } from '../protocol';

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

const fakeFetch = (status: number, body: unknown) =>
  jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;

describe('ai client', () => {
  it('returns the understanding and remaining count', async () => {
    const understanding = { kind: 'offtopic', reply: 'Selam!' };
    const f = fakeFetch(200, { understanding, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: true, value: understanding, remaining: 4 });
    expect(f).toHaveBeenCalledWith(
      'https://ai.test/understand',
      expect.objectContaining({ method: 'POST' }),
    );
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
      value: { ...old, nearMe: false, dishServes: null },
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
    expect(r).toEqual({ ok: true, value: next, remaining: 3 });
  });

  it('returns the narration', async () => {
    const f = fakeFetch(200, { reply: 'Hocam {1} yakın', remaining: 3 });
    const r = await createAiClient('https://ai.test', f).narrate(narrateReq);
    expect(r).toEqual({ ok: true, value: 'Hocam {1} yakın', remaining: 3 });
  });

  it('maps 429 to quota', async () => {
    const r = await createAiClient('https://ai.test', fakeFetch(429, {})).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'quota' });
  });

  it('maps a server error to error', async () => {
    const r = await createAiClient('https://ai.test', fakeFetch(500, {})).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error' });
  });

  it('maps an invalid body to error', async () => {
    const f = fakeFetch(200, { understanding: { kind: 'nope' }, remaining: 4 });
    const r = await createAiClient('https://ai.test', f).understand(understandReq);
    expect(r).toEqual({ ok: false, reason: 'error' });
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
    expect(r).toEqual({ ok: false, reason: 'quota', remaining: 0 });
  });

  it('ignores a non-numeric remaining or a non-JSON error body', async () => {
    const bad = fakeFetch(502, { remaining: 'x' });
    const r1 = await createAiClient('https://ai.test', bad).understand(understandReq);
    expect(r1).toEqual({ ok: false, reason: 'error' });
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
