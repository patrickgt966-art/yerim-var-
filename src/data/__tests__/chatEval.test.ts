/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import { parseQuery } from '../intent';
import { CHAT_CASES, type ChatCase } from '../eval/chatCases';
import { scoreCase } from '../eval/score';

type Row = { c: ChatCase; pass: boolean; misses: string[]; error?: string };

describe('chat eval (baseline, never fails on misses)', () => {
  it('runs every case through parseQuery and reports', () => {
    expect(CHAT_CASES).toHaveLength(56);

    const rows: Row[] = CHAT_CASES.map((c) => {
      try {
        return { c, ...scoreCase(c, parseQuery(c.text)) };
      } catch (e) {
        return { c, pass: false, misses: [`threw: ${String(e)}`], error: String(e) };
      }
    });
    expect(rows.filter((r) => r.error)).toEqual([]);

    const ok = (rs: Row[]) => rs.filter((r) => r.pass).length;
    const lines: string[] = [];
    lines.push(`Chat eval (parseQuery): ${ok(rows)}/${rows.length}`);
    const ruleRows = rows.filter((r) => !r.c.aiExpected);
    lines.push(`Rules-only score excluding aiExpected: ${ok(ruleRows)}/${ruleRows.length}`);
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
    const report = lines.join('\n');

    console.log(report);

    const date = new Date().toISOString().slice(0, 10);
    const md = `# Chat eval baseline\n\nDate: ${date}\n\n\`\`\`\n${report}\n\`\`\`\n`;
    fs.writeFileSync(path.resolve(__dirname, '../../../docs/chat-eval.md'), md);
  });
});
