/* eslint-disable import/no-unresolved -- SDK lives in server/yerim-ai/node_modules, absent in the main CI job. */
/**
 * Runs the 50 chat eval cases through the same Haiku "understand" call the Worker makes
 * (server/yerim-ai/src/index.ts, /understand) and scores them with src/data/eval/score.ts.
 *
 * Usage (needs ANTHROPIC_API_KEY): npx tsx scripts/ai-eval.ts
 * CI: .github/workflows/ai-eval.yml (manual). Writes docs/chat-eval-ai.md.
 *
 * The SDK is imported from server/yerim-ai/node_modules (pinned 0.133.0, same as the Worker);
 * install it with `npm ci --prefix server/yerim-ai`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import Anthropic from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/index.mjs';
import { zodOutputFormat } from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/helpers/zod.mjs';

import { CHAT_CASES, type ChatCase } from '@/data/eval/chatCases';
import { scoreCase } from '@/data/eval/score';
import { IZMIR_DISTRICTS, type QueryIntent } from '@/data/intent';
import { fold } from '@/data/search';
import { UNDERSTAND_SYSTEM, UnderstandingSchema, type Understanding } from '@/lib/ai/protocol';

// Keep in sync with MODEL in server/yerim-ai/src/index.ts.
const MODEL = 'claude-haiku-5-5';
const DELAY_MS = 500;

type Row = { c: ChatCase; pass: boolean; misses: string[]; error?: string };

const NOTHING_SET: Extract<QueryIntent, { kind: 'search' }> = {
  kind: 'search',
  text: '',
  cat: null,
  dish: null,
  district: null,
  placeQuery: '',
  requireParking: false,
  quality: false,
  uncertain: false,
  food: false,
  nearMe: false,
  mentionsParking: false,
};

/**
 * Mirrors intentFromUnderstanding in src/data/assistant.ts.
 */
function intentFromUnderstanding(u: Understanding, text: string): QueryIntent {
  if (u.kind === 'offtopic') return { kind: 'offtopic' };
  if (u.kind === 'unknown') return { ...NOTHING_SET, text: fold(text) };
  const district = u.district
    ? (IZMIR_DISTRICTS.find((d) => fold(d.name) === fold(u.district!)) ?? null)
    : null;
  return {
    kind: 'search',
    text: fold(text),
    cat: u.cat,
    dish: u.dish,
    district,
    placeQuery: u.place ? fold(u.place) : '',
    requireParking: u.requireParking,
    quality: false,
    uncertain: false,
    food: u.food || u.cat !== null,
    nearMe: u.nearMe,
    mentionsParking: u.requireParking || (!u.food && u.cat === null),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. Export it and re-run: npx tsx scripts/ai-eval.ts');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const rows: Row[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const [i, c] of CHAT_CASES.entries()) {
    if (i > 0) await sleep(DELAY_MS);
    try {
      // Same call as the Worker's /understand branch; no history (cases are context-free).
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 2048,
        system: UNDERSTAND_SYSTEM,
        output_config: { effort: 'low', format: zodOutputFormat(UnderstandingSchema) },
        messages: [{ role: 'user', content: c.text }],
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      const understanding: Understanding =
        response.stop_reason === 'refusal' || !response.parsed_output
          ? { kind: 'unknown' }
          : response.parsed_output;
      rows.push({ c, ...scoreCase(c, intentFromUnderstanding(understanding, c.text)) });
    } catch (e) {
      // Message only: never echo request headers / the key.
      const msg = e instanceof Error ? e.message : 'unknown error';
      rows.push({ c, pass: false, misses: [`error: ${msg}`], error: msg });
      if (e instanceof Anthropic.AuthenticationError) {
        console.error('Authentication failed; aborting.');
        break;
      }
    }
    console.error(`[${i + 1}/${CHAT_CASES.length}] ${rows[rows.length - 1]?.pass ? 'ok' : 'FAIL'}`);
  }

  const ok = (rs: Row[]) => rs.filter((r) => r.pass).length;
  const lines: string[] = [];
  lines.push(`Chat eval (AI understand, ${MODEL}): ${ok(rows)}/${CHAT_CASES.length}`);
  const ruleRows = rows.filter((r) => !r.c.aiExpected);
  lines.push(`Excluding aiExpected: ${ok(ruleRows)}/${ruleRows.length}`);
  const aiRows = rows.filter((r) => r.c.aiExpected);
  lines.push(`aiExpected only: ${ok(aiRows)}/${aiRows.length}`);
  lines.push('Per group:');
  for (const g of [...new Set(CHAT_CASES.map((c) => c.group))]) {
    const gr = rows.filter((r) => r.c.group === g);
    lines.push(`  ${g}: ${ok(gr)}/${gr.length}`);
  }
  const failing = rows.filter((r) => !r.pass);
  lines.push(`Failing (${failing.length}):`);
  for (const r of failing) {
    lines.push(
      `  [${r.c.group}]${r.c.aiExpected ? ' (AI)' : ''} "${r.c.text}" -> ${r.misses.join('; ')}`,
    );
  }
  lines.push(`Errors: ${rows.filter((r) => r.error).length}`);
  lines.push(
    `Tokens: input ${inputTokens}, output ${outputTokens}, total ${inputTokens + outputTokens}`,
  );
  const report = lines.join('\n');
  console.log(report);

  const date = new Date().toISOString().slice(0, 10);
  const md = `# Chat eval (AI)\n\nDate: ${date}\n\n\`\`\`\n${report}\n\`\`\`\n`;
  fs.writeFileSync(path.resolve(__dirname, '../docs/chat-eval-ai.md'), md);
}

void main();
