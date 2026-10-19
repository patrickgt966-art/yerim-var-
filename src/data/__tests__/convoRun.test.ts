// The runner of the conversation eval, driven by a fake AI: the real assistant answers, the way the
// chat screen drives it (a thread that keeps its context, chips, typed answers, a city switch).
import '@/i18n';

import type { Understanding } from '@/lib/ai/protocol';

import { activeCity } from '../cities';
import { GREET_CHIPS, type ConvoCase, type ConvoTurn } from '../eval/convoCases';
import { eveningOf, playConversation, type ConvoAi } from '../eval/convoRun';
import { scoreCase } from '../eval/convoScore';

const search = (over: Partial<Extract<Understanding, { kind: 'search' }>> = {}): Understanding => ({
  kind: 'search',
  district: null,
  cat: null,
  dish: null,
  place: null,
  food: true,
  requireParking: false,
  appleQuery: null,
  nearMe: true,
  dishServes: null,
  ...over,
});

type Calls = { understand: string[]; history: number[]; reply: string[] };
function fakeAi(
  read: (text: string) => Understanding | null,
  wording: (kind: string) => string | null = () => null,
): { ai: ConvoAi; calls: Calls } {
  const calls: Calls = { understand: [], history: [], reply: [] };
  const ai: ConvoAi = {
    understand: async (req) => {
      calls.understand.push(req.text);
      calls.history.push(req.history.length);
      return read(req.text);
    },
    pick: async () => null,
    pickPark: async () => null,
    plan: async () => null,
    reply: async (req) => {
      calls.reply.push(req.kind);
      return wording(req.kind);
    },
  };
  return { ai, calls };
}

const say = (text: string, expect: ConvoTurn['expect'], city?: 'ankara'): ConvoTurn => ({
  input: { type: 'say', text, ...(city ? { city } : {}) },
  expect,
});
const make = (name: string, turns: ConvoTurn[], city: ConvoCase['city'] = 'izmir'): ConvoCase => ({
  name: `choice: ${name}`,
  category: 'choice',
  city,
  section: 'food',
  hour: 13,
  turns,
});

