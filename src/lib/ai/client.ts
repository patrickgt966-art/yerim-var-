import Constants from 'expo-constants';

import { activeCity } from '@/data/cities';

import {
  CHAT_HISTORY_LIMIT,
  HISTORY_LIMIT,
  MAX_CHAT_CHARS,
  MAX_MESSAGE_CHARS,
  ROUTER_TIMEOUT_MS,
  UnderstandingClientSchema,
  chatOutputSchema,
  parkPickOutputSchema,
  pickOutputSchema,
  planOutputSchema,
  type ChatRequest,
  type ChatResponse,
  type ChatTurn,
  type NarrateRequest,
  type ParkPickRequest,
  type ParkPickResponse,
  type PickRequest,
  type PickResponse,
  type PlanRequest,
  type PlanResponse,
  type Understanding,
  type UnderstandRequest,
} from './protocol';

// The router (/understand) answers every message, so it must not hang: after this long the app
// gives up, answers with its own rules and tells the server to cancel (the use is given back).
const UNDERSTAND_TIMEOUT_MS = ROUTER_TIMEOUT_MS;
const NARRATE_TIMEOUT_MS = 15000;
const PICK_TIMEOUT_MS = 12000;
const QUOTA_TIMEOUT_MS = 6000;
const CHAT_TIMEOUT_MS = 8000;

/** Server URL from app.json extra.aiUrl; null keeps the AI layer off. */
export function aiBaseUrl(): string | null {
  const url: unknown = Constants.expoConfig?.extra?.aiUrl;
  return typeof url === 'string' && url !== '' ? url : null;
}

export type AiResult<T> =
  | { ok: true; value: T; remaining: number }
  /** `remaining` is the server's count after a failure (an older server omits it). */
  | { ok: false; reason: 'off' | 'quota' | 'error'; remaining?: number; detail?: AiFailDetail };

/** Why a call failed: gave up waiting, an HTTP error status, no connection, or a reply that does not fit. */
export type AiFailDetail = 'timeout' | 'http' | 'network' | 'schema';

type Failure = {
  failed: 'quota' | 'error';
  remaining?: number;
  timedOut?: boolean;
  detail: AiFailDetail;
};

const fail = (
  reason: 'quota' | 'error',
  remaining?: number,
  detail?: AiFailDetail,
): { ok: false; reason: 'quota' | 'error'; remaining?: number; detail?: AiFailDetail } => ({
  ok: false,
  reason,
  ...(remaining === undefined ? {} : { remaining }),
  ...(detail === undefined ? {} : { detail }),
});

