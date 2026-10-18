import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  UnderstandingModelSchema,
  chatOutputSchema,
  chatSystem,
  langNote,
  narrateSystem,
  parkPickModelSchema,
  parkPickSystem,
  pickModelSchema,
  pickSystem,
  planModelSchema,
  planSystem,
  toChat,
  toPick,
  toPlan,
  toUnderstanding,
  todayIstanbul,
  understandSystem,
  type Understanding,
} from '../../../src/lib/ai/protocol';
import { ADMIN_PAGE_HTML } from './adminPage';
import {
  aiLimits,
  ipKey,
  toMessages,
  validCancel,
  validChat,
  validNarrate,
  validPick,
  validPlan,
  validQuota,
  validUnderstand,
} from './quota';
import {
  FLAG_AT,
  networkOf,
  sameSecret,
  shortHash,
  validCity,
  validReport,
  validReview,
} from './reports';
import { siteRoute } from './site';
import { localQuota, objectQuota, type Quota, type QuotaNamespace } from './store';

export { QuotaCounter } from './store';

export interface Env {
  QUOTA: KVNamespace;
  /** The quota Durable Object (wrangler.toml); every counter runs there, one call at a time. */
  QUOTA_DO?: QuotaNamespace;
  ANTHROPIC_API_KEY: string;
  /** Limits from wrangler.toml [vars] (strings); see aiLimits for the defaults. */
  AI_GLOBAL_DAILY?: string;
  /** The former name of AI_GLOBAL_DAILY; read when that one is not set. */
  CHAT_GLOBAL_DAILY?: string;
  AI_DAILY_PER_IP?: string;
  CHAT_MIN_INTERVAL_MS?: string;
  /** Distinct networks that must report a place closed (on 2+ days) to flag it (default 3). */
  REPORT_FLAG_AT?: string;
  /** The maintainer's key for /admin/* (`wrangler secret put ADMIN_TOKEN`); unset turns them off. */
  ADMIN_TOKEN?: string;
  /** The App Store page of the app (wrangler.toml [vars]); empty until the app is live. */
  APP_STORE_URL?: string;
  /** The App Store numeric app id, for the Smart App Banner; empty until the app is live. */
  APP_STORE_ID?: string;
  /** The Apple Developer team id, for /.well-known/apple-app-site-association; empty until paid. */
  APPLE_TEAM_ID?: string;
}

/** The counters: the Durable Object when bound, else in-process on KV (tests). */
const quotaOf = (env: Env): Quota =>
  env.QUOTA_DO ? objectQuota(env.QUOTA_DO) : localQuota(env.QUOTA);

const MODEL = 'claude-haiku-5-5';

/** A short code that is safe to return and log: letters, digits and underscores only. */
const safeCode = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60) : '';

/**
 * Why a call to Anthropic threw, without the error message (it can echo keys or text): the SDK's
 * APIError carries a status and the API's error type ("anthropic_401_authentication_error");
 * anything else gives its name.
 */
function errorDetail(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'unknown';
  const e = err as {
    status?: unknown;
    error?: { error?: { type?: unknown }; type?: unknown };
    name?: unknown;
  };
  if (typeof e.status === 'number') {
    const type = safeCode(e.error?.error?.type) || safeCode(e.error?.type) || 'unknown';
    return `anthropic_${e.status}_${type}`;
  }
  return safeCode(e.name) || 'unknown';
}

/**
 * The API's own message for a 400 invalid_request_error: it describes our request schema and
 * parameters, not the user's text. Safety net: anything inside quotes longer than 40 characters is
 * stripped (so a fragment of user text cannot leak) and the rest is cut to 300 characters.
 */
function invalidRequestMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { status?: unknown; error?: { error?: { type?: unknown; message?: unknown } } };
  const inner = e.error?.error;
  if (e.status !== 400 || inner?.type !== 'invalid_request_error') return undefined;
  if (typeof inner.message !== 'string' || inner.message === '') return undefined;
  return inner.message
    .replace(/"[^"]{41,}"|“[^”]{41,}”|`[^`]{41,}`|'[^']{41,}'/g, '"[cut]"')
    .slice(0, 300);
}

