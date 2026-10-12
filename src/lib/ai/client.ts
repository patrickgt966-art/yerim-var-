import Constants from 'expo-constants';

import {
  HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  UnderstandingClientSchema,
  type NarrateRequest,
  type Understanding,
  type UnderstandRequest,
} from './protocol';

// Haiku with structured output can take well over 6 s; understand is the shorter call.
const UNDERSTAND_TIMEOUT_MS = 12000;
const NARRATE_TIMEOUT_MS = 15000;
const QUOTA_TIMEOUT_MS = 6000;

/** Server URL from app.json extra.aiUrl; null keeps the AI layer off. */
export function aiBaseUrl(): string | null {
  const url: unknown = Constants.expoConfig?.extra?.aiUrl;
  return typeof url === 'string' && url !== '' ? url : null;
}

export type AiResult<T> =
  | { ok: true; value: T; remaining: number }
  /** `remaining` is the server's count after a failure (an older server omits it). */
  | { ok: false; reason: 'off' | 'quota' | 'error'; remaining?: number };

type Failure = { failed: 'quota' | 'error'; remaining?: number };

const fail = (
  reason: 'quota' | 'error',
  remaining?: number,
): { ok: false; reason: 'quota' | 'error'; remaining?: number } =>
  remaining === undefined ? { ok: false, reason } : { ok: false, reason, remaining };

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export function createAiClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  /** POSTs the body; resolves to the parsed JSON, or a Failure (carrying `remaining` when sent). */
  async function post(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ data: unknown } | Failure> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const failed = res.status === 429 ? 'quota' : 'error';
        try {
          const err = (await res.json()) as { remaining?: unknown } | null;
          return { failed, remaining: num(err?.remaining) };
        } catch {
          return { failed };
        }
      }
      return { data: await res.json() };
    } catch {
      return { failed: 'error' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async understand(req: UnderstandRequest): Promise<AiResult<Understanding>> {
      const res = await post(
        '/understand',
        {
          ...req,
          text: req.text.slice(0, MAX_MESSAGE_CHARS),
          history: req.history.slice(-HISTORY_LIMIT),
        },
        UNDERSTAND_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { understanding?: unknown; remaining?: unknown } | null;
      const parsed = UnderstandingClientSchema.safeParse(body?.understanding);
      if (!parsed.success || typeof body?.remaining !== 'number') return fail('error');
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    async narrate(req: NarrateRequest): Promise<AiResult<string>> {
      const res = await post(
        '/narrate',
        { ...req, text: req.text.slice(0, MAX_MESSAGE_CHARS) },
        NARRATE_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { reply?: unknown; remaining?: unknown } | null;
      if (typeof body?.reply !== 'string' || typeof body.remaining !== 'number') {
        return fail('error');
      }
      return { ok: true, value: body.reply, remaining: body.remaining };
    },

    /** Server-side uses left today; null on any error (an older server has no /quota). */
    async quota(deviceId: string): Promise<number | null> {
      const res = await post('/quota', { deviceId }, QUOTA_TIMEOUT_MS);
      if ('failed' in res) return null;
      return num((res.data as { remaining?: unknown } | null)?.remaining) ?? null;
    },
  };
}
