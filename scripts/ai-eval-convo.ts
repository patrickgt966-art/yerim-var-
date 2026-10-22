/* eslint import/no-unresolved: "off" -- SDK lives in server/yerim-ai/node_modules, absent in the main CI job. */
/**
 * The conversation eval: ~550 whole conversations (src/data/eval/convoCases.ts) of 1-4 user turns,
 * played through the app's real assistant (answer / refine of src/data/assistant.ts, as the chat
 * screen drives it) with the real AI layer (the router, the pick and the reply wording, called with
 * the Worker's prompts and schemas), over the real data of all five cities. Each turn is scored on
 * four checks (src/data/eval/convoScore.ts): understanding, choices / chips, reply text, honesty. A
 * conversation passes when every check of every turn does. Exits 1 when fewer than CONVO_PASS of the
 * conversations pass.
 *
 * Usage (needs ANTHROPIC_API_KEY): npx tsx scripts/ai-eval-convo.ts [--limit N] [--only <category>] [--seed S]
 *   --limit N        plays only N conversations, taken round-robin across the categories (a smoke test)
 *   --only <category> plays one category: greeting, thanks_bye, food, park, both, choice, narrow,
 *                    split, city_switch, no_data, offtopic, name
 *   --seed S         another set of conversations from another seed
 * The cost is estimated and printed before anything is sent (it needs no key); the batch API is not
 * used: a conversation is interactive, the next turn depends on the last reply. The fixed prompts
 * are cached, as in the Worker.
 * CI: .github/workflows/ai-eval-convo.yml (by hand). Writes docs/ai-eval-convo.md.
 *
 * The SDK is imported from server/yerim-ai/node_modules (pinned, same as the Worker);
 * install it with `npm ci --prefix server/yerim-ai`.
 */
import './convoStubs'; // must stay first: it stands in for the native modules the assistant names

import * as fs from 'node:fs';
import * as path from 'node:path';

import Anthropic from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/index.mjs';
import { zodOutputFormat } from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/helpers/zod.mjs';

import { setActiveCity } from '@/data/cities';
import { CITY_IDS } from '@/data/eval/aiBigCases';
import {
  CONVO_CATEGORIES,
  CONVO_SEED,
  buildConvoCases,
  citiesOf,
  sampleCases,
  type ConvoCase,
} from '@/data/eval/convoCases';
import { playConversation, type ConvoAi, type Transcript } from '@/data/eval/convoRun';
import {
  PRICE_IN,
  PRICE_OUT,
  buildReport,
  costOf,
  estimateCost,
  fmt,
  scoreAll,
  type PromptSizes,
  type Usage,
} from '@/data/eval/convoScore';
import {
  UnderstandingModelSchema,
  parkPickModelSchema,
  parkPickSystem,
  pickModelSchema,
  pickSystem,
  planModelSchema,
  planSystem,
  replyOutputSchema,
  replySystem,
  toPick,
  toPlan,
  toReply,
  toUnderstanding,
  understandSystem,
  type ChatTurn,
  type ParkPickResponse,
  type PickResponse,
} from '@/lib/ai/protocol';

// Keep in sync with MODEL in server/yerim-ai/src/index.ts.
const MODEL = 'claude-haiku-5-5';
/** Share of the conversations that must pass; the model is not deterministic, so not all of them. */
const CONVO_PASS = 0.85;
/** The cost one full run should stay under, in USD; a higher estimate is reported, not cut. */
const COST_TARGET = 1;
/** Conversations played at once (all in one city: the app keeps the selected city globally). */
const CONCURRENCY = 3;
/** One call and up to two retries on 429 / 5xx / a dropped connection (the app waits 12 s at most). */
const MAX_ATTEMPTS = 3;
/** A conversation whose AI calls hit an outage is played again, this many times at most. */
const MAX_PLAYS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** As the Worker's toMessages: the history as turns, never starting with the bot. */
function toMessages(history: ChatTurn[], text: string) {
  const mapped = history.map((h) => ({
    role: h.role === 'bot' ? ('assistant' as const) : ('user' as const),
    content: h.text,
  }));
  while (mapped[0]?.role === 'assistant') mapped.shift();
  mapped.push({ role: 'user', content: text });
  return mapped;
}

