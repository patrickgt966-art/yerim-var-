/* eslint import/no-unresolved: "off" -- SDK lives in server/yerim-ai/node_modules, absent in the main CI job. */
/**
 * The big live AI eval: ~590 generated cases (src/data/eval/aiBigCases.ts) through the same
 * /understand and /pick calls as the hard cases of scripts/ai-eval.ts, a few at a time, scored
 * with src/data/eval/aiScore.ts. Exits 1 when fewer than BIG_PASS of the cases pass.
 * AI_EVAL_SUITE=extreme runs the ~670 cases of src/data/eval/aiExtremeCases.ts instead, which
 * also call the car park pick and the plan.
 *
 * Usage (needs ANTHROPIC_API_KEY): npx tsx scripts/ai-eval-big.ts
 * AI_EVAL_LIMIT=20 runs only the first 20 cases (a smoke test).
 * CI: .github/workflows/ai-eval-big.yml and ai-eval-extreme.yml. Writes docs/ai-eval-<suite>.md.
 *
 * The SDK is imported from server/yerim-ai/node_modules (pinned, same as the Worker);
 * install it with `npm ci --prefix server/yerim-ai`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import Anthropic from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/index.mjs';
import { zodOutputFormat } from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/helpers/zod.mjs';

import {
  BIG_PICK_CASES,
  BIG_UNDERSTAND_CASES,
  type BigPickCase,
  type BigUnderstandCase,
} from '@/data/eval/aiBigCases';
import { cityById } from '@/data/cities';
import { settleDistrict } from '@/data/districtMatch';
import { quartersOf } from '@/data/quarters';
import {
  EXTREME_PARK_CASES,
  EXTREME_PICK_CASES,
  EXTREME_PLAN_CASES,
  EXTREME_UNDERSTAND_CASES,
  type ParkCase,
  type PlanCase,
} from '@/data/eval/aiExtremeCases';
import { scoreParkPick, scorePick, scorePlan, scoreUnderstanding } from '@/data/eval/aiScore';
import {
  UnderstandingModelSchema,
  parkPickModelSchema,
  parkPickSystem,
  pickModelSchema,
  pickSystem,
  planModelSchema,
  planSystem,
  toPick,
  toPlan,
  toUnderstanding,
  understandSystem,
  type ChatTurn,
  type ParkPickResponse,
  type PickResponse,
  type Understanding,
} from '@/lib/ai/protocol';

// Keep in sync with MODEL in server/yerim-ai/src/index.ts.
const MODEL = 'claude-haiku-5-5';
const CONCURRENCY = 3;
/** One call and up to four retries on 429 / 5xx / a dropped connection. */
const MAX_ATTEMPTS = 5;
/** Share of all cases that must pass; the model is not deterministic, so not all of them. */
const BIG_PASS = 0.8;
/** USD per million tokens (Haiku 5.5), for the cost estimate only. */
const PRICE_IN = 0.1;
const PRICE_OUT = 0.5;

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

type Job =
  | { type: 'understand'; c: BigUnderstandCase }
  | { type: 'pick'; c: BigPickCase }
  | { type: 'park'; c: ParkCase }
  | { type: 'plan'; c: PlanCase };
type Row = { job: Job; pass: boolean; misses: string[]; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** As the Worker's cachedSystem: the fixed prompt is cached across cases. */
const cachedSystem = (text: string) => [
  { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } },
];

/** 1234567 -> "1 234 567". */
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** 429, 5xx and dropped connections are worth one more try. */
function retryable(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.RateLimitError) return true;
  return e instanceof Anthropic.APIError && (e.status ?? 0) >= 500;
}

/** The server's retry-after (seconds) on a 429, in ms, when it sent one. */
function retryAfterMs(e: unknown): number | undefined {
  if (!(e instanceof Anthropic.APIError)) return undefined;
  const v = Number(e.headers?.get?.('retry-after'));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 60) * 1000 : undefined;
}