describe('playConversation', () => {
  it('plays a greeting: the router, the AI wording and both chips', async () => {
    const { ai, calls } = fakeAi(
      () => ({ kind: 'chat', reply: 'Selam!', action: 'none' }),
      () => 'Selam! Otopark mu yemek mi bakıyorsun?',
    );
    const c = make('hello', [
      say('selam', { kind: 'greeting', chips: GREET_CHIPS, cards: 'none' }),
    ]);
    const t = await playConversation(c, ai);
    expect(t.infra).toBe(false);
    const obs = t.turns[0]!;
    expect(obs.understood?.kind).toBe('chat');
    expect(obs.text).toBe('Selam! Otopark mu yemek mi bakıyorsun?');
    expect(obs.actions.map((a) => a.label)).toEqual(GREET_CHIPS);
    expect(obs.wordings).toHaveLength(1);
    expect(obs.wordings[0]).toMatchObject({ kind: 'greeting', shown: true, late: false });
    expect(obs.wordings[0]!.accepted).toBe(obs.text);
    expect(calls.reply).toEqual(['greeting']);
    expect(scoreCase(c, t.turns).ok).toBe(true);
  });

  it('asks a broad question, then a typed answer works like its chip with no router call', async () => {
    const { ai, calls } = fakeAi(() => search({ wishes: ['protein'] } as never));
    const c = make('protein', [
      say('kaslıyım', {
        kind: 'choice',
        ask: ['protein', 'healthy'],
        hepsi: true,
        chipsMin: 2,
        cards: 'none',
        nearMe: true,
      }),
      {
        input: { type: 'answer', text: 'hepsi' },
        expect: { kind: 'food', member: 'all', cards: 'some', note: true },
      },
    ]);
    const t = await playConversation(c, ai);
    expect(t.turns[0]!.ctx.ask).toBe('protein');
    expect(t.turns[0]!.cards).toHaveLength(0);
    expect(t.turns[1]!.routerCalls).toBe(0);
    expect(t.turns[1]!.cards.length).toBeGreaterThan(0);
    expect(t.turns[1]!.text).toMatch(/verimiz yok/);
    expect(calls.understand).toEqual(['kaslıyım']);
    const scored = scoreCase(c, t.turns);
    expect(scored.scores.map((s) => s.ok)).toEqual([true, true]);
  });

  it('taps the nth kind chip and carries the history to the router', async () => {
    const { ai, calls } = fakeAi((text) =>
      text === 'tatlı' ? search({ cat: 'dessert' }) : search({ cat: 'dessert', dish: text }),
    );
    const c = make('tatlı', [
      say('tatlı', { kind: 'food', cat: ['dessert'], cards: 'some', chipsMin: 2, hepsi: false }),
      { input: { type: 'tap', text: '@2' }, expect: { kind: 'food', cards: 'some', hepsi: true } },
      say('daha yakın bir şey', { kind: 'food' }),
    ]);
    const t = await playConversation(c, ai);
    const first = t.turns[0]!;
    const kinds = first.actions.map((a) => a.label).filter((l) => l !== 'Başka yemek');
    const second = t.turns[1]!;
    // The tap named a chip the reply really had, and the user sees its label.
    expect(first.actions.map((a) => a.label)).toContain(second.input);
    expect(kinds).toContain(second.input);
    expect(second.tapMissing).toBe(false);
    expect(second.routerCalls).toBe(0);
    // Turn 3 is typed: the router gets the earlier turns (user and bot) as history.
    expect(calls.history).toEqual([0, 4]);
  });

  it('reports a tap on a chip that is not there, and types its label instead', async () => {
    const { ai } = fakeAi(() => search({ district: 'Bornova', dish: 'köfte' }));
    const c = make('missing chip', [
      say('bornovada köfte', { kind: 'food' }),
      { input: { type: 'tap', text: 'Yok Böyle Çip' }, expect: { kind: 'food' } },
    ]);
    const t = await playConversation(c, ai);
    expect(t.turns[1]!.tapMissing).toBe(true);
    expect(t.turns[1]!.routerCalls).toBe(1);
    expect(scoreCase(c, t.turns).ok).toBe(false);
  });

  it('starts the thread over in another city', async () => {
    const { ai, calls } = fakeAi((text) =>
      text.includes('çankaya')
        ? search({ district: 'Çankaya', dish: 'köfte', nearMe: false })
        : search({ district: 'Bornova', dish: 'köfte', nearMe: false }),
    );
    const c = make('switch', [
      say('bornovada köfte', { kind: 'food', place: ['Bornova'], cards: 'some' }),
      say('çankayada köfte', { kind: 'food', place: ['Çankaya'], cards: 'some' }, 'ankara'),
    ]);
    const t = await playConversation(c, ai);
    expect(t.turns[0]!.ctx.place).toBe('Bornova');
    expect(t.turns[1]!.ctx.place).toBe('Çankaya');
    expect(activeCity().id).toBe('ankara');
    // A new thread: the router sees no history of the old city.
    expect(calls.history).toEqual([0, 0]);
    expect(scoreCase(c, t.turns).scores.map((s) => s.understanding.ok)).toEqual([true, true]);
  });

  it('marks a turn void when an AI call fails for a reason that is not the model’s', async () => {
    const ai: ConvoAi = {
      understand: async () => {
        throw new Error('429 rate limit');
      },
      pick: async () => null,
      pickPark: async () => null,
      plan: async () => null,
      reply: async () => null,
    };
    const c = make('outage', [say('selam', { kind: 'greeting' })]);
    const t = await playConversation(c, ai);
    expect(t.infra).toBe(true);
    expect(t.turns[0]).toMatchObject({ infra: true, routerFailed: true, error: '429 rate limit' });
    expect(scoreCase(c, t.turns).ok).toBe(false);
  });

  it('counts a wording the model gave after the app’s wait as late, and one validateReply refuses as rejected', async () => {
    const { ai } = fakeAi(
      () => search({ district: 'Bornova', dish: 'köfte', nearMe: false }),
      () => 'Bornova’da 99 yer var, hepsi ucuz!',
    );
    const c = make('rejected', [say('bornovada köfte', { kind: 'food', place: ['Bornova'] })]);
    const t = await playConversation(c, ai);
    const w = t.turns[0]!.wordings[0]!;
    expect(w.raw).toBe('Bornova’da 99 yer var, hepsi ucuz!');
    expect(w.accepted).toBeNull();
    expect(w.shown).toBe(false);
    expect(t.turns[0]!.text).not.toContain('hepsi ucuz');
    // The template is shown: the turn is not failed for it.
    expect(scoreCase(c, t.turns).ok).toBe(true);
  });

  it('plays the same hour of the same Saturday every time', () => {
    expect(eveningOf(20).toISOString()).toBe('2026-10-17T17:00:00.000Z');
    expect(eveningOf(2).toISOString()).toBe('2026-10-16T23:00:00.000Z');
  });
});
