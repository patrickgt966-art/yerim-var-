/**
 * Merges the shards of the mega eval (scripts/ai-eval-convo.ts --set mega --shard i/n) into one
 * report. Reads docs/ai-eval-mega-<i>.json (or those under --dir, at any depth: the CI downloads
 * every shard's artifact into its own folder), scores the conversations again together (the check
 * that a wording is not repeated across cases needs all of them), and writes docs/ai-eval-mega.md
 * (or --out) with the tables of the convo report, a table by subcategory and the worst failures.
 * Exits 1 when fewer than MEGA_PASS of the conversations pass, or when there is nothing to merge.
 *
 * With --exam (the plan file of an adaptive run) the report also tells the carried, guard and
 * fresh groups apart, and the run leaves ai-eval-<set>-carry.json (the failures with their full
 * definitions and streaks, a pool of passes for the regression guard, the asked hashes) for the
 * next run. One machine line, EVAL_SUMMARY {json}, goes to the log.
 *
 * Usage: npx tsx scripts/ai-eval-merge.ts [--set mega|convo] [--dir <folder>] [--out <file>]
 *   [--exam <exam.json>] [--carry-out <file>] [--run <number>]
 * CI: .github/workflows/ai-eval-mega.yml (the merge job) and ai-eval-convo.yml.
 */
import './convoStubs'; // must stay first: the report imports the app's data modules

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  adaptiveLines,
  buildCarry,
  evalSummary,
  readExam,
  summaryLine,
  type EvalSet,
  type ExamFile,
} from '@/data/eval/adaptive';
import { CONVO_CATEGORIES } from '@/data/eval/convoCases';
import { scoreAll } from '@/data/eval/convoScore';
import {
  MEGA_PASS,
  buildMegaReport,
  mergeShards,
  readShard,
  resultFileOf,
  type ShardFile,
} from '@/data/eval/megaMerge';
import { findFiles } from './evalFiles';

type Args = {
  set: EvalSet;
  dir: string;
  out: string;
  exam?: string;
  carryOut?: string;
  run?: string;
};

function parseArgs(argv: string[]): Args {
  const root = path.resolve(__dirname, '../docs');
  const out: Args = { set: 'mega', dir: root, out: '' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    const value = () => inline ?? argv[++i] ?? '';
    if (flag === '--dir') out.dir = path.resolve(value());
    else if (flag === '--out') out.out = path.resolve(value());
    else if (flag === '--set') {
      const v = value();
      if (v !== 'convo' && v !== 'mega') {
        console.error(`Unknown set "${v}". One of: convo, mega`);
        process.exit(2);
      }
      out.set = v;
    } else if (flag === '--exam') out.exam = path.resolve(value());
    else if (flag === '--carry-out') out.carryOut = path.resolve(value());
    else if (flag === '--run') out.run = value();
    else {
      console.error(`Unknown option: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (out.out === '') out.out = path.join(root, `ai-eval-${out.set}.md`);
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = findFiles(args.dir, resultFileOf(args.set));
  if (files.length === 0) {
    console.error(`No result files (ai-eval-${args.set}-...json) under ${args.dir}`);
    process.exit(1);
  }
  const shards: ShardFile[] = files.map((f) =>
    readShard(JSON.parse(fs.readFileSync(f, 'utf8')), f, args.set),
  );
  const merged = mergeShards(shards);
  const exam: ExamFile | null =
    args.exam && fs.existsSync(args.exam)
      ? readExam(JSON.parse(fs.readFileSync(args.exam, 'utf8')), args.exam)
      : null;
  // Scored again as one: the repeated-wording check looks across all cases.
  const scored = scoreAll(
    merged.results.map((r) => ({ c: r.c, turns: r.turns, ...(r.error ? { error: r.error } : {}) })),
  );
  const passed = scored.filter((r) => r.ok).length;
  const rate = scored.length === 0 ? 0 : passed / scored.length;
  // The exam this run asked (no plan file: the fixed set), and the carry list it started from.
  const info = exam?.info;
  const meta = {
    run: args.run ?? info?.run ?? process.env.GITHUB_RUN_NUMBER ?? '0',
    set: args.set,
    mode: info?.mode ?? ('fixed' as const),
    size: info?.size ?? scored.length,
    seed: info?.seed ?? merged.seed,
    guardPercent: info?.guardPercent ?? 0,
  };
  const carryOut = buildCarry(scored, exam?.carry ?? null, meta);
  const convo = args.set === 'convo';
  const report = buildMegaReport(scored, {
    model: merged.model,
    seed: merged.seed,
    bar: MEGA_PASS,
    usage: merged.usage,
    estimateUsd: merged.estimateUsd,
    planned: merged.planned,
    shards: { have: merged.shards, of: merged.of },
    ...(convo ? { title: 'Convo AI eval', categories: CONVO_CATEGORIES } : {}),
    adaptive: adaptiveLines(scored, meta, carryOut),
  });
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `# AI eval (${args.set})\n\nDate: ${date}\n\n${report}\n`);
  const carryFile =
    args.carryOut ?? path.join(path.dirname(args.out), `ai-eval-${args.set}-carry.json`);
  fs.mkdirSync(path.dirname(carryFile), { recursive: true });
  fs.writeFileSync(carryFile, JSON.stringify(carryOut));
  console.error(
    `Merged ${files.length} result file(s): ${passed}/${scored.length} passed (${(100 * rate).toFixed(1)}%) -> ${args.out}; ` +
      `${carryOut.failed.length} failures carried -> ${carryFile}`,
  );
  console.log(summaryLine(evalSummary(scored, meta, carryOut)));
  if (rate < MEGA_PASS) process.exitCode = 1;
}

main();
