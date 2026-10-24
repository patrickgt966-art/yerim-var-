import {
  ASKED_CAP,
  GUARD_DEFAULT,
  PASSED_POOL_CAP,
  STUBBORN_STREAK,
  adaptiveLines,
  allocate,
  bootstrapCarry,
  buildCarry,
  caseHash,
  categoryWeights,
  composeExam,
  compositionLines,
  evalSummary,
  readCarry,
  readExam,
  summaryLine,
  type CarryFile,
  type ComposeOpts,
} from '../eval/adaptive';
import { buildComplexCases } from '../eval/complexCases';
import { CONVO_CATEGORIES, buildConvoCases, type ConvoCase } from '../eval/convoCases';
import type { CaseResult } from '../eval/convoScore';
import { MEGA_CATEGORIES, buildMegaCases } from '../eval/megaCases';
import { buildMegaReport, readShard, MEGA_PASS, type ShardFile } from '../eval/megaMerge';

const FIXED = buildMegaCases();
const baseMix: Record<string, number> = {};
for (const c of FIXED) baseMix[c.category] = (baseMix[c.category] ?? 0) + 1;

/** A result with only what the carry and the report read. */
const result = (c: ConvoCase<string>, ok: boolean): CaseResult =>
  ({ c, turns: [], scores: [], ok }) as CaseResult;
const meta = (over: Partial<Parameters<typeof buildCarry>[2]> = {}) => ({
  set: 'mega' as const,
  run: '1',
  seed: 1,
  mode: 'adaptive' as const,
  size: 100,
  ...over,
});

const sample = FIXED.slice(0, 60);

describe('the identity of a conversation', () => {
  it('is a compact stable hash of the city and what the user says', () => {
    const [a, b] = [FIXED[0]!, FIXED[1]!];
    expect(caseHash(a)).toMatch(/^[0-9a-f]{12}$/);
    expect(caseHash(a)).toBe(caseHash({ ...a, name: 'another name', sub: 'x', level: 2 }));
    expect(caseHash(a)).not.toBe(caseHash(b));
    expect(caseHash(a)).not.toBe(caseHash({ ...a, city: a.city === 'izmir' ? 'bursa' : 'izmir' }));
    expect(new Set(FIXED.map(caseHash)).size).toBe(FIXED.length);
  });
});