/** As the Worker's cachedSystem: the fixed prompt is cached across calls, the rest is not. */
const cachedSystem = (fixed: string, rest = '') => [
  { type: 'text' as const, text: fixed, cache_control: { type: 'ephemeral' as const } },
  ...(rest ? [{ type: 'text' as const, text: rest }] : []),
];

/** 429, 5xx and dropped connections are worth one more try. */
function retryable(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.RateLimitError) return true;
  return e instanceof Anthropic.APIError && (e.status ?? 0) >= 500;
}

/** The server's retry-after (seconds) on a 429, in ms (at most 4 s: the app does not wait longer). */
function retryAfterMs(e: unknown): number | undefined {
  if (!(e instanceof Anthropic.APIError)) return undefined;
  const v = Number(e.headers?.get?.('retry-after'));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 4) * 1000 : undefined;
}

/** As the Worker's unreadableOutput: the API answered but its output could not be read. */
function unreadable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: unknown; name?: unknown; message?: unknown };
  if (typeof e.status === 'number') return false;
  return (
    e.name === 'SyntaxError' ||
    e.name === 'ZodError' ||
    (typeof e.message === 'string' && e.message.startsWith('Failed to parse structured output'))
  );
}

function parseArgs(argv: string[]): { limit?: number; only?: string; seed: number } {
  const out: { limit?: number; only?: string; seed: number } = { seed: CONVO_SEED };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    const value = () => inline ?? argv[++i];
    if (flag === '--limit') {
      const n = Math.floor(Number(value()));
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (flag === '--only') out.only = value();
    else if (flag === '--seed') {
      const n = Math.floor(Number(value()));
      if (Number.isFinite(n)) out.seed = n;
    } else {
      console.error(`Unknown option: ${argv[i]}`);
      process.exit(2);
    }
  }
  return out;
}

const tokensOf = (s: string) => Math.ceil(s.length / 3);

