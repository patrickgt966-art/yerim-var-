// The report of the mega conversation eval (scripts/ai-eval-convo.ts --set mega) and the merge of
// its shards (scripts/ai-eval-merge.ts). A shard writes its played conversations, scored, as a
// ShardFile; the merge reads them all and builds one report with the same tables as the convo
// report (category, check, city, language / style, app language, time of day, reply wording and why
// it was dropped, message length), a table by subcategory so the weak spots show, and the worst
// failures. Pure: no files here.
import {
  CHECKS,
  conversationLines,
  costOf,
  fmt,
  messageSentences,
  pct,
  rejectionLines,
  worst,
  PRICE_IN,
  PRICE_OUT,
  type CaseResult,
  type Usage,
} from './convoScore';
import { MEGA_CATEGORIES, timeOfDay, TIMES_OF_DAY } from './megaCases';

/** What a shard run leaves behind, as JSON. */
export type ShardFile = {
  version: 1;
  set: 'mega';
  seed: number;
  model: string;
  /** The shard (i of n), or null for a run of everything. */
  shard: { i: number; n: number } | null;
  /** How many conversations this run was asked to play. */
  planned: number;
  /** The names of the conversations it was asked to play, in order (a missing result leaves a gap). */
  order: string[];
  usage: Usage;
  estimateUsd: number;
  results: CaseResult[];
};

export const SHARD_FILE = /^ai-eval-mega-(\d+)\.json$/;
/** The share of the conversations that must pass; the model is not deterministic, so not all of them. */
export const MEGA_PASS = 0.85;
/** How many failed conversations the report lists. */
export const WORST = 60;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A ShardFile from parsed JSON; throws a readable error when it is not one. */
export function readShard(json: unknown, where = 'shard file'): ShardFile {
  if (!isObject(json) || json.version !== 1 || json.set !== 'mega') {
    throw new Error(`${where} is not a mega shard (version 1)`);
  }
  if (!Array.isArray(json.results) || !isObject(json.usage)) {
    throw new Error(`${where} has no results`);
  }
  return json as unknown as ShardFile;
}

export type Merged = {
  results: CaseResult[];
  usage: Usage;
  estimateUsd: number;
  planned: number;
  seed: number;
  model: string;
  /** The shards that came (their index), and how many there should be. */
  shards: number[];
  of: number;
};

/** All shards in one: the results in the order of the case list, the usage and the plan summed. */
export function mergeShards(files: readonly ShardFile[]): Merged {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const seen = new Set<string>();
  const ordered: { at: number; r: CaseResult }[] = [];
  let estimateUsd = 0;
  let planned = 0;
  for (const f of files) {
    usage.inputTokens += f.usage.inputTokens;
    usage.outputTokens += f.usage.outputTokens;
    usage.cacheReadTokens += f.usage.cacheReadTokens;
    usage.cacheWriteTokens += f.usage.cacheWriteTokens;
    estimateUsd += f.estimateUsd;
    planned += f.planned;
    // Shard i of n played every n-th case from the i-th: that is where each result was in the list.
    const { i, n } = f.shard ?? { i: 0, n: 1 };
    const place = new Map(f.order.map((name, pos) => [name, pos]));
    f.results.forEach((r, pos) => {
      if (seen.has(r.c.name)) return;
      seen.add(r.c.name);
      ordered.push({ at: i + n * (place.get(r.c.name) ?? pos), r });
    });
  }
  const results = ordered.sort((a, b) => a.at - b.at).map((x) => x.r);
  const first = files[0];
  return {
    results,
    usage,
    estimateUsd,
    planned,
    seed: first?.seed ?? 0,
    model: first?.model ?? '',
    shards: files.map((f) => f.shard?.i ?? 0).sort((a, b) => a - b),
    of: first?.shard?.n ?? 1,
  };
}

const row = (label: string, rs: readonly CaseResult[]): string => {
  const ok = rs.filter((r) => r.ok).length;
  return `| ${label} | ${ok}/${rs.length} | ${pct(ok, rs.length)} |`;
};

/** A table of pass rates grouped by a key, in the order of `keys` (or of first appearance). */
function table(
  title: string,
  results: readonly CaseResult[],
  key: (r: CaseResult) => string,
  keys?: readonly string[],
): string[] {
  const order = keys ?? [...new Set(results.map(key))];
  const lines = [`| ${title} | Pass | % |`, '| --- | --- | --- |'];
  for (const k of order) {
    const rs = results.filter((r) => key(r) === k);
    if (rs.length > 0) lines.push(row(k, rs));
  }
  lines.push('');
  return lines;
}

export type MegaReportMeta = {
  model: string;
  seed: number;
  /** Share of the conversations that must pass. */
  bar: number;
  usage: Usage;
  estimateUsd?: number;
  /** How many conversations were asked for (fewer ran when a shard is missing). */
  planned: number;
  /** The shards that came, and how many there should be (omit for a run of everything). */
  shards?: { have: readonly number[]; of: number };
};

const subKey = (r: CaseResult): string => `${r.c.category}/${r.c.sub ?? '-'}`;

