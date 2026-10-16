import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  FREE_DAILY,
  UnderstandingModelSchema,
  chatOutputSchema,
  chatSystem,
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
import {
  aiLimits,
  cancelUse,
  ipGuard,
  peek,
  releaseUse,
  takeUse,
  toMessages,
  validCancel,
  validChat,
  validNarrate,
  validPick,
  validPlan,
  validQuota,
  validUnderstand,
  wasCancelled,
} from './quota';

export interface Env {
  QUOTA: KVNamespace;
  ANTHROPIC_API_KEY: string;
  /** Limits from wrangler.toml [vars] (strings); see aiLimits for the defaults. */
  AI_GLOBAL_DAILY?: string;
  /** The former name of AI_GLOBAL_DAILY; read when that one is not set. */
  CHAT_GLOBAL_DAILY?: string;
  AI_DAILY_PER_IP?: string;
  CHAT_MIN_INTERVAL_MS?: string;
}

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
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await ipGuard(env.QUOTA, `quota:${ip}`, now, 500)))
    return json({ error: 'rate_limited' }, 429);
  return json({ remaining: await peek(env.QUOTA, parsed.deviceId, now) });
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
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await ipGuard(env.QUOTA, `cancel:${ip}`, now, 500))) {
    return json({ error: 'rate_limited' }, 429);
  }
  const { remaining } = await cancelUse(env.QUOTA, parsed.deviceId, parsed.messageId, now);
  return json({ remaining });
}