/** The fixed prompts in tokens (the longest city's), for the estimate. */
function promptSizes(): PromptSizes {
  const longest = (text: (city: string) => string) =>
    Math.max(...CITY_IDS.map((c) => tokensOf(text(c))));
  return {
    understand: longest((c) => understandSystem(c, 'food')),
    pick: longest((c) => pickSystem(c)),
    parkPick: longest((c) => parkPickSystem(c)),
    reply: longest((c) => replySystem(c)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.only && !(CONVO_CATEGORIES as readonly string[]).includes(args.only)) {
    console.error(`Unknown category "${args.only}". One of: ${CONVO_CATEGORIES.join(', ')}`);
    process.exit(2);
  }
  let cases = buildConvoCases(args.seed).filter((c) => !args.only || c.category === args.only);
  if (args.limit) cases = sampleCases(cases, args.limit, args.seed);
  const turns = cases.reduce((n, c) => n + c.turns.length, 0);

  // The estimate comes first and needs no key.
  const estimate = estimateCost(cases, promptSizes());
  console.error(
    `${cases.length} conversations, ${turns} turns. Estimated cost: $${estimate.usd.toFixed(3)} ` +
      `(${estimate.calls.understand} router, ${estimate.calls.pick} pick, ${estimate.calls.reply} reply calls; ` +
      `at $${PRICE_IN} in / $${PRICE_OUT} out per MTok, prompt cache on).`,
  );
  if (estimate.usd > COST_TARGET) {
    console.error(`Estimate is above the $${COST_TARGET} target for a run.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      'ANTHROPIC_API_KEY is not set. Export it and re-run: npx tsx scripts/ai-eval-convo.ts',
    );
    process.exit(1);
  }
  if (cases.length === 0) {
    console.error('No conversations to play.');
    process.exit(1);
  }

  // Our own retry (below) instead of the SDK's, so the count stays predictable.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let aborted = false;
  const note = (u: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  }) => {
    usage.inputTokens += u.input_tokens;
    usage.outputTokens += u.output_tokens;
    usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
  };

  /** One model call with retries; a bad key or an empty credit balance stops the whole run. */
  async function call<T>(make: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await make();
      } catch (e) {
        const msg = (e instanceof Error ? e.message : 'unknown error')
          .split('\n')[0]!
          .slice(0, 200);
        const noCredit = e instanceof Anthropic.BadRequestError && /credit balance/i.test(msg);
        if (e instanceof Anthropic.AuthenticationError || noCredit) {
          console.error(
            noCredit ? 'Credit balance too low; aborting.' : 'Authentication failed; aborting.',
          );
          aborted = true;
          throw new Error(msg);
        }
        if (attempt >= MAX_ATTEMPTS || !retryable(e)) throw e;
        await sleep(retryAfterMs(e) ?? 1500 * attempt + Math.floor(Math.random() * 1000));
      }
    }
  }

  /** As the Worker: the same prompts, schemas, output readers and effort. */
  const ai: ConvoAi = {
    async understand(req) {
      const cards = req.lastCards;
      const system = cachedSystem(
        understandSystem(req.city, req.section),
        cards
          ? `\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : '',
      );
      try {
        const response = await call(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 2048,
            system,
            output_config: { effort: 'low', format: zodOutputFormat(UnderstandingModelSchema) },
            messages: toMessages(req.history, req.text),
          }),
        );
        note(response.usage);
        // As the Worker: an unusable answer is "unknown", not a failure.
        if (response.stop_reason === 'refusal' || !response.parsed_output)
          return { kind: 'unknown' };
        return toUnderstanding(response.parsed_output);
      } catch (e) {
        if (unreadable(e)) return { kind: 'unknown' };
        throw e;
      }
    },
    async pick(req) {
      const n = req.candidates.length;
      try {
        const response = await call(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(pickSystem(req.city)),
            output_config: { effort: 'low', format: zodOutputFormat(pickModelSchema(n)) },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({ text: req.text, candidates: req.candidates }),
              },
            ],
          }),
        );
        note(response.usage);
        if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
        return toPick(response.parsed_output, n) as PickResponse | null;
      } catch (e) {
        if (unreadable(e)) return null;
        throw e;
      }
    },
    async pickPark(req) {
      const n = req.candidates.length;
      try {
        const response = await call(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(parkPickSystem(req.city)),
            output_config: { effort: 'low', format: zodOutputFormat(parkPickModelSchema(n)) },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({ text: req.text, candidates: req.candidates }),
              },
            ],
          }),
        );
        note(response.usage);
        if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
        return toPick(response.parsed_output, n, true) as ParkPickResponse | null;
      } catch (e) {
        if (unreadable(e)) return null;
        throw e;
      }
    },
    async plan(req) {
      const total = req.candidates.reduce((n, c) => n + c.parkings.length, 0);
      try {
        const response = await call(() =>
          client.messages.parse({
            model: MODEL,
            max_tokens: 1024,
            system: cachedSystem(planSystem(req.city)),
            output_config: {
              effort: 'low',
              format: zodOutputFormat(planModelSchema(req.candidates.length, total)),
            },
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  text: req.text,
                  when: req.when,
                  candidates: req.candidates,
                }),
              },
            ],
          }),
        );
        note(response.usage);
        if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
        return toPlan(response.parsed_output, req.candidates.length, total);
      } catch (e) {
        if (unreadable(e)) return null;
        throw e;
      }
    },
    async reply(req) {
      const send = () =>
        client.messages.parse({
          model: MODEL,
          max_tokens: 200,
          system: cachedSystem(replySystem(req.city)),
          output_config: { effort: 'low', format: zodOutputFormat(replyOutputSchema) },
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                lang: 'tr',
                userText: req.userText,
                kind: req.kind,
                facts: req.facts,
              }),
            },
          ],
        });
      // The app waits 3 s for the wording: one retry for a rate limit, a slow answer is a late one.
      try {
        const response = await send().catch(async (e: unknown) => {
          if (!retryable(e)) throw e;
          await sleep(retryAfterMs(e) ?? 1000);
          return send();
        });
        note(response.usage);
        const text = response.stop_reason === 'refusal' ? '' : toReply(response.parsed_output);
        return text === '' ? null : text;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) aborted = true;
        if (unreadable(e)) return null;
        throw e;
      }
    },
  };

  // One conversation, played again after an outage; the cost of every play counts.
  async function play(c: ConvoCase): Promise<{ turns: Transcript['turns']; error?: string }> {
    let last: Transcript | undefined;
    for (let attempt = 1; attempt <= MAX_PLAYS; attempt++) {
      if (aborted) return { turns: last?.turns ?? [], error: 'run aborted' };
      last = await playConversation(c, ai);
      if (!last.infra) return { turns: last.turns, ...(last.error ? { error: last.error } : {}) };
      if (attempt < MAX_PLAYS) await sleep(6000 * attempt + Math.floor(Math.random() * 3000));
    }
    const why = last?.turns.find((t) => t.infra)?.error ?? 'an AI call failed';
    return { turns: last?.turns ?? [], error: `outage after ${MAX_PLAYS} tries: ${why}` };
  }

  // The selected city is global state of the app: conversations of one city run side by side, one
  // city after the other; conversations that change city run alone at the end.
  const slots = cases.map((c, index) => ({ c, index }));
  const results: ({ c: ConvoCase; turns: Transcript['turns']; error?: string } | undefined)[] =
    new Array(cases.length);
  let done = 0;
  const phase = async (list: typeof slots, width: number) => {
    let next = 0;
    const worker = async () => {
      while (!aborted) {
        const slot = list[next++];
        if (!slot) return;
        await sleep(Math.floor(Math.random() * 300));
        const played = await play(slot.c);
        results[slot.index] = { c: slot.c, ...played };
        done++;
        const ok = played.turns.length === slot.c.turns.length && !played.error;
        console.error(`[${done}/${cases.length}] ${ok ? 'played' : 'ERROR'} ${slot.c.name}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(width, list.length) }, () => worker()));
  };
  for (const city of CITY_IDS) {
    const mine = slots.filter((s) => citiesOf(s.c).length === 1 && s.c.city === city);
    if (mine.length === 0) continue;
    setActiveCity(city);
    await phase(mine, CONCURRENCY);
  }
  await phase(
    slots.filter((s) => citiesOf(s.c).length > 1),
    1,
  );

  const played = results.filter((r): r is NonNullable<typeof r> => r !== undefined);
  const scored = scoreAll(played);
  const passed = scored.filter((r) => r.ok).length;
  const rate = scored.length === 0 ? 0 : passed / scored.length;
  const report = buildReport(scored, {
    model: MODEL,
    bar: CONVO_PASS,
    usage,
    estimate,
    seed: args.seed,
    planned: cases.length,
  });
  console.log(report);
  console.error(
    `Tokens: input ${fmt(usage.inputTokens)} · cache read ${fmt(usage.cacheReadTokens)} · cache write ${fmt(usage.cacheWriteTokens)} · output ${fmt(usage.outputTokens)}; cost $${costOf(usage).toFixed(3)}`,
  );

  const date = new Date().toISOString().slice(0, 10);
  const md = `# AI eval (convo)\n\nDate: ${date}\n\n${report}\n`;
  fs.writeFileSync(path.resolve(__dirname, '../docs/ai-eval-convo.md'), md);
  if (rate < CONVO_PASS) process.exitCode = 1;
}

void main();
