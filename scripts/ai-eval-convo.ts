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
 * Usage (needs ANTHROPIC_API_KEY): npx tsx scripts/ai-eval-convo.ts [--set convo|mega] [--limit N]
 *   [--only <category>] [--shard i/n] [--seed S] [--dry]
 *   --set mega       the mega set (src/data/eval/megaCases.ts, ~3000 conversations of 1-8 turns);
 *                    the default is the convo set
 *   --limit N        plays only N conversations, taken round-robin across the categories (a smoke test)
 *   --only <category> plays one category: greeting, thanks_bye, food, park, both, choice, narrow,
 *                    split, city_switch, no_data, offtopic, name, far (mega: style, multi, goals,
 *                    parking, dishes, honesty, plans, edge)
 *   --shard i/n      plays every n-th conversation from the i-th (after --only and --limit), so a run
 *                    can be split over n jobs; i is 0 .. n-1
 *   --seed S         another set of conversations from another seed
 *   --dry            builds the conversations and prints how many there are per category and
 *                    subcategory with the cost estimate; calls nothing and needs no key
 *   --mode M         fixed (default: the old set, the same questions every run), adaptive (the
 *                    failures of the last run come back, a --guard % sample of old passes is checked
 *                    again, the rest is new and more complex) or fresh (all new, nothing carried)
 *   --size N         the size of the exam (default: the size of the fixed set)
 *   --run R          the run number: the seed of the fresh cases, recorded in the report
 *                    (default: $GITHUB_RUN_NUMBER or 1; --seed wins)
 *   --guard P        percent of the size asked again from old passes in adaptive mode (default 5)
 *   --carry FILE     the carry file of the last run (ai-eval-<set>-carry.json)
 *   --bootstrap DIR  no carry file: derive the failures from the result JSONs of the last run in DIR
 *   --plan-out FILE  composes the exam, writes it as JSON (the shards read it with --exam), exits
 *   --exam FILE      plays the exam of a plan file instead of building one
 * The cost is estimated and printed before anything is sent (it needs no key); the batch API is not
 * used: a conversation is interactive, the next turn depends on the last reply. The fixed prompts
 * are cached, as in the Worker.
 * CI: .github/workflows/ai-eval-convo.yml and ai-eval-mega.yml (by hand). The convo set writes
 * docs/ai-eval-convo.md. The mega set writes docs/ai-eval-mega-<i>.md and .json per shard (merged
 * by scripts/ai-eval-merge.ts into docs/ai-eval-mega.md), or docs/ai-eval-mega.md and
 * docs/ai-eval-mega-all.json for a run of everything.
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
import {
  MEGA_CATEGORIES,
  MEGA_SEED,
  buildMegaCases,
  parseShard,
  shardOf,
  timeOfDay,
} from '@/data/eval/megaCases';
import { MEGA_PASS, buildMegaReport, resultFileOf, type ShardFile } from '@/data/eval/megaMerge';
import {
  EXAM_MODES,
  GUARD_DEFAULT,
  bootstrapCarry,
  compositionLines,
  composeExam,
  readCarry,
  readExam,
  type CarryFile,
  type Exam,
  type ExamFile,
  type ExamMode,
} from '@/data/eval/adaptive';
import { buildComplexCases } from '@/data/eval/complexCases';
import { findFiles } from './evalFiles';
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
  replyLangNote,
  replySystem,
  toPick,
  toPlan,
  toReply,
  toUnderstanding,
  understandSystem,
  langNote,
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
/** The same for the mega set (~3000 conversations: the owner accepts $3-5 for a full run). */
const MEGA_COST_TARGET = 6;
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

