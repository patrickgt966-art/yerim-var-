import '@/i18n';

import { createAiClient } from '../client';
import { MAX_CHAT_CHARS, REPLY_TIMEOUT_MS, type ReplyRequest } from '../protocol';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const fakeFetch = (status: number, body: unknown) =>
  jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;

const req: ReplyRequest = {
  deviceId: 'd-test',
  messageId: 'm1',
  userText: 'Alsancak balık',
  kind: 'food',
  facts: { where: 'Alsancak', count: 12, items: [{ name: 'Mavi Balık', walkMin: 3 }] },
};

describe('ai client reply', () => {
  it('posts the facts to /reply and returns the text', async () => {
    const f = fakeFetch(200, { text: "Alsancak'ta 12 yer buldum." });
    const text = await createAiClient('https://ai.test', f).reply(req);
    expect(text).toBe("Alsancak'ta 12 yer buldum.");
    expect(f).toHaveBeenCalledWith(
      'https://ai.test/reply',
      expect.objectContaining({ method: 'POST' }),
    );
    const sent = JSON.parse((f as unknown as jest.Mock).mock.calls[0]![1].body as string);
    expect(sent).toMatchObject({ messageId: 'm1', kind: 'food', facts: req.facts });
  });

  it('clips the user text and sends nothing personal', async () => {
    const f = fakeFetch(200, { text: 'Tamam.' });
    await createAiClient('https://ai.test', f).reply({ ...req, userText: 'y'.repeat(500) });
    const sent = JSON.parse((f as unknown as jest.Mock).mock.calls[0]![1].body as string);
    expect(sent.userText).toHaveLength(MAX_CHAT_CHARS);
    expect(Object.keys(sent).sort()).toEqual(
      ['city', 'deviceId', 'facts', 'kind', 'messageId', 'userText'].sort(),
    );
  });

  it('is null on a refusal, a limit, a bad shape or a network error', async () => {
    const client = (f: typeof fetch) => createAiClient('https://ai.test', f);
    expect(await client(fakeFetch(429, { reason: 'used' })).reply(req)).toBeNull();
    expect(await client(fakeFetch(409, { error: 'no_message' })).reply(req)).toBeNull();
    expect(await client(fakeFetch(502, { error: 'upstream' })).reply(req)).toBeNull();
    expect(await client(fakeFetch(200, { text: 7 })).reply(req)).toBeNull();
    expect(await client(fakeFetch(200, { text: '  ' })).reply(req)).toBeNull();
    const down = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await client(down).reply(req)).toBeNull();
  });

  it('gives up after REPLY_TIMEOUT_MS and does not cancel the message', async () => {
    jest.useFakeTimers();
    const f = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const pending = createAiClient('https://ai.test', f).reply(req);
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(REPLY_TIMEOUT_MS).toBe(3000);
  });
});
