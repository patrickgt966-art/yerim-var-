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
  charge,
  chatCharge,
  chatLimits,
  chatRefund,
  ipGuard,
  peek,
  refund,
  toMessages,
  validChat,
  validNarrate,
  validPick,
  validPlan,
  validQuota,
  validUnderstand,
} from './quota';

export interface Env {
  QUOTA: KVNamespace;
  ANTHROPIC_API_KEY: string;
  /** Limits from wrangler.toml [vars] (strings); see chatLimits for the defaults. */
  CHAT_DAILY_PER_DEVICE?: string;
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
 * Small talk (greetings, thanks, goodbyes, talk about the chat). Costs no ✨, so it has its own
 * limits: per IP (shared with the other calls), per device, global, and a minimum interval.
 * Anthropic is only called after every limit passed; a failed call gives the counters back.
 */
async function chatRoute(req: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const parsed = validChat(raw);
  if (!parsed) return json({ error: 'bad_request' }, 400);

  const limits = chatLimits(env);
  const now = new Date();
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await ipGuard(env.QUOTA, ip, now, limits.perIp))) {
    return json({ error: 'rate_limited', reason: 'ip' }, 429);
  }
  const taken = await chatCharge(env.QUOTA, parsed.deviceId, now, limits);
  if (!taken.ok) return json({ error: 'rate_limited', reason: taken.reason }, 429);

  const giveBack = async () => {
    try {
      await chatRefund(env.QUOTA, parsed.deviceId, now);
    } catch {
      // The counters stay one too high until tomorrow; the user still gets the template.
    }
  };
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const cards = parsed.lastCards;
    const system = cards
      ? `${CHAT_SYSTEM}\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
      : CHAT_SYSTEM;
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 200,
      system,
      output_config: { effort: 'low', format: zodOutputFormat(chatOutputSchema) },
      messages: toMessages(parsed.history, parsed.text),
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      await giveBack();
      return json({ error: 'upstream' }, 502);
    }
    return json(response.parsed_output);
  } catch (err) {
    console.error('anthropic error', err instanceof Error ? err.message : 'unknown');
    await giveBack();
    return json({ error: 'upstream' }, 502);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/quota') return quotaRoute(req, env);
    if (req.method === 'POST' && path === '/chat') return chatRoute(req, env);
    if (req.method !== 'POST' || !['/understand', '/narrate', '/pick', '/plan'].includes(path)) {
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
    const parsed = understandReq ?? narrateReq ?? pickReq ?? planReq;
    if (!parsed) return json({ error: 'bad_request' }, 400);

    const now = new Date();
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await ipGuard(env.QUOTA, ip, now, chatLimits(env).perIp))) {
      return json({ error: 'rate_limited' }, 429);
    }

    // TODO(subscriptions): check an entitlement here and raise the limit (SUB_DAILY) for subscribers.
    const limit = FREE_DAILY;
    const q = await charge(env.QUOTA, parsed.deviceId, parsed.messageId, limit, now);
    if (!q.allowed) return json({ remaining: 0 }, 429);

    // The use is only kept when the user got an answer: give it back on any failure.
    const giveBack = async (): Promise<number> => {
      if (!q.added) return q.remaining;
      try {
        return await refund(env.QUOTA, parsed.deviceId, parsed.messageId, now);
      } catch {
        return q.remaining;
      }
    };
    const upstreamFail = async () => json({ error: 'upstream', remaining: await giveBack() }, 502);

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      if (understandReq) {
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 2048,
          system: UNDERSTAND_SYSTEM,
          output_config: { effort: 'low', format: zodOutputFormat(UnderstandingSchema) },
          messages: toMessages(understandReq.history, understandReq.text),
        });
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          return json({
            understanding: { kind: 'unknown' } satisfies Understanding,
            remaining: await giveBack(),
          });
        }
        return json({ understanding: response.parsed_output, remaining: q.remaining });
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
        if (response.stop_reason === 'refusal' || !response.parsed_output) return upstreamFail();
        return json({ pick: response.parsed_output, remaining: q.remaining });
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
        if (response.stop_reason === 'refusal' || !response.parsed_output) return upstreamFail();
        return json({ plan: response.parsed_output, remaining: q.remaining });
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
        if (response.stop_reason === 'refusal') return upstreamFail();
        let reply = '';
        for (const block of response.content) {
          if (block.type === 'text') reply += block.text;
        }
        reply = reply.trim();
        if (!reply) return upstreamFail();
        return json({ reply, remaining: q.remaining });
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      // Never log the user's text; only the error name/message from the SDK.
      console.error('anthropic error', err instanceof Error ? err.message : 'unknown');
      return upstreamFail();
    }
  },
};
