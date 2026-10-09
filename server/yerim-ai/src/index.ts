import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  FREE_DAILY,
  NARRATE_SYSTEM,
  UNDERSTAND_SYSTEM,
  UnderstandingSchema,
  type Understanding,
} from '../../../src/lib/ai/protocol';
import { charge, ipGuard, toMessages, validNarrate, validUnderstand } from './quota';

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
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
        const understanding: Understanding =
          response.stop_reason === 'refusal' || !response.parsed_output
            ? { kind: 'unknown' }
            : response.parsed_output;
        return json({ understanding, remaining: q.remaining });
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
        if (response.stop_reason === 'refusal') return json({ error: 'upstream' }, 502);
        let reply = '';
        for (const block of response.content) {
          if (block.type === 'text') reply += block.text;
        }
        reply = reply.trim();
        if (!reply) return json({ error: 'upstream' }, 502);
        return json({ reply, remaining: q.remaining });
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      // Never log the user's text; only the error name/message from the SDK.
      console.error('anthropic error', err instanceof Error ? err.message : 'unknown');
      return json({ error: 'upstream' }, 502);
    }
  },
};