describe('the carry file built from the results of a run', () => {
  const results = sample.map((c, i) => result(c, i % 4 !== 0));
  const carry = buildCarry(results, null, meta({ run: '7' }));

  it('holds every failed case with its full definition, a streak of 1 and the run it first failed in', () => {
    const failed = sample.filter((_, i) => i % 4 === 0);
    expect(carry.failed.map((e) => e.c.name)).toEqual(failed.map((c) => c.name));
    for (const e of carry.failed) {
      expect(e.streak).toBe(1);
      expect(e.firstRun).toBe('7');
      expect(e.c.turns.length).toBeGreaterThan(0);
    }
    // enough to replay it without the generator: it survives JSON
    const again = readCarry(JSON.parse(JSON.stringify(carry)));
    expect(again.failed[0]!.c).toEqual(carry.failed[0]!.c);
  });

  it('keeps passes as definitions for the guard, the asked hashes and the rates per category', () => {
    expect(carry.passed).toHaveLength(sample.length - carry.failed.length);
    expect(carry.askedHashes).toEqual(sample.map(caseHash));
    const total = Object.values(carry.categories).reduce((n, s) => n + s.total, 0);
    expect(total).toBe(sample.length);
    const failed = Object.values(carry.categories).reduce((n, s) => n + s.failed, 0);
    expect(failed).toBe(carry.failed.length);
  });

  it('counts the streak across runs, drops a case that passes, and keeps one that was not asked', () => {
    const failing = carry.failed[0]!;
    const passing = carry.failed[1]!;
    const unasked = carry.failed[2]!;
    const second = buildCarry(
      [
        result({ ...failing.c, group: 'carried' }, false),
        result({ ...passing.c, group: 'carried' }, true),
      ],
      carry,
      meta({ run: '8' }),
    );
    const names = second.failed.map((e) => e.c.name);
    expect(names).toContain(failing.c.name);
    expect(names).not.toContain(passing.c.name);
    // a shard that did not report leaves its failures on the list
    expect(names).toContain(unasked.c.name);
    const again = second.failed.find((e) => e.c.name === failing.c.name)!;
    expect(again.streak).toBe(2);
    expect(again.firstRun).toBe('7');
    expect(second.failed.find((e) => e.c.name === unasked.c.name)!.streak).toBe(1);
    // the run flag is not stored in a definition
    expect(again.c.group).toBeUndefined();
    // the case that passed now is a pool member
    expect(second.passed.map((c) => c.name)).toContain(passing.c.name);
  });

  it('flags a stubborn case from the third run in a row', () => {
    let current: CarryFile = carry;
    const target = carry.failed[0]!.c;
    for (let run = 2; run <= STUBBORN_STREAK; run++) {
      current = buildCarry(
        [result({ ...target, group: 'carried' }, false)],
        current,
        meta({ run: String(run) }),
      );
    }
    const e = current.failed.find((x) => x.c.name === target.name)!;
    expect(e.streak).toBe(STUBBORN_STREAK);
    const lines = adaptiveLines([result(target, false)], { ...meta(), guardPercent: 5 }, current);
    expect(lines.join('\n')).toContain(`Stubborn (failed ${STUBBORN_STREAK}+ runs in a row`);
    expect(lines.join('\n')).toContain(
      `- ${target.name} (${STUBBORN_STREAK} runs, first failed in run 7)`,
    );
    // not stubborn after two runs
    const young = buildCarry([result(target, false)], null, meta());
    expect(
      adaptiveLines([result(target, false)], { ...meta(), guardPercent: 5 }, young).join('\n'),
    ).toContain('still carried): 0');
  });

  it('bounds the pool and the asked hashes', () => {
    const many = Array.from({ length: PASSED_POOL_CAP + 40 }, (_, i) =>
      result(
        {
          ...FIXED[0]!,
          name: `n${i}`,
          turns: [{ ...FIXED[0]!.turns[0]!, input: { type: 'say', text: `t${i}` } }],
        },
        true,
      ),
    );
    const big = buildCarry(many, null, meta());
    expect(big.passed).toHaveLength(PASSED_POOL_CAP);
    expect(big.askedHashes.length).toBeLessThanOrEqual(ASKED_CAP);
    expect(big.askedHashes).toHaveLength(many.length);
  });

  it('rejects a file that is not a carry file', () => {
    expect(() => readCarry({})).toThrow(/not a carry file/);
    expect(() => readCarry({ version: 1, set: 'x', failed: [] }, 'c.json')).toThrow(/c.json/);
    expect(() => readExam({})).toThrow(/not an exam file/);
  });
});

describe('the bootstrap from the shard files of the last run', () => {
  const shardOf = (rs: CaseResult[]): ShardFile => ({
    version: 1,
    set: 'mega',
    seed: 20261023,
    model: 'm',
    shard: null,
    planned: rs.length,
    order: rs.map((r) => r.c.name),
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    estimateUsd: 0,
    results: rs,
  });
  const results = sample.map((c, i) => result(c, i % 5 !== 0));
  const viaJson = readShard(JSON.parse(JSON.stringify(shardOf(results))));

  it('derives the failures (full definitions), the passes and the asked hashes', () => {
    const carry = bootstrapCarry([viaJson], meta({ mode: 'fixed' }), buildMegaCases);
    expect(carry.failed.map((e) => e.c.name)).toEqual(
      sample.filter((_, i) => i % 5 === 0).map((c) => c.name),
    );
    expect(carry.failed.every((e) => e.streak === 1)).toBe(true);
    expect(carry.passed).toHaveLength(sample.length - carry.failed.length);
    expect(carry.askedHashes).toHaveLength(sample.length);
  });

  it('rebuilds a case whose result holds no definition with the seed of that run', () => {
    const bare = {
      seed: 20261023,
      results: sample.map((c, i) => ({ name: c.name, ok: i % 5 !== 0 })) as never,
    };
    const rebuilt = jest.fn(buildMegaCases);
    const carry = bootstrapCarry([bare], meta({ mode: 'fixed' }), rebuilt);
    expect(rebuilt).toHaveBeenCalledWith(20261023);
    expect(carry.failed.map((e) => e.c.name)).toEqual(
      sample.filter((_, i) => i % 5 === 0).map((c) => c.name),
    );
    expect(carry.failed[0]!.c.turns).toEqual(sample[0]!.turns);
  });
});