type Args = {
  set: 'convo' | 'mega';
  limit?: number;
  only?: string;
  seed?: number;
  shard: { i: number; n: number } | null;
  dry: boolean;
  mode: ExamMode;
  size?: number;
  run?: string;
  guard: number;
  carry?: string;
  bootstrap?: string;
  exam?: string;
  planOut?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { set: 'convo', shard: null, dry: false, mode: 'fixed', guard: GUARD_DEFAULT };
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
    } else if (flag === '--set') {
      const v = value();
      if (v !== 'convo' && v !== 'mega') {
        console.error(`Unknown set "${v}". One of: convo, mega`);
        process.exit(2);
      }
      out.set = v;
    } else if (flag === '--shard') {
      const v = value();
      const shard = parseShard(v);
      if (!shard) {
        console.error(`--shard wants i/n with 0 <= i < n, got "${v}"`);
        process.exit(2);
      }
      out.shard = shard;
    } else if (flag === '--dry') out.dry = true;
    else if (flag === '--mode') {
      const v = value() as ExamMode;
      if (!EXAM_MODES.includes(v)) {
        console.error(`Unknown mode "${v}". One of: ${EXAM_MODES.join(', ')}`);
        process.exit(2);
      }
      out.mode = v;
    } else if (flag === '--size') {
      const n = Math.floor(Number(value()));
      if (Number.isFinite(n) && n > 0) out.size = n;
    } else if (flag === '--run') out.run = value();
    else if (flag === '--guard') {
      const n = Number(value());
      if (Number.isFinite(n) && n >= 0 && n <= 50) out.guard = n;
      else {
        console.error('--guard wants a percent from 0 to 50');
        process.exit(2);
      }
    } else if (flag === '--carry') out.carry = value();
    else if (flag === '--bootstrap') out.bootstrap = value();
    else if (flag === '--exam') out.exam = value();
    else if (flag === '--plan-out') out.planOut = value();
    else {
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

/** How many conversations per category and subcategory, the mix of the rest: the dry run's table. */
function countLines(cases: readonly ConvoCase<string>[]): string[] {
  const lines: string[] = [];
  const by = (key: (c: ConvoCase<string>) => string) => {
    const m = new Map<string, number>();
    for (const c of cases) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
    return m;
  };
  const cats = [...new Set(cases.map((c) => c.category))];
  for (const cat of cats) {
    const subs = by((c) => (c.category === cat ? (c.sub ?? '-') : ''));
    subs.delete('');
    const total = cases.filter((c) => c.category === cat).length;
    lines.push(`${cat}: ${total}`);
    for (const [sub, n] of subs) lines.push(`  ${cat}/${sub}: ${n}`);
  }
  const mix = (title: string, key: (c: ConvoCase<string>) => string) =>
    `${title}: ${[...by(key)].map(([k, n]) => `${k} ${n}`).join(', ')}`;
  lines.push('');
  lines.push(mix('app language', (c) => c.ui ?? 'tr'));
  lines.push(mix('location', (c) => (c.located === false ? 'none' : 'given')));
  lines.push(mix('time of day', (c) => timeOfDay(c.hour)));
  lines.push(mix('city', (c) => c.city));
  lines.push(mix('turns', (c) => String(c.turns.length)));
  return lines;
}

/** The carry file of the last run: the file, else derived from the result JSONs of that run. */
function loadCarry(args: Args): CarryFile | null {
  if (args.carry && fs.existsSync(args.carry)) {
    return readCarry(JSON.parse(fs.readFileSync(args.carry, 'utf8')), args.carry);
  }
  if (!args.bootstrap) return null;
  const files = findFiles(args.bootstrap, resultFileOf(args.set));
  if (files.length === 0) return null;
  const shards = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as ShardFile);
  const mega = args.set === 'mega';
  console.error(`No carry file: derived the failures from ${files.length} result file(s).`);
  return bootstrapCarry(
    shards,
    {
      set: args.set,
      run: 'bootstrap',
      seed: shards[0]?.seed ?? 0,
      mode: 'fixed',
      size: shards.reduce((n, s) => n + s.results.length, 0),
    },
    (s) => (mega ? buildMegaCases(s) : buildConvoCases(s)),
  );
}