/** Dev only (shows in the `expo start` terminal). Never the message text. */
function warnDev(path: string, detail: AiFailDetail, extra?: string): void {
  if (__DEV__) console.warn(`[ai] ${path} failed: ${detail}${extra ? ` (${extra})` : ''}`);
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** The request for the selected city. A worker that predates the field ignores it. */
const forCity = <T extends { city?: string }>(req: T): T => ({
  ...req,
  city: req.city ?? activeCity().id,
});

/**
 * The history as the server accepts it: the last `maxTurns` turns, each text clipped to `maxChars`
 * (the start stays; bot replies are often longer) and turns without text dropped.
 */
function clipHistory(history: ChatTurn[], maxTurns: number, maxChars: number): ChatTurn[] {
  return history
    .slice(-maxTurns)
    .map((h) => ({ role: h.role, text: h.text.slice(0, maxChars) }))
    .filter((h) => h.text.trim() !== '');
}

export function createAiClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  /** POSTs the body; resolves to the parsed JSON, or a Failure (carrying `remaining` when sent). */
  async function post(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ data: unknown } | Failure> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const res = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        warnDev(path, 'http', `HTTP ${res.status}`);
        let failed: 'quota' | 'error' = res.status === 429 ? 'quota' : 'error';
        try {
          const err = (await res.json()) as { remaining?: unknown; reason?: unknown } | null;
          // Too fast or a busy server is no empty quota: the uses left are still there.
          if (err?.reason === 'slow' || err?.reason === 'global') failed = 'error';
          return { failed, remaining: num(err?.remaining), detail: 'http' };
        } catch {
          return { failed, detail: 'http' };
        }
      }
      try {
        return { data: await res.json() };
      } catch {
        warnDev(path, 'schema', `HTTP ${res.status}, body is not JSON`);
        return { failed: 'error', detail: 'schema' };
      }
    } catch {
      const detail = timedOut ? 'timeout' : 'network';
      warnDev(path, detail);
      return { failed: 'error', detail, ...(timedOut ? { timedOut: true } : {}) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fire and forget: the server gives the message's use back. Never throws, never awaited. */
  function cancel(deviceId: string, messageId: string): void {
    void post('/cancel', { deviceId, messageId }, QUOTA_TIMEOUT_MS);
  }

  return {
    async understand(req: UnderstandRequest): Promise<AiResult<Understanding>> {
      const res = await post(
        '/understand',
        {
          ...forCity(req),
          text: req.text.slice(0, MAX_MESSAGE_CHARS),
          history: clipHistory(req.history, HISTORY_LIMIT, MAX_MESSAGE_CHARS),
        },
        UNDERSTAND_TIMEOUT_MS,
      );
      if ('failed' in res) {
        // Gave up waiting: the server may still be working (or have charged); take the use back.
        if (res.timedOut) cancel(req.deviceId, req.messageId);
        return fail(res.failed, res.remaining, res.detail);
      }
      const body = res.data as { understanding?: unknown; remaining?: unknown } | null;
      const parsed = UnderstandingClientSchema.safeParse(body?.understanding);
      if (!parsed.success || typeof body?.remaining !== 'number') {
        const issue = parsed.success ? 'remaining' : parsed.error.issues[0]?.path.join('.') || '(root)';
        warnDev('/understand', 'schema', `HTTP 200, first issue at ${issue}`);
        return fail('error', undefined, 'schema');
      }
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    async narrate(req: NarrateRequest): Promise<AiResult<string>> {
      const res = await post(
        '/narrate',
        { ...forCity(req), text: req.text.slice(0, MAX_MESSAGE_CHARS) },
        NARRATE_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { reply?: unknown; remaining?: unknown } | null;
      if (typeof body?.reply !== 'string' || typeof body.remaining !== 'number') {
        return fail('error');
      }
      return { ok: true, value: body.reply, remaining: body.remaining };
    },

    /** Job 2. The result must fit the candidate count, or it counts as a failure. */
    async pick(req: PickRequest): Promise<AiResult<PickResponse>> {
      const res = await post(
        '/pick',
        { ...forCity(req), text: req.text.slice(0, MAX_MESSAGE_CHARS) },
        PICK_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { pick?: unknown; remaining?: unknown } | null;
      const parsed = pickOutputSchema(req.candidates.length).safeParse(body?.pick);
      if (!parsed.success || typeof body?.remaining !== 'number') return fail('error');
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    /** Job 2 for car parks (same endpoint, the candidates say which kind). */
    async pickPark(req: ParkPickRequest): Promise<AiResult<ParkPickResponse>> {
      const res = await post(
        '/pick',
        { ...forCity(req), text: req.text.slice(0, MAX_MESSAGE_CHARS) },
        PICK_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { pick?: unknown; remaining?: unknown } | null;
      const parsed = parkPickOutputSchema(req.candidates.length).safeParse(body?.pick);
      if (!parsed.success || typeof body?.remaining !== 'number') return fail('error');
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    /** Job 4. Restaurant and car park indices are bounded by what was sent. */
    async plan(req: PlanRequest): Promise<AiResult<PlanResponse>> {
      const res = await post(
        '/plan',
        { ...forCity(req), text: req.text.slice(0, MAX_MESSAGE_CHARS) },
        PICK_TIMEOUT_MS,
      );
      if ('failed' in res) return fail(res.failed, res.remaining);
      const body = res.data as { plan?: unknown; remaining?: unknown } | null;
      const parks = req.candidates.reduce((n, c) => n + c.parkings.length, 0);
      const parsed = planOutputSchema(req.candidates.length, parks).safeParse(body?.plan);
      if (!parsed.success || typeof body?.remaining !== 'number') return fail('error');
      return { ok: true, value: parsed.data, remaining: body.remaining };
    },

    /**
     * Small talk. Costs no ✨ and has no `remaining`; null on any failure (a limit, an error, a
     * timeout, a reply that does not fit the schema), so the caller uses its own template.
     */
    async chat(req: ChatRequest): Promise<ChatResponse | null> {
      const res = await post(
        '/chat',
        {
          ...forCity(req),
          text: req.text.slice(0, MAX_CHAT_CHARS),
          history: clipHistory(req.history, CHAT_HISTORY_LIMIT, MAX_CHAT_CHARS),
        },
        CHAT_TIMEOUT_MS,
      );
      if ('failed' in res) return null;
      const parsed = chatOutputSchema.safeParse(res.data);
      return parsed.success ? parsed.data : null;
    },

    /** Server-side uses left today; null on any error (an older server has no /quota). */
    async quota(deviceId: string): Promise<number | null> {
      const res = await post('/quota', { deviceId }, QUOTA_TIMEOUT_MS);
      if ('failed' in res) return null;
      return num((res.data as { remaining?: unknown } | null)?.remaining) ?? null;
    },
  };
}