describe('the weights of the fresh part', () => {
  it('follow the usual mix, with more for the categories that failed more (capped)', () => {
    const even = categoryWeights({ a: 50, b: 50 }, null);
    expect(even).toEqual({ a: 0.5, b: 0.5 });
    const w = categoryWeights(
      { a: 50, b: 50 },
      { a: { total: 100, failed: 40 }, b: { total: 100, failed: 0 } },
    );
    expect(w.a!).toBeGreaterThan(w.b!);
    expect(w.a! + w.b!).toBeCloseTo(1);
    // capped: a category that fails every time is at most twice the weight of a clean one
    const capped = categoryWeights(
      { a: 50, b: 50 },
      { a: { total: 10, failed: 10 }, b: { total: 10, failed: 0 } },
    );
    expect(capped.a! / capped.b!).toBeCloseTo(2);
  });

  it('allocate splits a total exactly', () => {
    const parts = allocate(101, { a: 0.333, b: 0.333, c: 0.334 });
    expect(Object.values(parts).reduce((n, x) => n + x, 0)).toBe(101);
    expect(allocate(0, { a: 1 })).toEqual({ a: 0 });
  });
});

describe('the next exam', () => {
  // A previous run: some failures (with streaks), passes, and every case of a fixed sample asked.
  const prevResults = FIXED.map((c, i) =>
    result(c, c.category === 'honesty' ? i % 2 === 0 : i % 11 !== 0),
  );
  const carry = buildCarry(
    prevResults,
    null,
    meta({ run: '3', mode: 'fixed', size: FIXED.length }),
  );
  // The generator is deterministic: one build per seed is enough for the whole file.
  const built = new Map<number, ConvoCase<string>[]>();
  const legacy = (s: number) => {
    if (!built.has(s)) built.set(s, buildMegaCases(s));
    return built.get(s)!;
  };
  const opts = (over: Partial<ComposeOpts> = {}): ComposeOpts => ({
    set: 'mega',
    mode: 'adaptive',
    size: 800,
    run: '9',
    seed: 9,
    guardPercent: GUARD_DEFAULT,
    carry,
    baseMix,
    fixed: () => legacy(20261023),
    legacy,
    complex: (s, want, avoid) => buildComplexCases(s, want, 'mega', avoid),
    ...over,
  });

  it('keeps the size: carried first, then the guard sample, then fresh cases', () => {
    const exam = composeExam(opts({ size: 700 }));
    expect(exam.cases).toHaveLength(700);
    const { info } = exam;
    expect(info.carried).toBe(Math.min(carry.failed.length, 700));
    expect(info.guard).toBe(35);
    expect(info.carried + info.guard + info.fresh).toBe(700);
    expect(info.short).toBe(0);
    const groups = exam.cases.map((c) => c.group);
    expect(groups.slice(0, info.carried).every((g) => g === 'carried')).toBe(true);
    expect(groups.slice(info.carried, info.carried + info.guard).every((g) => g === 'guard')).toBe(
      true,
    );
    expect(groups.slice(info.carried + info.guard).every((g) => g === 'fresh')).toBe(true);
    // every failure of last time is back
    const names = new Set(exam.cases.map((c) => c.name));
    for (const e of carry.failed) expect(names.has(e.c.name)).toBe(true);
  });

  it('has no duplicate conversation, no duplicate name, and nothing fresh that was asked before', () => {
    const exam = composeExam(opts({ size: 900 }));
    const hashes = exam.cases.map(caseHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(exam.cases.map((c) => c.name)).size).toBe(exam.cases.length);
    const asked = new Set(carry.askedHashes);
    for (const c of exam.cases.filter((x) => x.group === 'fresh')) {
      expect(asked.has(caseHash(c))).toBe(false);
    }
    // the old passes of the guard come from the pool, not from the failures
    const failed = new Set(carry.failed.map((e) => caseHash(e.c)));
    for (const c of exam.cases.filter((x) => x.group === 'guard')) {
      expect(failed.has(caseHash(c))).toBe(false);
      expect(carry.passed.map(caseHash)).toContain(caseHash(c));
    }
  });

  it('puts more fresh cases into the categories that failed more', () => {
    const exam = composeExam(opts({ size: 1200 }));
    const fresh = (cat: string) => exam.info.perCategory[cat]?.fresh ?? 0;
    // honesty failed in half of the cases last time, the others in 1 of 11
    const share = (cat: string) => fresh(cat) / exam.info.fresh;
    const usual = (baseMix.honesty ?? 0) / FIXED.length;
    expect(share('honesty')).toBeGreaterThan(usual * 1.2);
    expect(exam.info.weights.honesty!).toBeGreaterThan(usual);
    for (const cat of MEGA_CATEGORIES) expect(exam.info.perCategory[cat]).toBeDefined();
  });

  it('mixes level 1 (old templates, new seed) and level 2 (complex) fresh cases', () => {
    const exam = composeExam(opts({ size: 600 }));
    const fresh = exam.cases.filter((c) => c.group === 'fresh');
    expect(fresh.filter((c) => c.level === 2).length).toBeGreaterThan(fresh.length * 0.4);
    expect(fresh.filter((c) => c.level === 1).length).toBeGreaterThan(0);
    expect(exam.info.level1 + exam.info.level2).toBe(exam.cases.length);
  });

  it('is the same for the same run, another one for another run', () => {
    const a = composeExam(opts());
    const b = composeExam(opts());
    expect(b.cases).toEqual(a.cases);
    const c = composeExam(opts({ run: '10', seed: 10 }));
    const fresh = (e: typeof a) =>
      new Set(e.cases.filter((x) => x.group === 'fresh').map(caseHash));
    const overlap = [...fresh(a)].filter((h) => fresh(c).has(h));
    expect(overlap.length).toBeLessThan(fresh(a).size * 0.1);
  });

  it('cuts the carried failures to the size, the stubborn first', () => {
    const stubborn = { ...carry.failed[5]!, streak: 4 };
    const crowded: CarryFile = {
      ...carry,
      failed: carry.failed.map((e, i) => (i === 5 ? stubborn : e)),
    };
    const exam = composeExam(opts({ carry: crowded, size: 50 }));
    expect(exam.cases).toHaveLength(50);
    expect(exam.info.carried).toBe(50);
    expect(exam.info.guard + exam.info.fresh).toBe(0);
    expect(exam.info.dropped).toBe(crowded.failed.length - 50);
    expect(exam.cases[0]!.name).toBe(stubborn.c.name);
  });

  it('asks no guard cases with guard 0, and fewer when the pool is small', () => {
    expect(composeExam(opts({ guardPercent: 0 })).info.guard).toBe(0);
    const small: CarryFile = { ...carry, passed: carry.passed.slice(0, 3) };
    const exam = composeExam(opts({ carry: small }));
    expect(exam.info.guard).toBe(3);
    expect(exam.cases).toHaveLength(800);
  });

  it('samples the guard from the pool at random, but the same way for the same run', () => {
    const a = composeExam(opts())
      .cases.filter((c) => c.group === 'guard')
      .map((c) => c.name);
    const b = composeExam(opts({ seed: 10 }))
      .cases.filter((c) => c.group === 'guard')
      .map((c) => c.name);
    expect(a).toHaveLength(40);
    expect(a).not.toEqual(b);
    // not simply the head of the pool
    expect(a).not.toEqual(carry.passed.slice(0, 40).map((c) => c.name));
  });

  it('fresh mode: nothing carried, no guard, never a conversation asked before', () => {
    const exam = composeExam(opts({ mode: 'fresh' }));
    expect(exam.info.carried).toBe(0);
    expect(exam.info.guard).toBe(0);
    expect(exam.cases).toHaveLength(800);
    expect(exam.cases.every((c) => c.group === 'fresh')).toBe(true);
    const asked = new Set(carry.askedHashes);
    expect(exam.cases.some((c) => asked.has(caseHash(c)))).toBe(false);
  });

  it('fixed mode: the old set, same seed, cut to the size', () => {
    const all = composeExam(opts({ mode: 'fixed', size: FIXED.length }));
    expect(all.cases.map((c) => c.name)).toEqual(FIXED.map((c) => c.name));
    expect(all.cases.every((c) => c.group === undefined && (c.level ?? 1) === 1)).toBe(true);
    const part = composeExam(opts({ mode: 'fixed', size: 100 }));
    expect(part.cases).toHaveLength(100);
  });

  it('works without a carry file (the first adaptive run is all fresh)', () => {
    const exam = composeExam(opts({ carry: null }));
    expect(exam.cases).toHaveLength(800);
    expect(exam.info.carried + exam.info.guard).toBe(0);
  });

  it('the convo set composes the same way, in its own categories', () => {
    const convo = buildConvoCases();
    const mix: Record<string, number> = {};
    for (const c of convo) mix[c.category] = (mix[c.category] ?? 0) + 1;
    const exam = composeExam({
      ...opts({ carry: null, size: 200 }),
      set: 'convo',
      baseMix: mix,
      fixed: () => buildConvoCases(),
      legacy: buildConvoCases,
      complex: (s, want, avoid) => buildComplexCases(s, want, 'convo', avoid),
    });
    expect(exam.cases).toHaveLength(200);
    for (const c of exam.cases) expect(CONVO_CATEGORIES as readonly string[]).toContain(c.category);
  });

  it('the dry run prints the composition', () => {
    const exam = composeExam(opts({ size: 500 }));
    const text = compositionLines(exam.info).join('\n');
    expect(text).toContain(
      `Exam: adaptive, size 500 = carried ${exam.info.carried} + guard ${exam.info.guard} + fresh ${exam.info.fresh}`,
    );
    expect(text).toContain('Run 9, seed of the fresh part 9, guard 5%');
    expect(text).toContain('Level 1 (old templates)');
    for (const cat of MEGA_CATEGORIES) expect(text).toContain(`  ${cat}: `);
    expect(text).toMatch(/\(weight \d+\.\d%\)/);
  });
});