type Outcome = 'ok' | 'refusal' | 'error';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/quota') return quotaRoute(req, env);
    if (req.method === 'POST' && path === '/cancel') return cancelRoute(req, env);
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
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await ipGuard(env.QUOTA, ip, now, limits.perIp))) {
      return json(
        { error: 'rate_limited', reason: 'ip', remaining: await peek(env.QUOTA, deviceId, now) },
        429,
      );
    }

    // Retries of the same stage may repeat, but a new question needs a new messageId.
    // Store only a digest, never text/output. Distributed races still need an atomic store.
    const callKey = `ai:call:${todayIstanbul(now)}:${deviceId}:${messageId}:${path}`;
    const digest = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(JSON.stringify(parsed)),
    );
    const fingerprint = Array.from(
      new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const previous = await env.QUOTA.get(callKey);
    if (previous && previous !== fingerprint) {
      return json({ error: 'duplicate_message' }, 409);
    }

    // TODO(subscriptions): check an entitlement here and raise the limit (SUB_DAILY) for subscribers.
    const q = await takeUse(env.QUOTA, deviceId, messageId, now, limits, FREE_DAILY);
    if (!q.ok) {
      return json(
        q.reason === 'quota'
          ? { remaining: 0 }
          : { error: 'rate_limited', reason: q.reason, remaining: q.remaining },
        429,
      );
    }
    await env.QUOTA.put(callKey, fingerprint, { expirationTtl: 172800 });

    // The use is only kept when the user got an answer: give it back on any failure.
    const giveBack = async (): Promise<number> => {
      if (!q.added) return q.remaining;
      try {
        return (await releaseUse(env.QUOTA, deviceId, messageId, now)).remaining;
      } catch {
        return q.remaining;
      }
    };

    // One log line per AI call (visible with `npx wrangler tail`): endpoint, duration, outcome,
    // uses left. Never the user's text or the device id.
    const started = Date.now();
    const respond = async (outcome: Outcome, body: unknown, status = 200): Promise<Response> => {
      // Failed stages can be retried, whether or not /understand already spent the use.
      if (outcome !== 'ok' && !previous) {
        try {
          await env.QUOTA.put(callKey, '', { expirationTtl: 172800 });
        } catch {
          // A storage outage must not swallow the fallback response.
        }
      }
      let logged: Outcome | 'timeout-cancelled' = outcome;
      let remaining = q.remaining;
      if (body !== null && typeof body === 'object' && 'remaining' in body) {
        remaining = Number((body as { remaining: unknown }).remaining);
      }
      try {
        // The client gave up on this message while we were working: it does not keep the use.
        if (await wasCancelled(env.QUOTA, deviceId, messageId, now)) {
          logged = 'timeout-cancelled';
          remaining = (await releaseUse(env.QUOTA, deviceId, messageId, now)).remaining;
          if (body !== null && typeof body === 'object' && 'remaining' in body) {
            body = { ...body, remaining };
          }
        }
      } catch {
        // The use stays charged; the user still gets the answer.
      }
      console.log(
        JSON.stringify({ endpoint: path, ms: Date.now() - started, outcome: logged, remaining }),
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
      return respond(
        outcome,
        message === undefined
          ? { error: 'upstream', remaining, detail }
          : { error: 'upstream', remaining, detail, message },
        502,
      );
    };
    /** The SDK call, or null when the API answered but the output could not be read. */
    const readable = async <T>(call: () => Promise<T>): Promise<T | null> => {
      try {
        return await call();
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
        const system = cards
          ? `${understandSystem(understandReq.city)}\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : understandSystem(understandReq.city);
        const unknown = async () =>
          respond('error', {
            understanding: { kind: 'unknown' } satisfies Understanding,
            remaining: await giveBack(),
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
          return respond(response.stop_reason === 'refusal' ? 'refusal' : 'error', {
            understanding: { kind: 'unknown' } satisfies Understanding,
            remaining: await giveBack(),
          });
        }
        // The model answers one flat object; the app reads the union it always read. The
        // conversion is total: whatever the model wrote, the result fits the union (at worst
        // "unknown"), so this is a 200 and never a 502.
        const understanding = toUnderstanding(response.parsed_output);
        return respond('ok', { understanding, remaining: q.remaining });
      }

      if (chatReq) {
        const cards = chatReq.lastCards;
        const system = cards
          ? `${chatSystem(chatReq.city)}\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : chatSystem(chatReq.city);
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 200,
            system,
            output_config: { effort: 'low', format: zodOutputFormat(chatOutputSchema) },
            messages: toMessages(chatReq.history, chatReq.text),
          }),
        );
        if (response && (response.stop_reason === 'refusal' || !response.parsed_output)) {
          return upstreamFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        // Older apps read the bare reply; they never see the count. An unreadable or empty reply
        // is an empty reply (the app then uses its own template) and the use is given back.
        const said = toChat(response?.parsed_output);
        if (said.reply === '') {
          await giveBack();
          return respond('error', said);
        }
        return respond('ok', said);
      }

      // Candidates carry facts only (no names); the output schemas bound every index.
      if (pickReq) {
        const park = pickReq.candidates[0]?.kind === 'parking';
        const n = pickReq.candidates.length;
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: park ? parkPickSystem(pickReq.city) : pickSystem(pickReq.city),
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
          return upstreamFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        // Total: an unusable pick (no valid index) is `pick: null` with a 200 and the use given
        // back; the app then answers with its own rules.
        const out = toPick(response?.parsed_output, n, park);
        if (!out) return respond('error', { pick: null, remaining: await giveBack() });
        return respond('ok', { pick: out, remaining: q.remaining });
      }

      if (planReq) {
        const total = planReq.candidates.reduce((n, c) => n + c.parkings.length, 0);
        const response = await readable(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: planSystem(planReq.city),
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
          return upstreamFail(
            response.stop_reason === 'refusal' ? 'refusal' : 'error',
            noOutput(response.stop_reason),
          );
        }
        const out = toPlan(response?.parsed_output, planReq.candidates.length, total);
        if (!out) return respond('error', { plan: null, remaining: await giveBack() });
        return respond('ok', { plan: out, remaining: q.remaining });
      }

      if (narrateReq) {
        const { text, where, what, total, withParking, results } = narrateReq;
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: narrateSystem(narrateReq.city),
          output_config: { effort: 'low' },
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ text, where, what, total, withParking, results }),
            },
          ],
        });
        if (response.stop_reason === 'refusal') return upstreamFail('refusal', noOutput('refusal'));
        let reply = '';
        for (const block of response.content) {
          if (block.type === 'text') reply += block.text;
        }
        reply = reply.trim();
        if (!reply) return upstreamFail('error', 'empty_reply');
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
