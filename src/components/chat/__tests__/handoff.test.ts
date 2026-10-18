import { HISTORY_LIMIT } from '@/lib/ai/protocol';

import { handOffQuestion, takeHandedOffQuestion } from '../handoff';
import { aiHistory } from '../model';

describe('handing a question to the chat', () => {
  it('is taken once', () => {
    handOffQuestion('  Yakınımda otopark ');
    expect(takeHandedOffQuestion()).toBe('Yakınımda otopark');
    expect(takeHandedOffQuestion()).toBeNull();
  });

  it('expires when the chat did not open soon after', () => {
    handOffQuestion('köfte');
    expect(takeHandedOffQuestion(Date.now() + 60_000)).toBeNull();
  });

  it('is nothing for an empty question', () => {
    handOffQuestion('   ');
    expect(takeHandedOffQuestion()).toBeNull();
  });
});

describe('AI history', () => {
  const msgs = Array.from({ length: 14 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'bot') as 'user' | 'bot',
    text: `m${i}`,
  }));

  it('never holds messages from before the consent', () => {
    expect(aiHistory(msgs.slice(0, 2), Infinity)).toEqual([]);
    expect(aiHistory(msgs.slice(0, 4), 2).map((m) => m.text)).toEqual(['m2', 'm3']);
  });

  it('keeps at most the last HISTORY_LIMIT turns', () => {
    const h = aiHistory(msgs, 0);
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[h.length - 1]!.text).toBe('m13');
  });
});
