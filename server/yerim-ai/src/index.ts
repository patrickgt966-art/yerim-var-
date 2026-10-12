import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  FREE_DAILY,
  NARRATE_SYSTEM,
  UNDERSTAND_SYSTEM,
  UnderstandingSchema,
  type Understanding,
} from '../../../src/lib/ai/protocol';
import {
  charge,
  ipGuard,
  peek,
  refund,
  toMessages,
  validNarrate,
  validQuota,
  validUnderstand,
} from './quota';

export interface Env {
  QUOTA: KVNamespace;
  ANTHROPIC_API_KEY: string;
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/quota') return quotaRoute(req, env);
    if (req.method !== 'POST' || (path !== '/understand' && path !== '/narrate')) {
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
    const parsed = understandReq ?? narrateReq;
    if (!parsed) return json({ error: 'bad_request' }, 400);

    const now = new Date();
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await ipGuard(env.QUOTA, ip, now))) return json({ error: 'rate_limited' }, 429);

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
