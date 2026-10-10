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
});