/** The markdown report of a mega run, or of the merge of its shards. */
export function buildMegaReport(results: CaseResult[], meta: MegaReportMeta): string {
  const lines: string[] = [];
  const passed = results.filter((r) => r.ok).length;
  const rate = results.length === 0 ? 0 : passed / results.length;
  lines.push(
    `Mega AI eval (${meta.model}): ${passed}/${results.length} (${pct(passed, results.length)})`,
  );
  lines.push(
    `Pass bar: ${Math.round(meta.bar * 100)}% -> ${rate >= meta.bar ? 'PASS' : 'FAIL'}` +
      (results.length < meta.planned
        ? ` (stopped early: ${results.length}/${meta.planned} ran)`
        : ''),
  );
  if (meta.shards) {
    const missing = Array.from({ length: meta.shards.of }, (_, i) => i).filter(
      (i) => !meta.shards!.have.includes(i),
    );
    lines.push(
      `Shards: ${meta.shards.have.length} of ${meta.shards.of}` +
        (missing.length > 0 ? ` (missing: ${missing.join(', ')})` : ''),
    );
  }
  lines.push(`Seed: ${meta.seed}`);
  lines.push('');

  lines.push(...table('Category', results, (r) => r.c.category, MEGA_CATEGORIES));

  lines.push('| Check (per turn) | Pass | % |', '| --- | --- | --- |');
  const allScores = results.flatMap((r) => r.scores);
  for (const check of CHECKS) {
    const applicable = allScores.filter((s) => !s[check].na);
    const ok = applicable.filter((s) => s[check].ok).length;
    lines.push(`| ${check} | ${ok}/${applicable.length} | ${pct(ok, applicable.length)} |`);
  }
  const turnsOk = allScores.filter((s) => s.ok).length;
  lines.push(
    `| every check | ${turnsOk}/${allScores.length} | ${pct(turnsOk, allScores.length)} |`,
  );
  lines.push('');

  lines.push(...table('City', results, (r) => r.c.city));
  lines.push(...table('Language / style', results, (r) => r.c.style ?? 'plain'));
  lines.push(...table('App language', results, (r) => r.c.ui ?? 'tr'));
  lines.push(
    ...table('Location', results, (r) => (r.c.located === false ? 'no location' : 'location')),
  );
  lines.push(...table('Time of day', results, (r) => timeOfDay(r.c.hour), TIMES_OF_DAY));

  const wordings = results.flatMap((r) => r.turns.flatMap((t) => t.wordings));
  const accepted = wordings.filter((w) => w.accepted !== null).length;
  const shown = wordings.filter((w) => w.shown).length;
  const late = wordings.filter((w) => w.late).length;
  const failed = wordings.filter((w) => w.raw === null).length;
  lines.push(
    `Reply wording (validateReply): ${accepted}/${wordings.length} accepted (${pct(accepted, wordings.length)}); ` +
      `${wordings.length - accepted - failed} rejected, ${failed} failed, ${late} late; ${shown} shown to the user. ` +
      'Reported, not a pass condition: a rejected text falls back to the template.',
  );
  for (const kind of [...new Set(wordings.map((w) => w.kind))]) {
    const ws = wordings.filter((w) => w.kind === kind);
    const ok = ws.filter((w) => w.accepted !== null).length;
    lines.push(`- ${kind}: ${ok}/${ws.length} (${pct(ok, ws.length)})`);
  }
  lines.push(...rejectionLines(wordings));
  const lengths = results.flatMap((r) => r.turns.map((t) => messageSentences(t.text)));
  const buckets = [1, 2, 3, 4].map((n) => lengths.filter((l) => l === n).length);
  const long = lengths.filter((l) => l > 4).length;
  lines.push(
    `Message length (sentences of the whole Yerim message, templates and notes included; ${lengths.length} turns): ` +
      `1: ${buckets[0]}, 2: ${buckets[1]}, 3: ${buckets[2]}, 4: ${buckets[3]}, over 4: ${long} (${pct(long, lengths.length)}), longest ${Math.max(0, ...lengths)}. ` +
      'Reported, not a pass condition yet.',
  );
  lines.push('');
  lines.push(`Errors: ${results.filter((r) => r.error).length}`);
  const u = meta.usage;
  lines.push(
    `Tokens: input ${fmt(u.inputTokens)} · cache read ${fmt(u.cacheReadTokens)} · cache write ${fmt(u.cacheWriteTokens)} · output ${fmt(u.outputTokens)}`,
  );
  lines.push(`Cost: $${costOf(u).toFixed(3)} (at $${PRICE_IN} in / $${PRICE_OUT} out per MTok)`);
  if (meta.estimateUsd !== undefined) {
    lines.push(`Estimate before the run: $${meta.estimateUsd.toFixed(3)}`);
  }
  lines.push('');

  lines.push('## By subcategory', '');
  lines.push(...table('Category / subcategory', results, subKey, subKeys(results)));

  const failing = results.filter((r) => !r.ok);
  const shownFails = worst(results, WORST);
  lines.push(`## Worst failures (${shownFails.length} of ${failing.length})`, '');
  for (const r of shownFails) {
    lines.push(...conversationLines(r));
    lines.push('');
  }
  return lines.join('\n');
}

/** Category/subcategory keys: the categories in order, the subcategories in the order they come. */
function subKeys(results: readonly CaseResult[]): string[] {
  const keys: string[] = [];
  for (const cat of MEGA_CATEGORIES) {
    for (const r of results) {
      const k = subKey(r);
      if (r.c.category === cat && !keys.includes(k)) keys.push(k);
    }
  }
  for (const r of results) if (!keys.includes(subKey(r))) keys.push(subKey(r));
  return keys;
}