/**
 * True when the API answered but the SDK could not read the answer: the structured output was cut
 * off or did not fit the schema (the SDK throws an AnthropicError "Failed to parse structured
 * output ...", or a SyntaxError / ZodError). An HTTP error (it has a status), a lost connection
 * or any other error is a real upstream failure.
 */
function unreadableOutput(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: unknown; name?: unknown; message?: unknown };
  if (typeof e.status === 'number') return false;
  return (
    e.name === 'SyntaxError' ||
    e.name === 'ZodError' ||
    (typeof e.message === 'string' && e.message.startsWith('Failed to parse structured output'))
  );
}

/**
 * The system prompt as blocks: the city's fixed instructions, cached (each endpoint sends the same
 * text for every message of the city, so after the first message it is read from the prompt cache
 * at a tenth of the price, and cache reads do not count toward the input-tokens-per-minute limit),
 * then what changes per request (the cards line, the language note) after the cache breakpoint.
 */
export function cachedSystem(
  fixed: string,
  rest = '',
): { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] {
  return [
    { type: 'text', text: fixed, cache_control: { type: 'ephemeral' } },
    ...(rest ? [{ type: 'text' as const, text: rest }] : []),
  ];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Remaining uses without charging; never calls Anthropic. Own IP counter so it can't starve AI calls. */
async function quotaRoute(req: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const parsed = validQuota(raw);
  if (!parsed) return json({ error: 'bad_request' }, 400);
  const now = new Date();
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  const quota = quotaOf(env);
  if (!(await quota.ipGuard(`quota:${ip}`, now, 500))) return json({ error: 'rate_limited' }, 429);
  return json({ remaining: await quota.peek(parsed.deviceId, now) });
}

/**
 * The client gave up waiting for a message (timeout): give its use back. Safe to repeat, and safe
 * to arrive before or after the AI call finished (see cancelUse). Never calls Anthropic.
 */
async function cancelRoute(req: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const parsed = validCancel(raw);
  if (!parsed) return json({ error: 'bad_request' }, 400);
  const now = new Date();
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  const quota = quotaOf(env);
  if (!(await quota.ipGuard(`cancel:${ip}`, now, 500))) {
    return json({ error: 'rate_limited' }, 429);
  }
  const { remaining } = await quota.cancel(parsed.deviceId, parsed.messageId, now);
  return json({ remaining });
}

/**
 * A "closed / wrong location / wrong info" report from the app. Never calls Anthropic and never
 * touches the AI counter. The device and its network are kept only hashed with the place.
 */
async function reportRoute(req: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const parsed = validReport(raw);
  if (!parsed) return json({ error: 'bad_request' }, 400);
  const now = new Date();
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  const quota = quotaOf(env);
  if (!(await quota.ipGuard(`report:${ip}`, now, 60))) return json({ error: 'rate_limited' }, 429);
  const flagAt = Math.max(1, Number(env.REPORT_FLAG_AT) || FLAG_AT);
  const out = await quota.report(
    {
      city: parsed.city,
      placeId: parsed.placeId,
      place: parsed.place,
      kind: parsed.kind,
      device: await shortHash('place', parsed.placeId, parsed.deviceId),
      net: await shortHash('net', parsed.placeId, networkOf(ip)),
      dayDevice: await shortHash('day', parsed.deviceId),
    },
    now,
    flagAt,
  );
  if (!out.ok) return json({ error: 'rate_limited', reason: out.reason }, 429);
  return json({ ok: true, flagged: out.flagged });
}

/**
 * The city's places the maintainer hid (`ids`) and the ones flagged by reports (`flagged`).
 * Public and cacheable for an hour.
 */
async function hiddenRoute(req: Request, env: Env): Promise<Response> {
  const city = validCity(new URL(req.url).searchParams.get('city'));
  if (!city) return json({ error: 'bad_request' }, 400);
  const now = new Date();
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  const quota = quotaOf(env);
  if (!(await quota.ipGuard(`hidden:${ip}`, now, 500))) return json({ error: 'rate_limited' }, 429);
  const res = json({ city, ...(await quota.hidden(city, now)) });
  res.headers.set('cache-control', 'public, max-age=3600');
  return res;
}

/**
 * The maintainer's endpoints, behind `Authorization: Bearer <ADMIN_TOKEN>` (a wrangler secret).
 * Without the secret they do not exist. GET /admin/flagged?city= lists the flagged and hidden
 * places; POST /admin/review {city, placeId, action: 'hide' | 'keep'} decides one.
 */
async function adminRoute(req: Request, env: Env, path: string): Promise<Response> {
  if (!env.ADMIN_TOKEN) return json({ error: 'not_found' }, 404);
  const now = new Date();
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
  const quota = quotaOf(env);
  if (!(await quota.ipGuard(`admin:${ip}`, now, 200))) return json({ error: 'rate_limited' }, 429);
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await sameSecret(token, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  if (req.method === 'GET' && path === '/admin/flagged') {
    const city = validCity(new URL(req.url).searchParams.get('city'));
    if (!city) return json({ error: 'bad_request' }, 400);
    return json({ city, places: await quota.flagged(city, now) });
  }
  if (req.method === 'POST' && path === '/admin/review') {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    const review = validReview(raw);
    if (!review) return json({ error: 'bad_request' }, 400);
    await quota.review(review, now);
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}

/** GET /admin: the maintainer's page. Only the UI; it holds no secret and no data. */
function adminPageRoute(env: Env): Response {
  if (!env.ADMIN_TOKEN) return json({ error: 'not_found' }, 404);
  return new Response(ADMIN_PAGE_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}

type Outcome = 'ok' | 'refusal' | 'error';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/quota') return quotaRoute(req, env);
    if (req.method === 'POST' && path === '/cancel') return cancelRoute(req, env);
    if (req.method === 'POST' && path === '/report') return reportRoute(req, env);
    if (req.method === 'GET' && path === '/hidden') return hiddenRoute(req, env);
    if (req.method === 'GET' && path === '/admin') return adminPageRoute(env);
    if (path.startsWith('/admin/')) return adminRoute(req, env, path);
    // The public pages of yerimvar.app: GET only, not logged, before the 404 fallback.
    if (req.method === 'GET') {
      const page = siteRoute(path, req, env);
      if (page) return page;
    }
    if (
      req.method !== 'POST' ||
      !['/understand', '/narrate', '/pick', '/plan', '/chat'].includes(path)
    ) {
      return json({ error: 'not_found' }, 404);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    const understandReq = path === '/understand' ? validUnderstand(raw) : null;
    const narrateReq = path === '/narrate' ? validNarrate(raw) : null;
    const pickReq = path === '/pick' ? validPick(raw) : null;
    const planReq = path === '/plan' ? validPlan(raw) : null;
    // /chat is kept for older app versions; it charges the same counter as everything else.
    const chatReq = path === '/chat' ? validChat(raw) : null;
    const parsed = understandReq ?? narrateReq ?? pickReq ?? planReq ?? chatReq;
    if (!parsed) return json({ error: 'bad_request' }, 400);
    const { deviceId, messageId } = parsed;

    const now = new Date();
    const limits = aiLimits(env);
    const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
    const quota = quotaOf(env);
    if (!(await quota.ipGuard(ip, now, limits.perIp))) {
      return json(
        { error: 'rate_limited', reason: 'ip', remaining: await quota.peek(deviceId, now) },
        429,
      );
    }

    // Retries of the same stage may repeat, but a new question needs a new messageId.
    // Store only a digest, never text/output. The check, the use and the digest are one step.
    const callKey = `ai:call:${todayIstanbul(now)}:${deviceId}:${messageId}:${path}`;
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(parsed)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    // TODO(subscriptions): check an entitlement here and raise the limit (SUB_DAILY) for subscribers.
    const begun = await quota.begin({ deviceId, messageId, callKey, fingerprint, now, limits });
    if (begun.conflict) return json({ error: 'duplicate_message' }, 409);
    const { previous, q } = begun;
    if (!q.ok) {
      return json(
        q.reason === 'quota'
          ? { remaining: 0 }
          : { error: 'rate_limited', reason: q.reason, remaining: q.remaining },
        429,
      );
    }

    // A call Anthropic did not bill (an HTTP error, a lost connection) gives the use back. A call
    // it answered and billed keeps it, even when the answer is unusable (cut off, refused, empty):
    // the text decides that, so a refund would make such calls free and endlessly repeatable.
    const giveBack = async (): Promise<number> => {
      if (!q.added) return q.remaining;
      try {
        return (await quota.release(deviceId, messageId, now)).remaining;
      } catch {
        return q.remaining;
      }
    };

    // One log line per AI call (visible with `npx wrangler tail`): endpoint, duration, outcome,
    // uses left. Never the user's text or the device id.
    const started = Date.now();
    /** Input tokens of the AI call, for the log line: read from the prompt cache, written, uncached. */
    let tokens: { cacheRead: number; cacheWrite: number; uncached: number } | null = null;
    const noteTokens = <T>(res: T): T => {
      const u = (res as { usage?: Record<string, unknown> } | null)?.usage;
      if (u)
        tokens = {
          cacheRead: Number(u.cache_read_input_tokens) || 0,
          cacheWrite: Number(u.cache_creation_input_tokens) || 0,
          uncached: Number(u.input_tokens) || 0,
        };
      return res;
    };
    const respond = async (outcome: Outcome, body: unknown, status = 200): Promise<Response> => {
      let logged: Outcome | 'timeout-cancelled' = outcome;
      let remaining = q.remaining;
      if (body !== null && typeof body === 'object' && 'remaining' in body) {
        remaining = Number((body as { remaining: unknown }).remaining);
      }
      try {
        // The client gave up on this message while we were working: it does not keep the use.
        const back = await quota.releaseIfCancelled(deviceId, messageId, now);
        if (back !== null) {
          logged = 'timeout-cancelled';
          remaining = back;
          if (body !== null && typeof body === 'object' && 'remaining' in body) {
            body = { ...body, remaining };
          }
        }
      } catch {
        // The use stays charged; the user still gets the answer.
      }
      console.log(
        JSON.stringify({
          endpoint: path,
          ms: Date.now() - started,
          outcome: logged,
          remaining,
          ...(tokens ?? {}),
        }),
      );
      return json(body, status);
    };
    const upstreamFail = async (
      outcome: Outcome = 'error',
      detail = 'unknown',
      message?: string,
    ) => {
      console.error('upstream failed', detail, message ?? '');
      const remaining = await giveBack();
      // An outage leaves the stage open for a retry, whether or not /understand spent the use. A
      // billed stage (billedFail and the unusable answers below) stays bound to its content.
      if (!previous) {
        try {
          await quota.resetCall(callKey);
        } catch {
          // A storage outage must not swallow the fallback response.
        }
      }
      return respond(
        outcome,
        message === undefined
          ? { error: 'upstream', remaining, detail }
          : { error: 'upstream', remaining, detail, message },
        502,
      );
    };
    /** Anthropic answered (and billed) but the answer cannot be used: the same 502, use kept. */
    const billedFail = async (outcome: Outcome, detail: string) => {
      console.error('upstream failed', detail, '');
      return respond(outcome, { error: 'upstream', remaining: q.remaining, detail }, 502);
    };
    /** The SDK call, or null when the API answered but the output could not be read. */
    const readable = async <T>(call: () => Promise<T>): Promise<T | null> => {
      try {
        return noteTokens(await call());
      } catch (err) {
        if (!unreadableOutput(err)) throw err;
        console.error('output unreadable', errorDetail(err));
        return null;
      }
    };
    const noOutput = (stopReason: unknown) => `no_output_${safeCode(stopReason) || 'unknown'}`;

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      if (understandReq) {
        const cards = understandReq.lastCards;
        const system = cachedSystem(
          understandSystem(understandReq.city, understandReq.section),
          (cards
            ? `\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
            : '') + langNote(understandReq.lang),
        );
        // An unusable answer was billed: "unknown", and the use is kept.
        const unknown = async (outcome: Outcome = 'error') =>
          respond(outcome, {
            understanding: { kind: 'unknown' } satisfies Understanding,
            remaining: q.remaining,
          });
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 2048,
            system,
            output_config: { effort: 'low', format: zodOutputFormat(UnderstandingModelSchema) },
            messages: toMessages(understandReq.history, understandReq.text),
          }),
        );
        if (!response) return unknown();
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return unknown(response.stop_reason === 'refusal' ? 'refusal' : 'error');
        }
        // The model answers one flat object; the app reads the union it always read. The
        // conversion is total: whatever the model wrote, the result fits the union (at worst
        // "unknown"), so this is a 200 and never a 502.
        const understanding = toUnderstanding(response.parsed_output);
        return respond('ok', { understanding, remaining: q.remaining });
      }

      if (chatReq) {
        const cards = chatReq.lastCards;
        const system = cachedSystem(
          chatSystem(chatReq.city),
          (cards
            ? `\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
            : '') + langNote(chatReq.lang),
        );
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system,
            output_config: { effort: 'low', format: zodOutputFormat(chatOutputSchema) },
            messages: toMessages(chatReq.history, chatReq.text),
          }),
        );
        if (response && (response.stop_reason === 'refusal' || !response.parsed_output)) {
          return billedFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        // Older apps read the bare reply; they never see the count. An unreadable or empty reply
        // is an empty reply (the app then uses its own template); it was billed, so the use stays.
        const said = toChat(response?.parsed_output);
        if (said.reply === '') return respond('error', said);
        return respond('ok', said);
      }

      // Restaurant candidates carry names (to judge fit; the app drops free text that repeats
      // one); the rest are facts, and the output schemas bound every index.
      if (pickReq) {
        const park = pickReq.candidates[0]?.kind === 'parking';
        const n = pickReq.candidates.length;
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(
              park ? parkPickSystem(pickReq.city) : pickSystem(pickReq.city),
              langNote(pickReq.lang),
            ),
            output_config: {
              effort: 'low',
              format: zodOutputFormat(park ? parkPickModelSchema(n) : pickModelSchema(n)),
            },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({ text: pickReq.text, candidates: pickReq.candidates }),
              },
            ],
          }),
        );
        if (response && (response.stop_reason === 'refusal' || !response.parsed_output)) {
          return billedFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        // Total: an unusable pick (no valid index) is `pick: null` with a 200 (billed, so the use
        // stays); the app then answers with its own rules.
        const out = toPick(response?.parsed_output, n, park);
        if (!out) return respond('error', { pick: null, remaining: q.remaining });
        return respond('ok', { pick: out, remaining: q.remaining });
      }

      if (planReq) {
        const total = planReq.candidates.reduce((n, c) => n + c.parkings.length, 0);
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(planSystem(planReq.city), langNote(planReq.lang)),
            output_config: {
              effort: 'low',
              format: zodOutputFormat(planModelSchema(planReq.candidates.length, total)),
            },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  text: planReq.text,
                  when: planReq.when,
                  candidates: planReq.candidates,
                }),
              },
            ],
          }),
        );
        if (response && (response.stop_reason === 'refusal' || !response.parsed_output)) {
          return billedFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        const out = toPlan(response?.parsed_output, planReq.candidates.length, total);
        if (!out) return respond('error', { plan: null, remaining: q.remaining });
        return respond('ok', { plan: out, remaining: q.remaining });
      }

      if (narrateReq) {
        const { text, where, what, total, withParking, results } = narrateReq;
        const response = noteTokens(
          await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(narrateSystem(narrateReq.city), langNote(narrateReq.lang)),
            output_config: { effort: 'low' },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({ text, where, what, total, withParking, results }),
              },
            ],
          }),
        );
        if (response.stop_reason === 'refusal') return billedFail('refusal', noOutput('refusal'));
        let reply = '';
        for (const block of response.content) {
          if (block.type === 'text') reply += block.text;
        }
        reply = reply.trim();
        if (!reply) return billedFail('error', 'empty_reply');
        return respond('ok', { reply, remaining: q.remaining });
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      // Never the user's text, a key or the SDK's message: the status and error type, plus the
      // API's (sanitised) message for a 400 invalid_request_error only.
      return upstreamFail('error', errorDetail(err), invalidRequestMessage(err));
    }
  },
};
