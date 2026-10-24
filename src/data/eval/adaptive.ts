// Adaptive exams for the live conversation evals (scripts/ai-eval-convo.ts, ai-eval-merge.ts).
// The owner's rule: if an exam asks X questions, the wrong ones are asked again in the next run, the
// right ones are removed and completely different, more complex questions take their place; the
// size stays X. A small sample of the questions that were answered right before is asked again as
// a regression guard (X = carried failures + guard sample + fresh cases).
//
// This file is pure (no files, no network): it builds the carry file from the results of a run,
// composes the next exam from it, and writes the adaptive part of the report and the one machine
// line the log carries (EVAL_SUMMARY). The carry file travels between runs as a CI artifact.
import { makeRng } from './aiBigCases';
import { sampleCases, type ConvoCase } from './convoCases';
import { pct, type CaseResult } from './convoScore';

export type EvalSet = 'convo' | 'mega';
export type ExamMode = 'adaptive' | 'fixed' | 'fresh';
export const EXAM_MODES: readonly ExamMode[] = ['adaptive', 'fixed', 'fresh'];

/** Percent of the exam size asked again from the questions that passed before (the regression guard). */
export const GUARD_DEFAULT = 5;
/** A case that failed this many runs in a row is stubborn (listed on its own, still carried). */
export const STUBBORN_STREAK = 3;
/** The share of the fresh cases that come from the complex layer (the rest: the old templates, a new seed). */
export const COMPLEX_SHARE = 0.6;
/** Categories with a higher failure rate last time get more fresh cases: weight = 1 + min(CAP, GAIN * rate). */
export const WEIGHT_GAIN = 2;
export const WEIGHT_CAP = 1;
/** How many passed definitions the carry file keeps for the guard, and how many hashes of asked conversations. */
export const PASSED_POOL_CAP = 1500;
export const ASKED_CAP = 60000;

export type CategoryStat = { total: number; failed: number };

/** A failed case with what is needed to ask it again: no generator needed. */
export type CarryEntry = {
  c: ConvoCase<string>;
  /** How many runs in a row it has failed (1 = this run only). */
  streak: number;
  /** The run it first failed in. */
  firstRun: string;
  /** It failed after having passed (a guard case that now fails). */
  regression?: boolean;
};

export type CarryFile = {
  version: 1;
  set: EvalSet;
  /** The run that wrote it (the run number). */
  run: string;
  seed: number;
  mode: ExamMode;
  size: number;
  failed: CarryEntry[];
  /** Definitions of cases that passed, a bounded pool the regression guard samples from. */
  passed: ConvoCase<string>[];
  /** Compact hashes of every conversation asked so far: a fresh case never repeats one. */
  askedHashes: string[];
  /** The last run's totals and fails per category: the weights of the next fresh part. */
  categories: Record<string, CategoryStat>;
};

// --- Identity -------------------------------------------------------------------------------

