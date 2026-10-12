import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  CHAT_SYSTEM,
  FREE_DAILY,
  NARRATE_SYSTEM,
  PARK_PICK_SYSTEM,
  PICK_SYSTEM,
  PLAN_SYSTEM,
  UNDERSTAND_SYSTEM,
  UnderstandingSchema,
  chatOutputSchema,
  parkPickOutputSchema,
  pickOutputSchema,
  planOutputSchema,
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
      return json({ error: 'rate_limited' }, 429);
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
    const upstreamFail = async (outcome: Outcome = 'error') =>
      respond(outcome, { error: 'upstream', remaining: await giveBack() }, 502);

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      if (understandReq) {
        const cards = understandReq.lastCards;
        const system = cards
          ? `${UNDERSTAND_SYSTEM}\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : UNDERSTAND_SYSTEM;
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 2048,
          system,
          output_config: { effort: 'low', format: zodOutputFormat(UnderstandingSchema) },
          messages: toMessages(understandReq.history, understandReq.text),
        });
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return respond(response.stop_reason === 'refusal' ? 'refusal' : 'error', {
            understanding: { kind: 'unknown' } satisfies Understanding,
            remaining: await giveBack(),
          });
        }
        return respond('ok', { understanding: response.parsed_output, remaining: q.remaining });
      }

      if (chatReq) {
        const cards = chatReq.lastCards;
        const system = cards
          ? `${CHAT_SYSTEM}\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : CHAT_SYSTEM;
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 200,
          system,
          output_config: { effort: 'low', format: zodOutputFormat(chatOutputSchema) },
          messages: toMessages(chatReq.history, chatReq.text),
        });
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return upstreamFail(response.stop_reason === 'refusal' ? 'refusal' : 'error');
        }
        // Older apps read the bare reply; they never see the count.
        return respond('ok', response.parsed_output);
      }

      // Candidates carry facts only (no names); the output schemas bound every index.
      if (pickReq) {
        const park = pickReq.candidates[0]?.kind === 'parking';
        const n = pickReq.candidates.length;
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 1024,
          system: park ? PARK_PICK_SYSTEM : PICK_SYSTEM,
          output_config: {
            effort: 'low',
            format: zodOutputFormat(park ? parkPickOutputSchema(n) : pickOutputSchema(n)),
          },
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ text: pickReq.text, candidates: pickReq.candidates }),
            },
          ],
        });
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return upstreamFail(response.stop_reason === 'refusal' ? 'refusal' : 'error');
        }
        return respond('ok', { pick: response.parsed_output, remaining: q.remaining });
      }

      if (planReq) {
        const total = planReq.candidates.reduce((n, c) => n + c.parkings.length, 0);
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 1024,
          system: PLAN_SYSTEM,
          output_config: {
            effort: 'low',
            format: zodOutputFormat(planOutputSchema(planReq.candidates.length, total)),
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
        });
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return upstreamFail(response.stop_reason === 'refusal' ? 'refusal' : 'error');
        }
        return respond('ok', { plan: response.parsed_output, remaining: q.remaining });
      }

      if (narrateReq) {
        const { text, where, what, total, withParking, results } = narrateReq;
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: NARRATE_SYSTEM,
          output_config: { effort: 'low' },
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ text, where, what, total, withParking, results }),
            },
          ],
        });
        if (response.stop_reason === 'refusal') return upstreamFail('refusal');
        let reply = '';
        for (const block of response.content) {
          if (block.type === 'text') reply += block.text;
        }
        reply = reply.trim();
        if (!reply) return upstreamFail();
        return respond('ok', { reply, remaining: q.remaining });
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      // Never log the user's text; only the error name/message from the SDK.
      console.error('anthropic error', err instanceof Error ? err.message : 'unknown');
      return upstreamFail();
    }
  },
};