/** The exam of this run (see composeExam); the CLI default is the old fixed set. */
function planExam(args: Args): { exam: Exam; carry: CarryFile | null } {
  const mega = args.set === 'mega';
  const build = (s: number): ConvoCase<string>[] => (mega ? buildMegaCases(s) : buildConvoCases(s));
  const fixedSeed = args.seed ?? (mega ? MEGA_SEED : CONVO_SEED);
  const all = build(mega ? MEGA_SEED : CONVO_SEED);
  const baseMix: Record<string, number> = {};
  for (const c of all) baseMix[c.category] = (baseMix[c.category] ?? 0) + 1;
  const run = args.run ?? process.env.GITHUB_RUN_NUMBER ?? '1';
  const runSeed = Math.floor(Number(run));
  // Loaded in every mode: a fixed run still keeps the carry list and the asked hashes of the others.
  const carry = loadCarry(args);
  const exam = composeExam({
    set: args.set,
    mode: args.mode,
    size: args.size ?? all.length,
    run,
    seed:
      args.mode === 'fixed' ? fixedSeed : (args.seed ?? (Number.isFinite(runSeed) ? runSeed : 1)),
    guardPercent: args.guard,
    carry,
    baseMix,
    fixed: () => build(fixedSeed),
    legacy: build,
    complex: (s, want, avoid) => buildComplexCases(s, want, args.set, avoid),
  });
  return { exam, carry };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mega = args.set === 'mega';
  const categories: readonly string[] = mega ? MEGA_CATEGORIES : CONVO_CATEGORIES;
  if (args.only && !categories.includes(args.only)) {
    console.error(`Unknown category "${args.only}". One of: ${categories.join(', ')}`);
    process.exit(2);
  }
  let exam: Exam;
  let carry: CarryFile | null = null;
  if (args.exam) {
    const file = readExam(JSON.parse(fs.readFileSync(args.exam, 'utf8')), args.exam);
    exam = { cases: file.cases, info: file.info };
    carry = file.carry;
  } else {
    ({ exam, carry } = planExam(args));
  }
  const seed = exam.info.seed;
  if (args.planOut) {
    const file: ExamFile = { version: 1, info: exam.info, cases: exam.cases, carry };
    fs.mkdirSync(path.dirname(path.resolve(args.planOut)), { recursive: true });
    fs.writeFileSync(args.planOut, JSON.stringify(file));
    console.log(compositionLines(exam.info).join('\n'));
    return;
  }
  let cases: ConvoCase<string>[] = exam.cases.filter((c) => !args.only || c.category === args.only);
  if (args.limit) cases = sampleCases(cases, args.limit, seed);
  if (args.shard) cases = shardOf(cases, args.shard.i, args.shard.n);
  const turns = cases.reduce((n, c) => n + c.turns.length, 0);

  // The estimate comes first and needs no key.
  const estimate = estimateCost(cases, promptSizes());
  const target = mega ? MEGA_COST_TARGET : COST_TARGET;
  console.error(
    `${cases.length} conversations, ${turns} turns${args.shard ? ` (shard ${args.shard.i}/${args.shard.n})` : ''}. ` +
      `Estimated cost: $${estimate.usd.toFixed(3)} ` +
      `(${estimate.calls.understand} router, ${estimate.calls.pick} pick, ${estimate.calls.reply} reply calls; ` +
      `at $${PRICE_IN} in / $${PRICE_OUT} out per MTok, prompt cache on).`,
  );
  if (estimate.usd > target) {
    console.error(`Estimate is above the $${target} target for a run.`);
  }
  if (args.dry) {
    console.log(`${compositionLines(exam.info).join('\n')}\n`);
    console.log(countLines(cases).join('\n'));
    return;
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
        (cards
          ? `\n\nSon cevapta ${cards.count} ${cards.kind === 'parking' ? 'otopark' : 'restoran'} kartı var.`
          : '') + langNote(req.lang),
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
            system: cachedSystem(pickSystem(req.city), langNote(req.lang)),
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
            system: cachedSystem(parkPickSystem(req.city), langNote(req.lang)),
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
            system: cachedSystem(planSystem(req.city), langNote(req.lang)),
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
          system: cachedSystem(replySystem(req.city), replyLangNote(req.lang)),
          output_config: { effort: 'low', format: zodOutputFormat(replyOutputSchema) },
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                lang: req.lang ?? 'tr',
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
  async function play(
    c: ConvoCase<string>,
  ): Promise<{ turns: Transcript['turns']; error?: string }> {
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

  // The selected city and the app language are global state of the app: conversations of one city
  // and one language run side by side, one after the other; conversations that change city run
  // alone at the end.
  const slots = cases.map((c, index) => ({ c, index }));
  const results: (
    { c: ConvoCase<string>; turns: Transcript['turns']; error?: string } | undefined
  )[] = new Array(cases.length);
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
  for (const ui of ['tr', 'en'] as const) {
    for (const city of CITY_IDS) {
      const mine = slots.filter(
        (s) => citiesOf(s.c).length === 1 && s.c.city === city && (s.c.ui ?? 'tr') === ui,
      );
      if (mine.length === 0) continue;
      setActiveCity(city);
      await phase(mine, CONCURRENCY);
    }
  }
  await phase(
    slots.filter((s) => citiesOf(s.c).length > 1),
    1,
  );

  const played = results.filter((r): r is NonNullable<typeof r> => r !== undefined);
  const scored = scoreAll(played);
  const passed = scored.filter((r) => r.ok).length;
  const rate = scored.length === 0 ? 0 : passed / scored.length;
  const cost = costOf(usage);
  console.error(
    `Tokens: input ${fmt(usage.inputTokens)} · cache read ${fmt(usage.cacheReadTokens)} · cache write ${fmt(usage.cacheWriteTokens)} · output ${fmt(usage.outputTokens)}; ` +
      `cost $${cost.toFixed(3)} (estimated $${estimate.usd.toFixed(3)})`,
  );
  const date = new Date().toISOString().slice(0, 10);
  const docs = (name: string) => path.resolve(__dirname, '../docs', name);

  if (!mega) {
    const report = buildReport(scored, {
      model: MODEL,
      bar: CONVO_PASS,
      usage,
      estimate,
      seed,
      planned: cases.length,
    });
    console.log(report);
    const md = `# AI eval (convo)\n\nDate: ${date}\n\n${report}\n`;
    fs.writeFileSync(docs('ai-eval-convo.md'), md);
    // The scored conversations as JSON: scripts/ai-eval-merge.ts --set convo builds the adaptive report and the carry file from it.
    const convoFile: ShardFile = {
      version: 1,
      set: 'convo',
      seed,
      model: MODEL,
      shard: null,
      planned: cases.length,
      order: cases.map((c) => c.name),
      usage,
      estimateUsd: estimate.usd,
      results: scored,
    };
    fs.writeFileSync(docs('ai-eval-convo-all.json'), JSON.stringify(convoFile));
    if (rate < CONVO_PASS) process.exitCode = 1;
    return;
  }

  // The mega set: a report and the scored conversations as JSON (scripts/ai-eval-merge.ts joins the shards).
  const report = buildMegaReport(scored, {
    model: MODEL,
    seed,
    bar: MEGA_PASS,
    usage,
    estimateUsd: estimate.usd,
    planned: cases.length,
  });
  console.log(report);
  const tag = args.shard ? String(args.shard.i) : 'all';
  const file: ShardFile = {
    version: 1,
    set: 'mega',
    seed,
    model: MODEL,
    shard: args.shard,
    planned: cases.length,
    order: cases.map((c) => c.name),
    usage,
    estimateUsd: estimate.usd,
    results: scored,
  };
  fs.writeFileSync(
    docs(args.shard ? `ai-eval-mega-${tag}.md` : 'ai-eval-mega.md'),
    `# AI eval (mega${args.shard ? `, shard ${args.shard.i}/${args.shard.n}` : ''})\n\nDate: ${date}\n\n${report}\n`,
  );
  fs.writeFileSync(docs(`ai-eval-mega-${tag}.json`), JSON.stringify(file));
  // A shard reports; the merge decides (scripts/ai-eval-merge.ts). A whole run decides itself.
  if (!args.shard && rate < MEGA_PASS) process.exitCode = 1;
  if (scored.length === 0 || aborted) process.exitCode = 1;
}

void main();