describe('the report and the summary line of an adaptive run', () => {
  const mk = (
    group: 'carried' | 'guard' | 'fresh',
    level: 1 | 2,
    n: number,
    ok: boolean,
    from: number,
  ) =>
    Array.from({ length: n }, (_, k) =>
      result({ ...FIXED[from + k]!, group, level, name: `${group}-${level}-${ok}-${k}` }, ok),
    );
  const results = [
    ...mk('carried', 1, 6, true, 0),
    ...mk('carried', 1, 4, false, 10),
    ...mk('guard', 1, 18, true, 20),
    ...mk('guard', 1, 2, false, 40),
    ...mk('fresh', 2, 30, true, 50),
    ...mk('fresh', 2, 10, false, 90),
    ...mk('fresh', 1, 20, true, 100),
  ];
  const run = {
    run: '9',
    set: 'mega' as const,
    mode: 'adaptive' as const,
    size: 90,
    seed: 9,
    guardPercent: 5,
  };
  const carryOut = buildCarry(results, null, meta({ run: '9' }));

  it('shows carried (how many pass now), the guard group, fresh, the level and the seed', () => {
    const text = adaptiveLines(results, run, carryOut).join('\n');
    expect(text).toContain('## Adaptive exam');
    expect(text).toContain(
      'Mode: adaptive · size 90 · run 9 · seed of the fresh cases 9 · guard 5%',
    );
    expect(text).toContain('| carried (asked again) | 10 | 6 | 60.0% |');
    expect(text).toContain('| kontrol: önceden doğru olanlar | 20 | 18 | 90.0% |');
    expect(text).toContain('| fresh (new) | 60 | 50 | 83.3% |');
    expect(text).toContain('Carried: 10 asked again, 6 pass now and leave the list, 4 stay.');
    expect(text).toContain('| 1 (old templates) | 50 | 44 | 88.0% |');
    expect(text).toContain('| 2 (complex) | 40 | 30 | 75.0% |');
  });

  it('lists the guard cases that now fail as gerileme, and they join the carry list', () => {
    const text = adaptiveLines(results, run, carryOut).join('\n');
    expect(text).toContain('Regressions (gerileme): 2 of 20 guard cases failed now.');
    expect(text).toContain('- gerileme: guard-1-false-0');
    expect(text).toContain('- gerileme: guard-1-false-1');
    const regressed = carryOut.failed.filter((e) => e.regression);
    expect(regressed.map((e) => e.c.name)).toEqual(['guard-1-false-0', 'guard-1-false-1']);
    // none when every guard case passes
    const clean = adaptiveLines(
      results.filter((r) => r.ok),
      run,
      carryOut,
    ).join('\n');
    expect(clean).toContain('Regressions (gerileme): 0 of 18 guard cases failed now.');
    expect(clean).not.toContain('- gerileme:');
    // the flag stays while it keeps failing
    const next = buildCarry(
      [result({ ...regressed[0]!.c, group: 'carried' }, false)],
      carryOut,
      meta({ run: '10' }),
    );
    const again = next.failed.find((e) => e.c.name === 'guard-1-false-0')!;
    expect(again.regression).toBe(true);
    expect(again.streak).toBe(2);
  });

  it('fits into the mega report after the header', () => {
    const report = buildMegaReport(results, {
      model: 'm',
      seed: 9,
      bar: MEGA_PASS,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      planned: results.length,
      adaptive: adaptiveLines(results, run, carryOut),
    });
    expect(report.indexOf('## Adaptive exam')).toBeGreaterThan(report.indexOf('Seed: 9'));
    expect(report.indexOf('## Adaptive exam')).toBeLessThan(
      report.indexOf('| Category | Pass | % |'),
    );
    expect(report).toContain('| Category | Pass | % |');
  });

  it('prints one EVAL_SUMMARY line with the counts of the groups', () => {
    const line = summaryLine(evalSummary(results, run, carryOut));
    expect(line.startsWith('EVAL_SUMMARY {')).toBe(true);
    expect(line.includes('\n')).toBe(false);
    const s = JSON.parse(line.slice('EVAL_SUMMARY '.length));
    expect(s).toMatchObject({
      run: '9',
      set: 'mega',
      mode: 'adaptive',
      size: 90,
      played: 90,
      passed: 74,
      carried: 10,
      carriedPassed: 6,
      guard: 20,
      guardPassed: 18,
      fresh: 60,
      freshPassed: 50,
      regressions: 2,
      guardPercent: 5,
    });
    expect(s.byCategory).toBeDefined();
    const sum = Object.values(s.byCategory as Record<string, { total: number }>).reduce(
      (n, c) => n + c.total,
      0,
    );
    expect(sum).toBe(90);
    expect(s.byLevel).toEqual({ '1': { total: 50, passed: 44 }, '2': { total: 40, passed: 30 } });
  });
});
