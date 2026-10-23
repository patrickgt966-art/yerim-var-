import type { Understanding } from '@/lib/ai/protocol';

import { MEGA_CASES, MEGA_CATEGORIES, TIMES_OF_DAY, shardOf } from '../eval/megaCases';
import { sampleCases } from '../eval/convoCases';
import { scoreAll, type ObservedTurn, type ObservedWording } from '../eval/convoScore';
import {
  MEGA_PASS,
  WORST,
  buildMegaReport,
  mergeShards,
  readShard,
  type ShardFile,
} from '../eval/megaMerge';

// Fixture shards: conversations with hand-made transcripts, some of them failing.

const chat: Understanding = { kind: 'chat', reply: 'Selam!', action: 'none' };

const wording = (accepted: string | null, rejectReason: string | null = null): ObservedWording => ({
  kind: 'food',
  raw: accepted ?? 'Ucuz yerler.',
  accepted,
  rejectReason,
  shown: accepted !== null,
  late: false,
  hasFreeSpots: false,
});

/** A transcript for every turn of the case: a chat reply that fails any search expectation. */
function transcript(input: string, text: string, w: ObservedWording[]): ObservedTurn {
  return {
    input,
    tapMissing: false,
    routerCalls: 1,
    understood: chat,
    routerFailed: false,
    text,
    cards: [],
    actions: [],
    ctx: {
      place: null,
      cat: null,
      dish: null,
      requireParking: false,
      freeParking: false,
      ask: null,
      choice: null,
    },
    wordings: w,
    infra: false,
  };
}

const picked = sampleCases(MEGA_CASES, 64, 7);
const played = picked.map((c, k) => ({
  c,
  // Every third conversation is a chat reply to a talk turn: the only kind that can pass here.
  turns: c.turns.map((t) =>
    transcript(
      t.input.text,
      k % 3 === 0
        ? 'Orası benim işim değil. Yemek mi otopark mı?'
        : 'Bornova civarında 8 yer buldum.',
      k % 2 === 0 ? [wording('Selam! Ne bakıyoruz?')] : [wording(null, 'price-word')],
    ),
  ),
}));
const scored = scoreAll(played);

function shardFiles(n: number): ShardFile[] {
  return Array.from({ length: n }, (_, i) => {
    const mine = shardOf(scored, i, n);
    return {
      version: 1 as const,
      set: 'mega' as const,
      seed: 20261023,
      model: 'claude-haiku-5-5',
      shard: { i, n },
      planned: mine.length,
      order: mine.map((r) => r.c.name),
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 300 },
      estimateUsd: 0.5,
      results: mine,
    };
  });
}
// What the CI hands the merge: the files as JSON.
const viaJson = (f: ShardFile): ShardFile => readShard(JSON.parse(JSON.stringify(f)));

describe('merging the shards of the mega eval', () => {
  it('joins the shards back into the order of the case list, and sums the usage', () => {
    const files = shardFiles(3).map(viaJson);
    const merged = mergeShards([files[2]!, files[0]!, files[1]!]);
    expect(merged.results.map((r) => r.c.name)).toEqual(scored.map((r) => r.c.name));
    expect(merged.planned).toBe(scored.length);
    expect(merged.usage).toEqual({
      inputTokens: 3000,
      outputTokens: 600,
      cacheReadTokens: 15000,
      cacheWriteTokens: 900,
    });
    expect(merged.estimateUsd).toBeCloseTo(1.5);
    expect(merged.shards).toEqual([0, 1, 2]);
    expect(merged.of).toBe(3);
    // A conversation that two files hold is counted once.
    expect(mergeShards([files[0]!, files[0]!]).results).toHaveLength(files[0]!.results.length);
  });

  it('keeps a result in its place when a conversation of its shard did not play', () => {
    const [a, b] = shardFiles(2) as [ShardFile, ShardFile];
    const holed = { ...a, results: a.results.filter((_, k) => k !== 1) };
    const merged = mergeShards([holed, b]);
    const names = scored.map((r) => r.c.name);
    expect(merged.results.map((r) => r.c.name)).toEqual(names.filter((n) => n !== a.order[1]));
  });

  it('rejects a file that is not a mega shard', () => {
    expect(() => readShard({})).toThrow(/not a mega shard/);
    expect(() => readShard({ version: 1, set: 'convo', results: [], usage: {} })).toThrow();
    expect(() => readShard({ version: 1, set: 'mega' })).toThrow(/no results/);
    expect(() => readShard('x', 'a.json')).toThrow(/a.json/);
  });
});

