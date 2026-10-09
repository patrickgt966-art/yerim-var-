import Constants from 'expo-constants';

import {
  HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  UnderstandingSchema,
  type NarrateRequest,
  type Understanding,
  type UnderstandRequest,
} from './protocol';

const TIMEOUT_MS = 6000;

/** Server URL from app.json extra.aiUrl; null keeps the AI layer off. */
export function aiBaseUrl(): string | null {
  const url: unknown = Constants.expoConfig?.extra?.aiUrl;
  return typeof url === 'string' && url !== '' ? url : null;
}

export type AiResult<T> =
  | { ok: true; value: T; remaining: number }
  | { ok: false; reason: 'off' | 'quota' | 'error' };

const fail = (reason: 'quota' | 'error'): { ok: false; reason: 'quota' | 'error' } => ({
  ok: false,
  reason,
});

export function createAiClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  /** POSTs the body; resolves to the parsed JSON, 'quota' on 429, or 'error'. */
  async function post(path: string, body: unknown): Promise<unknown | 'quota' | 'error'> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429) return 'quota';
      if (!res.ok) return 'error';
      return await res.json();
    } catch {
      return 'error';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async understand(req: UnderstandRequest): Promise<AiResult<Understanding>> {
      const data = await post('/understand', {
        ...req,
        text: req.text.slice(0, MAX_MESSAGE_CHARS),
        history: req.history.slice(-HISTORY_LIMIT),
      });
      if (data === 'quota' || data === 'error') return fail(data);
      const body = data as { understanding?: unknown; remaining?: unknown } | null;
      const parsed = UnderstandingSchema.safeParse(body?.understanding);
      if (!parsed.success || typeof body?.remaining !== 'number') return fail('error');
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    async narrate(req: NarrateRequest): Promise<AiResult<string>> {
      const data = await post('/narrate', {
        ...req,
        text: req.text.slice(0, MAX_MESSAGE_CHARS),
      });
      if (data === 'quota' || data === 'error') return fail(data);
      const body = data as { reply?: unknown; remaining?: unknown } | null;
      if (typeof body?.reply !== 'string' || typeof body.remaining !== 'number') {
        return fail('error');
      }
      return { ok: true, value: body.reply, remaining: body.remaining };
    },
  };
}
