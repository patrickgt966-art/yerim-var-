/**
 * Merges the shards of the mega eval (scripts/ai-eval-convo.ts --set mega --shard i/n) into one
 * report. Reads docs/ai-eval-mega-<i>.json (or those under --dir, at any depth: the CI downloads
 * every shard's artifact into its own folder), scores the conversations again together (the check
 * that a wording is not repeated across cases needs all of them), and writes docs/ai-eval-mega.md
 * (or --out) with the tables of the convo report, a table by subcategory and the worst failures.
 * Exits 1 when fewer than MEGA_PASS of the conversations pass, or when there is nothing to merge.
 *
 * Usage: npx tsx scripts/ai-eval-merge.ts [--dir <folder>] [--out <file>]
 * CI: .github/workflows/ai-eval-mega.yml (the merge job).
 */
import './convoStubs'; // must stay first: the report imports the app's data modules

import * as fs from 'node:fs';
import * as path from 'node:path';

import { scoreAll } from '@/data/eval/convoScore';
import {
  MEGA_PASS,
  SHARD_FILE,
  buildMegaReport,
  mergeShards,
  readShard,
  type ShardFile,
} from '@/data/eval/megaMerge';

/** Every file under `dir` (any depth) whose name is a shard file. */
function findShards(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findShards(full));
    else if (SHARD_FILE.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function parseArgs(argv: string[]): { dir: string; out: string } {
  const root = path.resolve(__dirname, '../docs');
  const out = { dir: root, out: path.join(root, 'ai-eval-mega.md') };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    const value = () => inline ?? argv[++i] ?? '';
    if (flag === '--dir') out.dir = path.resolve(value());
    else if (flag === '--out') out.out = path.resolve(value());
    else {
      console.error(`Unknown option: ${argv[i]}`);
      process.exit(2);
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = findShards(args.dir);
  if (files.length === 0) {
    console.error(`No ai-eval-mega-<i>.json under ${args.dir}`);
    process.exit(1);
  }
  const shards: ShardFile[] = files.map((f) =>
    readShard(JSON.parse(fs.readFileSync(f, 'utf8')), f),
  );
  const merged = mergeShards(shards);
  // Scored again as one: the repeated-wording check looks across all cases.
  const scored = scoreAll(
    merged.results.map((r) => ({ c: r.c, turns: r.turns, ...(r.error ? { error: r.error } : {}) })),
  );
  const passed = scored.filter((r) => r.ok).length;
  const rate = scored.length === 0 ? 0 : passed / scored.length;
  const report = buildMegaReport(scored, {
    model: merged.model,
    seed: merged.seed,
    bar: MEGA_PASS,
    usage: merged.usage,
    estimateUsd: merged.estimateUsd,
    planned: merged.planned,
    shards: { have: merged.shards, of: merged.of },
  });
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `# AI eval (mega)\n\nDate: ${date}\n\n${report}\n`);
  console.error(
    `Merged ${files.length} shard file(s): ${passed}/${scored.length} passed (${(100 * rate).toFixed(1)}%) -> ${args.out}`,
  );
  if (rate < MEGA_PASS) process.exitCode = 1;
}

main();