describe('the mega report', () => {
  const merged = mergeShards(shardFiles(2).map(viaJson));
  const report = buildMegaReport(merged.results, {
    model: merged.model,
    seed: merged.seed,
    bar: MEGA_PASS,
    usage: merged.usage,
    estimateUsd: merged.estimateUsd,
    planned: merged.planned,
    shards: { have: merged.shards, of: merged.of },
  });

  it('opens with the pass rate against the bar, the shards and the seed', () => {
    const passed = merged.results.filter((r) => r.ok).length;
    expect(report).toContain(`Mega AI eval (claude-haiku-5-5): ${passed}/${merged.results.length}`);
    expect(report).toContain('Pass bar: 85% -> FAIL');
    expect(report).toContain('Shards: 2 of 2');
    expect(report).toContain('Seed: 20261023');
  });

  it('has the tables of the convo report: category, check, city, style, app language, time of day', () => {
    expect(report).toContain('| Category | Pass | % |');
    for (const category of MEGA_CATEGORIES) expect(report).toContain(`| ${category} | `);
    expect(report).toContain('| Check (per turn) | Pass | % |');
    for (const check of ['understanding', 'choices', 'reply', 'honesty', 'every check']) {
      expect(report).toContain(`| ${check} | `);
    }
    expect(report).toContain('| City | Pass | % |');
    expect(report).toContain('| Language / style | Pass | % |');
    expect(report).toContain('| App language | Pass | % |');
    expect(report).toContain('| Location | Pass | % |');
    expect(report).toContain('| Time of day | Pass | % |');
    for (const slot of TIMES_OF_DAY) {
      const any = merged.results.some((r) => r.c.hour >= 0 && slotOf(r.c.hour) === slot);
      expect(report.includes(`| ${slot} | `)).toBe(any);
    }
  });

  it('has the reply wording acceptance with the reasons, the message length, tokens and cost', () => {
    expect(report).toMatch(/Reply wording \(validateReply\): \d+\/\d+ accepted/);
    expect(report).toContain('### Rejected wordings by kind and reason');
    expect(report).toContain('| food | price-word | ');
    expect(report).toMatch(/Message length \(sentences of the whole Yerim message/);
    expect(report).toContain(
      'Tokens: input 2 000 · cache read 10 000 · cache write 600 · output 400',
    );
    expect(report).toContain('Cost: $');
    expect(report).toContain('Estimate before the run: $1.000');
  });

  it('has a table by subcategory, in the order of the categories', () => {
    expect(report).toContain('## By subcategory');
    expect(report).toContain('| Category / subcategory | Pass | % |');
    const rows = report
      .split('\n')
      .filter((l) => /^\| (style|multi|goals|parking|dishes|honesty|plans|edge)\/\S+ \|/.test(l));
    const subs = new Set(merged.results.map((r) => `${r.c.category}/${r.c.sub}`));
    expect(rows).toHaveLength(subs.size);
    const order = rows.map((l) => MEGA_CATEGORIES.indexOf(l.slice(2).split('/')[0] as never));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('lists at most the 60 worst failures with their conversations', () => {
    const failing = merged.results.filter((r) => !r.ok).length;
    expect(failing).toBeGreaterThan(0);
    expect(report).toContain(`## Worst failures (${Math.min(WORST, failing)} of ${failing})`);
    expect(report).toMatch(/\*\*\w+: \[\w+\] .*\*\* \(\w+, \w+, \d+:00\)/);
    expect(report).toContain('1. user: ');
    expect(report).toContain('   yerim: ');

    // 70 failing conversations: 60 are shown.
    const many = Array.from({ length: 70 }, (_, k) => {
      const base = merged.results[k % merged.results.length]!;
      return { ...base, ok: false, c: { ...base.c, name: `${base.c.name} #${k}` } };
    });
    const long = buildMegaReport(many, {
      model: 'm',
      seed: 1,
      bar: MEGA_PASS,
      usage: merged.usage,
      planned: 70,
    });
    expect(long).toContain('## Worst failures (60 of 70)');
    expect(long).not.toContain('Estimate before the run');
    expect(long).not.toContain('Shards:');
  });

  it('says which shards are missing', () => {
    const one = mergeShards([shardFiles(3)[1]!]);
    const text = buildMegaReport(one.results, {
      model: one.model,
      seed: one.seed,
      bar: MEGA_PASS,
      usage: one.usage,
      planned: scored.length,
      shards: { have: one.shards, of: one.of },
    });
    expect(text).toContain('Shards: 1 of 3 (missing: 0, 2)');
    expect(text).toContain(`(stopped early: ${one.results.length}/${scored.length} ran)`);
  });

  it('passes at the bar and above, fails below', () => {
    const allOk = merged.results.map((r) => ({ ...r, ok: true }));
    const meta = {
      model: 'm',
      seed: 1,
      bar: MEGA_PASS,
      usage: merged.usage,
      planned: allOk.length,
    };
    expect(buildMegaReport(allOk, meta)).toContain('Pass bar: 85% -> PASS');
    expect(buildMegaReport(allOk, meta)).toContain('## Worst failures (0 of 0)');
    const nine = allOk.map((r, k) => (k % 10 === 0 ? { ...r, ok: false } : r));
    expect(buildMegaReport(nine, meta)).toContain('Pass bar: 85% -> PASS');
    const six = allOk.map((r, k) => (k % 6 === 0 ? { ...r, ok: false } : r));
    expect(buildMegaReport(six, meta)).toContain('Pass bar: 85% -> FAIL');
  });
});

function slotOf(hour: number): string {
  return hour < 5 ? 'late night' : hour < 11 ? 'morning' : hour < 16 ? 'noon' : 'evening';
}