const pct = (ok: number, n: number) => (n === 0 ? '-' : `${((100 * ok) / n).toFixed(1)}%`);

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      'ANTHROPIC_API_KEY is not set. Export it and re-run: npx tsx scripts/ai-eval-big.ts',
    );
    process.exit(1);
  }

  // Our own single retry (below) instead of the SDK's, so the count stays predictable.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const suite = process.env.AI_EVAL_SUITE === 'extreme' ? 'extreme' : 'big';
  let jobs: Job[] =
    suite === 'extreme'
      ? [
          ...EXTREME_UNDERSTAND_CASES.map((c): Job => ({ type: 'understand', c })),
          ...EXTREME_PICK_CASES.map((c): Job => ({ type: 'pick', c })),
          ...EXTREME_PARK_CASES.map((c): Job => ({ type: 'park', c })),
          ...EXTREME_PLAN_CASES.map((c): Job => ({ type: 'plan', c })),
        ]
      : [
          ...BIG_UNDERSTAND_CASES.map((c): Job => ({ type: 'understand', c })),
          ...BIG_PICK_CASES.map((c): Job => ({ type: 'pick', c })),
        ];
  const limit = Number(process.env.AI_EVAL_LIMIT);
  if (Number.isFinite(limit) && limit > 0) jobs = jobs.slice(0, Math.floor(limit));

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let aborted = false;

  const call = async (job: Job): Promise<{ pass: boolean; misses: string[] }> => {
    const city = job.c.city ?? 'izmir';
    if (job.type === 'understand') {
      const c = job.c;
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 2048,
        system: cachedSystem(understandSystem(city)),
        output_config: { effort: 'low', format: zodOutputFormat(UnderstandingModelSchema) },
        messages: toMessages(c.history ?? [], c.text),
      });
      inputTokens += response.usage.input_tokens;
      cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      outputTokens += response.usage.output_tokens;
      const u: Understanding =
        response.stop_reason === 'refusal' || !response.parsed_output
          ? { kind: 'unknown' }
          : toUnderstanding(response.parsed_output);
      // As the app reads it: the district settled against the city's own list.
      return scoreUnderstanding(
        c,
        settleDistrict(u, c.text, cityById(city).districts, quartersOf(city)),
      );
    }
    if (job.type === 'park') {
      const c = job.c;
      const n = c.candidates.length;
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 1024,
        system: cachedSystem(parkPickSystem(city)),
        output_config: { effort: 'low', format: zodOutputFormat(parkPickModelSchema(n)) },
        messages: [
          { role: 'user', content: JSON.stringify({ text: c.text, candidates: c.candidates }) },
        ],
      });
      inputTokens += response.usage.input_tokens;
      cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      outputTokens += response.usage.output_tokens;
      return scoreParkPick(c, toPick(response.parsed_output, n, true) as ParkPickResponse | null);
    }
    if (job.type === 'plan') {
      const c = job.c;
      const total = c.candidates.reduce((n, r) => n + r.parkings.length, 0);
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 1024,
        system: cachedSystem(planSystem(city)),
        output_config: {
          effort: 'low',
          format: zodOutputFormat(planModelSchema(c.candidates.length, total)),
        },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ text: c.text, when: c.when, candidates: c.candidates }),
          },
        ],
      });
      inputTokens += response.usage.input_tokens;
      cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      outputTokens += response.usage.output_tokens;
      return scorePlan(c, toPlan(response.parsed_output, c.candidates.length, total));
    }
    const c = job.c;
    const n = c.candidates.length;
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: cachedSystem(pickSystem(city)),
      output_config: { effort: 'low', format: zodOutputFormat(pickModelSchema(n)) },
      messages: [
        { role: 'user', content: JSON.stringify({ text: c.text, candidates: c.candidates }) },
      ],
    });
    inputTokens += response.usage.input_tokens;
    cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
    outputTokens += response.usage.output_tokens;
    return scorePick(c, toPick(response.parsed_output, n) as PickResponse | null);
  };

  const rows: (Row | undefined)[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (!aborted) {
      const k = next++;
      const job = jobs[k];
      if (!job) return;
      await sleep(Math.floor(Math.random() * 300));
      let row: Row | undefined;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !row; attempt++) {
        try {
          row = { job, ...(await call(job)) };
        } catch (e) {
          // Message only: never echo request headers / the key.
          const msg = (e instanceof Error ? e.message : 'unknown error')
            .split('\n')[0]!
            .slice(0, 200);
          // A bad key or an empty credit balance fails every call alike: stop at the first.
          const noCredit = e instanceof Anthropic.BadRequestError && /credit balance/i.test(msg);
          if (e instanceof Anthropic.AuthenticationError || noCredit) {
            console.error(
              noCredit ? 'Credit balance too low; aborting.' : 'Authentication failed; aborting.',
            );
            aborted = true;
            row = { job, pass: false, misses: [`error: ${msg}`], error: msg };
          } else if (attempt < MAX_ATTEMPTS - 1 && retryable(e)) {
            // The org limit is per minute (input tokens): wait as told, else back off.
            await sleep(retryAfterMs(e) ?? 5000 * (attempt + 1) + Math.floor(Math.random() * 3000));
          } else {
            row = { job, pass: false, misses: [`error: ${msg}`], error: msg };
          }
        }
      }
      rows[k] = row;
      done++;
      console.error(`[${done}/${jobs.length}] ${row?.pass ? 'ok' : 'FAIL'} ${job.c.name}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const ran = rows.filter((r): r is Row => r !== undefined);
  const ok = (rs: Row[]) => rs.filter((r) => r.pass).length;
  const total = ran.length;
  const passed = ok(ran);
  const rate = total === 0 ? 0 : passed / total;
  // 5-minute prompt cache: reads cost 0.1x and writes 1.25x the input price.
  const cost =
    (inputTokens * PRICE_IN +
      cacheReadTokens * PRICE_IN * 0.1 +
      cacheWriteTokens * PRICE_IN * 1.25 +
      outputTokens * PRICE_OUT) /
    1e6;

  const lines: string[] = [];
  lines.push(
    `${suite === 'extreme' ? 'Extreme' : 'Big'} AI eval (${MODEL}): ${passed}/${total} (${pct(passed, total)})`,
  );
  lines.push(
    `Pass bar: ${Math.round(BIG_PASS * 100)}% -> ${rate >= BIG_PASS ? 'PASS' : 'FAIL'}` +
      (total < jobs.length ? ` (stopped early: ${total}/${jobs.length} ran)` : ''),
  );
  lines.push('');
  lines.push('| Group | Pass | % |');
  lines.push('| --- | --- | --- |');
  for (const g of [...new Set(ran.map((r) => r.job.c.group))]) {
    const gr = ran.filter((r) => r.job.c.group === g);
    lines.push(`| ${g} | ${ok(gr)}/${gr.length} | ${pct(ok(gr), gr.length)} |`);
  }
  lines.push('');
  lines.push('| City | Pass | % |');
  lines.push('| --- | --- | --- |');
  for (const city of [...new Set(ran.map((r) => r.job.c.city ?? 'izmir'))]) {
    const cr = ran.filter((r) => (r.job.c.city ?? 'izmir') === city);
    lines.push(`| ${city} | ${ok(cr)}/${cr.length} | ${pct(ok(cr), cr.length)} |`);
  }
  lines.push('');
  lines.push(`Errors: ${ran.filter((r) => r.error).length}`);
  lines.push(
    `Tokens: input ${fmt(inputTokens)} · cache read ${fmt(cacheReadTokens)} · cache write ${fmt(cacheWriteTokens)} · output ${fmt(outputTokens)}`,
  );
  lines.push(
    `Estimated cost: $${cost.toFixed(3)} (at $${PRICE_IN} in / $${PRICE_OUT} out per MTok)`,
  );
  const failing = ran.filter((r) => !r.pass);
  lines.push('');
  lines.push(`## Failures (${failing.length})`);
  lines.push('');
  for (const r of failing) {
    const c = r.job.c;
    const hist =
      r.job.type === 'understand' && r.job.c.history
        ? ` (after: ${r.job.c.history.map((h) => `${h.role}: ${h.text}`).join(' / ')})`
        : '';
    lines.push(
      `- [${c.group}] [${c.city ?? 'izmir'}] "${c.text}"${hist} -> ${r.misses.join('; ')}`,
    );
  }

  const report = lines.join('\n');
  console.log(report);

  const date = new Date().toISOString().slice(0, 10);
  const md = `# AI eval (${suite})\n\nDate: ${date}\n\n${report}\n`;
  fs.writeFileSync(path.resolve(__dirname, `../docs/ai-eval-${suite}.md`), md);
  if (rate < BIG_PASS) process.exitCode = 1;
}

void main();