function fnv(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A compact hash (12 hex digits) of a conversation: its city and what the user says, turn by turn. */
export function caseHash(c: ConvoCase<string>): string {
  const text = `${c.city}|${c.turns.map((t) => `${t.input.type}:${t.input.text}`).join('\u0001')}`;
  const a = fnv(text, 2166136261).toString(16).padStart(8, '0');
  const b = fnv(text, 40503).toString(16).padStart(8, '0');
  return a + b.slice(0, 4);
}

const plain = (c: ConvoCase<string>): ConvoCase<string> => {
  const copy: ConvoCase<string> = { ...c };
  delete copy.group;
  return copy;
};

// --- The carry file ---------------------------------------------------------------------------

export type CarryMeta = {
  set: EvalSet;
  run: string;
  seed: number;
  mode: ExamMode;
  size: number;
  /** Seeds the eviction of the passed pool. */
  poolSeed?: number;
};

/** What the run leaves for the next one: failures (streak counted), a pool of passes, asked hashes, rates. */
export function buildCarry(
  results: readonly Pick<CaseResult, 'c' | 'ok'>[],
  previous: CarryFile | null,
  meta: CarryMeta,
): CarryFile {
  const prev = new Map((previous?.failed ?? []).map((e) => [caseHash(e.c), e]));
  const asked = new Set(previous?.askedHashes ?? []);
  const failed = new Map<string, CarryEntry>();
  const passedNow = new Map<string, ConvoCase<string>>();
  const categories: Record<string, CategoryStat> = {};
  const played = new Set<string>();
  for (const r of results) {
    const h = caseHash(r.c);
    played.add(h);
    asked.add(h);
    const stat = (categories[r.c.category] ??= { total: 0, failed: 0 });
    stat.total++;
    if (r.ok) {
      passedNow.set(h, plain(r.c));
      continue;
    }
    stat.failed++;
    const before = prev.get(h);
    const regression = before?.regression === true || r.c.group === 'guard';
    failed.set(h, {
      c: plain(r.c),
      streak: (before?.streak ?? 0) + 1,
      firstRun: before?.firstRun ?? meta.run,
      ...(regression ? { regression: true } : {}),
    });
  }
  // A failure that was not asked this time (a shard is missing, a --limit run) stays on the list.
  for (const [h, e] of prev) if (!played.has(h)) failed.set(h, e);

  const keep = new Map<string, ConvoCase<string>>();
  for (const c of previous?.passed ?? []) keep.set(caseHash(c), c);
  for (const [h, c] of passedNow) keep.set(h, c);
  for (const h of failed.keys()) keep.delete(h);
  let passed = [...keep.values()];
  if (passed.length > PASSED_POOL_CAP) {
    passed = makeRng(meta.poolSeed ?? meta.seed)
      .shuffle(passed)
      .slice(0, PASSED_POOL_CAP);
  }
  return {
    version: 1,
    set: meta.set,
    run: meta.run,
    seed: meta.seed,
    mode: meta.mode,
    size: meta.size,
    failed: [...failed.values()],
    passed,
    askedHashes: [...asked].slice(-ASKED_CAP),
    categories,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A CarryFile from parsed JSON; throws a readable error when it is not one. */
export function readCarry(json: unknown, where = 'carry file'): CarryFile {
  if (
    !isObject(json) ||
    json.version !== 1 ||
    (json.set !== 'convo' && json.set !== 'mega') ||
    !Array.isArray(json.failed)
  ) {
    throw new Error(`${where} is not a carry file (version 1)`);
  }
  return {
    ...(json as unknown as CarryFile),
    passed: Array.isArray(json.passed) ? (json.passed as ConvoCase<string>[]) : [],
    askedHashes: Array.isArray(json.askedHashes) ? (json.askedHashes as string[]) : [],
    categories: isObject(json.categories) ? (json.categories as Record<string, CategoryStat>) : {},
  };
}

/** The slice of a shard file the bootstrap reads (megaMerge.ShardFile fits it). */
export type BootShard = {
  seed: number;
  results: { c?: ConvoCase<string>; ok: boolean }[];
};

/**
 * No carry artifact, but the last run left its shard JSONs: the failed ids come from them. A result
 * holds its full case; one that does not is rebuilt with the seed of that run (`rebuild`).
 */
export function bootstrapCarry(
  shards: readonly BootShard[],
  meta: CarryMeta,
  rebuild: (seed: number) => ConvoCase<string>[],
): CarryFile {
  const results: { c: ConvoCase<string>; ok: boolean }[] = [];
  for (const s of shards) {
    let built: Map<string, ConvoCase<string>> | null = null;
    for (const r of s.results) {
      if (r.c && Array.isArray(r.c.turns)) {
        results.push({ c: r.c, ok: r.ok });
        continue;
      }
      const loose = r as { c?: { name?: string }; name?: string };
      built ??= new Map(rebuild(s.seed).map((c) => [c.name, c]));
      const def = built.get(loose.c?.name ?? loose.name ?? '');
      if (def) results.push({ c: def, ok: r.ok });
    }
  }
  return buildCarry(results, null, meta);
}

// --- The next exam ----------------------------------------------------------------------------

/** Share of the fresh cases per category: the usual mix, more for the categories that failed more. */
export function categoryWeights(
  baseMix: Readonly<Record<string, number>>,
  last: Readonly<Record<string, CategoryStat>> | null,
): Record<string, number> {
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const [cat, n] of Object.entries(baseMix)) {
    const stat = last?.[cat];
    const rate = stat && stat.total > 0 ? stat.failed / stat.total : 0;
    raw[cat] = n * (1 + Math.min(WEIGHT_CAP, WEIGHT_GAIN * rate));
    sum += raw[cat];
  }
  const out: Record<string, number> = {};
  for (const [cat, w] of Object.entries(raw)) out[cat] = sum === 0 ? 0 : w / sum;
  return out;
}

/** `total` split by weights (shares), the rest by the largest remainder: the parts add up to `total`. */
export function allocate(
  total: number,
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const keys = Object.keys(weights);
  const out: Record<string, number> = {};
  const rest: { k: string; frac: number }[] = [];
  let given = 0;
  for (const k of keys) {
    const exact = total * (weights[k] ?? 0);
    out[k] = Math.floor(exact);
    given += out[k]!;
    rest.push({ k, frac: exact - out[k]! });
  }
  rest.sort((a, b) => b.frac - a.frac);
  for (let i = 0; given < total && rest.length > 0; i++, given++) out[rest[i % rest.length]!.k]!++;
  return out;
}

export type ExamInfo = {
  set: EvalSet;
  mode: ExamMode;
  size: number;
  seed: number;
  run: string;
  guardPercent: number;
  carried: number;
  guard: number;
  fresh: number;
  /** Fresh cases the generators could not supply (0 normally). */
  short: number;
  level1: number;
  level2: number;
  /** Carried failures that did not fit into the size. */
  dropped: number;
  weights: Record<string, number>;
  perCategory: Record<string, { carried: number; guard: number; fresh: number }>;
};

export type Exam = { cases: ConvoCase<string>[]; info: ExamInfo };

export type ComposeOpts = {
  set: EvalSet;
  mode: ExamMode;
  size: number;
  /** The run number: the seed of the fresh part, recorded in the report. */
  run: string;
  seed: number;
  guardPercent: number;
  carry: CarryFile | null;
  /** How many cases the fixed set has per category: the usual mix. */
  baseMix: Readonly<Record<string, number>>;
  /** The fixed set (the old behaviour: same cases every run). */
  fixed: () => ConvoCase<string>[];
  /** The old templates with another seed. */
  legacy: (seed: number) => ConvoCase<string>[];
  /** The complex layer: `want` cases per category, none whose hash is in `avoid`. */
  complex: (
    seed: number,
    want: Record<string, number>,
    avoid: ReadonlySet<string>,
  ) => ConvoCase<string>[];
  complexShare?: number;
};

const MAX_ATTEMPTS = 8;
const attemptSeed = (seed: number, attempt: number): number =>
  attempt === 0 ? seed : (seed * 7919 + attempt * 104729) % 2147483647;

/** The names of a list made unique ("name #2"). */
function uniqueNames(cases: ConvoCase<string>[]): ConvoCase<string>[] {
  const seen = new Set<string>();
  return cases.map((c) => {
    let name = c.name;
    for (let k = 2; seen.has(name); k++) name = `${c.name} #${k}`;
    seen.add(name);
    return name === c.name ? c : { ...c, name };
  });
}

/**
 * The exam of this run. fixed: the old set (cut to `size` when smaller). adaptive: all carried
 * failures (the stubborn first), a guard sample of old passes, and fresh cases for the rest, the
 * categories weighted by last time's failure rate. fresh: all new, nothing carried, no guard.
 * The size is kept: carried + guard + fresh = size.
 */
export function composeExam(o: ComposeOpts): Exam {
  const size = Math.max(0, Math.floor(o.size));
  const base: ExamInfo = {
    set: o.set,
    mode: o.mode,
    size,
    seed: o.seed,
    run: o.run,
    guardPercent: o.mode === 'adaptive' ? o.guardPercent : 0,
    carried: 0,
    guard: 0,
    fresh: 0,
    short: 0,
    level1: 0,
    level2: 0,
    dropped: 0,
    weights: {},
    perCategory: {},
  };
  const finish = (cases: ConvoCase<string>[], info: ExamInfo): Exam => {
    const named = uniqueNames(cases);
    const per: ExamInfo['perCategory'] = {};
    for (const c of named) {
      const row = (per[c.category] ??= { carried: 0, guard: 0, fresh: 0 });
      row[c.group ?? 'fresh']++;
    }
    return {
      cases: named,
      info: {
        ...info,
        level1: named.filter((c) => (c.level ?? 1) === 1).length,
        level2: named.filter((c) => c.level === 2).length,
        perCategory: per,
      },
    };
  };

  if (o.mode === 'fixed') {
    const all = o.fixed();
    const cases = size < all.length ? sampleCases(all, size, o.seed) : all;
    return finish(cases, { ...base, size: cases.length, fresh: cases.length });
  }

  const adaptive = o.mode === 'adaptive';
  const carry = o.carry;
  const rng = makeRng(o.seed ^ 0x5bd1e995);

  // 1. Failures come back, the ones that failed most runs in a row first.
  const carriedAll = adaptive && carry ? carry.failed : [];
  const ordered = carriedAll
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.streak - a.e.streak || a.i - b.i)
    .map(({ e }) => e);
  const carried = ordered.slice(0, size).map((e) => ({ ...e.c, group: 'carried' as const }));
  const used = new Set(carried.map(caseHash));

  // 2. A sample of the old passes: a fix must not break what used to work.
  const wantGuard = adaptive ? Math.round((size * Math.max(0, o.guardPercent)) / 100) : 0;
  const pool = (carry?.passed ?? []).filter((c) => !used.has(caseHash(c)));
  const guard = rng
    .shuffle(pool)
    .slice(0, Math.min(wantGuard, Math.max(0, size - carried.length)))
    .map((c) => ({ ...c, group: 'guard' as const }));
  for (const c of guard) used.add(caseHash(c));

  // 3. New cases for the rest: never one that was asked before.
  const freshCount = size - carried.length - guard.length;
  const weights = categoryWeights(o.baseMix, adaptive ? (carry?.categories ?? null) : null);
  const target = allocate(freshCount, weights);
  const avoid = new Set<string>([...(carry?.askedHashes ?? []), ...used]);
  const fresh: ConvoCase<string>[] = [];
  const got: Record<string, number> = {};
  const take = (c: ConvoCase<string>, level: 1 | 2, only?: string): boolean => {
    if (fresh.length >= freshCount) return false;
    if (only !== undefined && c.category !== only) return false;
    const h = caseHash(c);
    if (avoid.has(h)) return false;
    avoid.add(h);
    fresh.push({ ...c, level, group: 'fresh' });
    got[c.category] = (got[c.category] ?? 0) + 1;
    return true;
  };

  const share = o.complexShare ?? COMPLEX_SHARE;
  const wantComplex: Record<string, number> = {};
  for (const [cat, t] of Object.entries(target)) wantComplex[cat] = Math.round(t * share);
  for (const c of o.complex(o.seed, wantComplex, avoid)) {
    if ((got[c.category] ?? 0) < (wantComplex[c.category] ?? 0)) take(c, 2);
  }
  // The old templates fill each category up to its target.
  for (let attempt = 0; attempt < MAX_ATTEMPTS && fresh.length < freshCount; attempt++) {
    const legacy = rng.shuffle(o.legacy(attemptSeed(o.seed, attempt)));
    for (const [cat, t] of Object.entries(target)) {
      for (const c of legacy) {
        if ((got[cat] ?? 0) >= t) break;
        take(c, 1, cat);
      }
    }
  }
  // A category the generators could not fill: any case is better than a smaller exam.
  for (let attempt = 0; attempt < MAX_ATTEMPTS && fresh.length < freshCount; attempt++) {
    for (const c of rng.shuffle(o.legacy(attemptSeed(o.seed, attempt)))) take(c, 1);
  }
  const mixed = rng.shuffle(fresh);

  return finish([...carried, ...guard, ...mixed], {
    ...base,
    carried: carried.length,
    guard: guard.length,
    fresh: mixed.length,
    short: freshCount - mixed.length,
    dropped: carriedAll.length - carried.length,
    weights,
  });
}

/** The composition as lines: what a dry run prints. */
export function compositionLines(info: ExamInfo): string[] {
  const lines = [
    `Exam: ${info.mode}, size ${info.size} = carried ${info.carried} + guard ${info.guard} + fresh ${info.fresh}` +
      (info.short > 0 ? ` (${info.short} short: the generators ran out)` : ''),
    `Run ${info.run}, seed of the fresh part ${info.seed}, guard ${info.guardPercent}%`,
    `Level 1 (old templates): ${info.level1}, level 2 (complex): ${info.level2}` +
      (info.dropped > 0 ? `; ${info.dropped} carried failures did not fit` : ''),
    '',
    'Per category (carried / guard / fresh, weight of the fresh part):',
  ];
  for (const [cat, row] of Object.entries(info.perCategory)) {
    const w = info.weights[cat];
    lines.push(
      `  ${cat}: ${row.carried} / ${row.guard} / ${row.fresh}` +
        (w === undefined ? '' : `  (weight ${(100 * w).toFixed(1)}%)`),
    );
  }
  return lines;
}

// --- The report -------------------------------------------------------------------------------

const GROUP_LABEL = {
  carried: 'carried (asked again)',
  guard: 'kontrol: önceden doğru olanlar',
  fresh: 'fresh (new)',
} as const;

const groupOf = (r: Pick<CaseResult, 'c'>): 'carried' | 'guard' | 'fresh' => r.c.group ?? 'fresh';

export type RunMeta = {
  run: string;
  set: EvalSet;
  mode: ExamMode;
  size: number;
  seed: number;
  guardPercent: number;
};

/** The adaptive part of the report: groups, regressions, levels, stubborn cases, the next carry list. */
export function adaptiveLines(
  results: readonly CaseResult[],
  meta: RunMeta,
  carryOut: CarryFile,
): string[] {
  const lines: string[] = ['## Adaptive exam', ''];
  lines.push(
    `Mode: ${meta.mode} · size ${meta.size} · run ${meta.run} · seed of the fresh cases ${meta.seed}` +
      (meta.mode === 'adaptive' ? ` · guard ${meta.guardPercent}%` : ''),
  );
  lines.push('');
  const row = (label: string, rs: readonly CaseResult[]) => {
    const ok = rs.filter((r) => r.ok).length;
    return `| ${label} | ${rs.length} | ${ok} | ${pct(ok, rs.length)} |`;
  };
  lines.push('| Group | Cases | Pass | % |', '| --- | --- | --- | --- |');
  const by = (g: 'carried' | 'guard' | 'fresh') => results.filter((r) => groupOf(r) === g);
  lines.push(row(meta.mode === 'fixed' ? 'fixed set' : GROUP_LABEL.fresh, by('fresh')));
  if (meta.mode !== 'fixed') {
    lines.push(row(GROUP_LABEL.carried, by('carried')));
    lines.push(row(GROUP_LABEL.guard, by('guard')));
  }
  lines.push('');
  const carried = by('carried');
  lines.push(
    `Carried: ${carried.length} asked again, ${carried.filter((r) => r.ok).length} pass now ` +
      `and leave the list, ${carried.filter((r) => !r.ok).length} stay.`,
  );

  const regressions = by('guard').filter((r) => !r.ok);
  lines.push(
    `Regressions (gerileme): ${regressions.length} of ${by('guard').length} guard cases failed now.`,
  );
  for (const r of regressions) lines.push(`- gerileme: ${r.c.name}`);
  lines.push('');

  lines.push('| Level | Cases | Pass | % |', '| --- | --- | --- | --- |');
  for (const level of [1, 2] as const) {
    const rs = results.filter((r) => (r.c.level ?? 1) === level);
    if (rs.length > 0) lines.push(row(level === 1 ? '1 (old templates)' : '2 (complex)', rs));
  }
  lines.push('');

  const stubborn = carryOut.failed.filter((e) => e.streak >= STUBBORN_STREAK);
  lines.push(
    `Stubborn (failed ${STUBBORN_STREAK}+ runs in a row, still carried): ${stubborn.length}`,
  );
  for (const e of [...stubborn].sort((a, b) => b.streak - a.streak)) {
    lines.push(`- ${e.c.name} (${e.streak} runs, first failed in run ${e.firstRun})`);
  }
  lines.push('');
  lines.push(
    `Carry list for the next run: ${carryOut.failed.length} failed ` +
      `(${carryOut.failed.filter((e) => e.regression).length} regressions), ` +
      `${carryOut.passed.length} passed definitions for the guard, ${carryOut.askedHashes.length} asked conversations.`,
  );
  lines.push('');
  return lines;
}

export type EvalSummary = {
  run: string;
  set: EvalSet;
  mode: ExamMode;
  size: number;
  seed: number;
  played: number;
  passed: number;
  carried: number;
  carriedPassed: number;
  guard: number;
  guardPassed: number;
  fresh: number;
  freshPassed: number;
  regressions: number;
  stubborn: number;
  guardPercent: number;
  byCategory: Record<string, { total: number; passed: number }>;
  byLevel: Record<string, { total: number; passed: number }>;
};

/** The numbers of a run in one object (see summaryLine). */
export function evalSummary(
  results: readonly CaseResult[],
  meta: RunMeta,
  carryOut: CarryFile,
): EvalSummary {
  const count = (rs: readonly CaseResult[]) => ({
    total: rs.length,
    passed: rs.filter((r) => r.ok).length,
  });
  const g = (name: 'carried' | 'guard' | 'fresh') =>
    count(results.filter((r) => groupOf(r) === name));
  const byCategory: EvalSummary['byCategory'] = {};
  for (const cat of [...new Set(results.map((r) => r.c.category))]) {
    byCategory[cat] = count(results.filter((r) => r.c.category === cat));
  }
  const byLevel: EvalSummary['byLevel'] = {};
  for (const level of [1, 2]) {
    const rs = results.filter((r) => (r.c.level ?? 1) === level);
    if (rs.length > 0) byLevel[String(level)] = count(rs);
  }
  return {
    run: meta.run,
    set: meta.set,
    mode: meta.mode,
    size: meta.size,
    seed: meta.seed,
    played: results.length,
    passed: results.filter((r) => r.ok).length,
    carried: g('carried').total,
    carriedPassed: g('carried').passed,
    guard: g('guard').total,
    guardPassed: g('guard').passed,
    fresh: g('fresh').total,
    freshPassed: g('fresh').passed,
    regressions: results.filter((r) => groupOf(r) === 'guard' && !r.ok).length,
    stubborn: carryOut.failed.filter((e) => e.streak >= STUBBORN_STREAK).length,
    guardPercent: meta.guardPercent,
    byCategory,
    byLevel,
  };
}

/** The one machine line the merge prints, so results can be read from the log. */
export const summaryLine = (s: EvalSummary): string => `EVAL_SUMMARY ${JSON.stringify(s)}`;

/** The exam file the plan step writes and the shards and the merge read. */
export type ExamFile = {
  version: 1;
  info: ExamInfo;
  cases: ConvoCase<string>[];
  /** The carry file the exam was composed from (the merge counts streaks from it). */
  carry: CarryFile | null;
};

export function readExam(json: unknown, where = 'exam file'): ExamFile {
  if (!isObject(json) || json.version !== 1 || !Array.isArray(json.cases) || !isObject(json.info)) {
    throw new Error(`${where} is not an exam file (version 1)`);
  }
  return json as unknown as ExamFile;
}
