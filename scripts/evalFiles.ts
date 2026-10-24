// File helpers shared by scripts/ai-eval-convo.ts and scripts/ai-eval-merge.ts.
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Every file under `dir` (any depth) whose name matches `name`, sorted: CI downloads each artifact into its own folder. */
export function findFiles(dir: string, name: RegExp): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, name));
    else if (name.test(entry.name)) out.push(full);
  }
  return out.sort();
}
