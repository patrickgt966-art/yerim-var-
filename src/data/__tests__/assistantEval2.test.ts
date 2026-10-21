// Fixes from the 120-case conversation eval: a Yerim message that does not stack notes, the quick
// choice question for a mood the router guessed a category for, and name lookups with typos.
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import type { AiReplyFacts, AiReplyKind, PickCandidate, Understanding } from '@/lib/ai/protocol';
import { walkMinFromMeters } from '@/lib/ai/verify';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { activeCity, setActiveCity } from '../cities';
import { HEPSI } from '../eval/convoCases';
import { messageSentences } from '../eval/convoScore';
import { wishesIn } from '../intent';
import { fold } from '../search';
import { staticParkings } from '../staticParkings';

// eslint-disable-next-line import/no-named-as-default-member
const t: AssistantDeps['t'] = (k, o) => i18n.t(k, o) as string;
const baseDeps: AssistantDeps = {
  here: async () => activeCity().center,
  geocode: async () => null,
  parkings: staticParkings(),
  t,
};

type Search = Extract<Understanding, { kind: 'search' }>;
const searchU = (over: Partial<Search> = {}): AiResult<Understanding> => ({
  ok: true,
  remaining: 8,
  value: {
    kind: 'search',
    district: null,
    cat: null,
    dish: null,
    place: null,
    food: true,
    requireParking: false,
    appleQuery: null,
    nearMe: false,
    dishServes: null,
    wishes: [],
    partySize: null,
    clarify: null,
    plan: null,
    tone: null,
    dishNote: null,
    meaning: null,
    notCat: null,
    ...over,
  },
});

type ReplyReq = { userText: string; kind: AiReplyKind; facts: AiReplyFacts };

/** An AI layer with a fake router, a fake wording and (optionally) a pick of the closest place. */
function mockAi(
  routed: AiResult<Understanding>,
  wording: (req: ReplyReq) => string | null = () => null,
  withPick = false,
) {
  const fail = async (): Promise<unknown> => ({ ok: false, reason: 'error' });
  const reply = jest.fn(async (req: ReplyReq) => wording(req));
  const pick = jest.fn(
    withPick
      ? async (...args: unknown[]) => {
          const { candidates } = args[0] as { candidates: PickCandidate[] };
          const best = [...candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
          return {
            ok: true,
            remaining: 5,
            value: {
              pick: best.i,
              reasons: ['closest'],
              runnerUp: null,
              runnerUpWhy: null,
              tone: null,
            },
          };
        }
      : fail,
  );
  const deps: AssistantDeps = {
    ...baseDeps,
    ai: {
      understand: jest.fn(async () => routed),
      reply,
      pick,
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { reply, pick, deps };
}

/** The wording a model would give from the facts alone: where, what and how many. */
const counted = (req: ReplyReq) =>
  `${req.facts.where} için ${req.facts.what} ${req.facts.count} yer buldum.`;

afterEach(() => setActiveCity('izmir'));

const digitSentences = (text: string) =>
  text
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .filter((s) => /\d/.test(s));
/** A sentence that starts with a lowercase letter (a dish word that was not capitalised). */
const lowercaseStart = (text: string) => /(^|\n|[.!?]\s+)\p{Ll}/u.test(text);

describe('1. a Yerim message does not stack notes', () => {
  const nilufer = searchU({ district: 'Nilüfer', cat: 'meat', dish: 'köfte' });

  it('köfte (shown wording): the name-match note is told by the wording, not printed first', async () => {
    setActiveCity('bursa');
    const { reply, deps } = mockAi(nilufer, counted, true);
    const r = await answer("Nilüfer'de köfte", emptyContext('food'), deps);
    const sent = reply.mock.calls[0]![0] as ReplyReq;
    expect(sent.facts.count).toBeGreaterThan(0);
    expect(r.reply.text).toContain(counted(sent));
    expect(r.reply.text).not.toContain('Adında');
    expect(r.reply.text).not.toContain('geçen');
    // The wording and the pick line: two sentences, not five.
    expect(r.reply.text).toContain('Benim seçimim');
    expect(messageSentences(r.reply.text)).toBeLessThanOrEqual(4);
  });

  it('köfte (no AI): one sentence with the count, the note counts nothing', async () => {
    setActiveCity('bursa');
    const r = await answer("Nilüfer'de köfte", emptyContext('food'), baseDeps);
    expect(r.reply.text).toContain('Adında "köfte" geçen yerleri üste koydum.');
    expect(digitSentences(r.reply.text)).toHaveLength(1);
    expect(messageSentences(r.reply.text)).toBeLessThanOrEqual(3);
  });

  it('hamburger (looked wider, only likely): notes start in capitals, one count, the hedge stays unless the wording hedges', async () => {
    const routed = searchU({ district: 'Menderes', cat: 'fast', dish: 'hamburger' });
    const plain = await answer("Menderes'te hamburger", emptyContext('food'), baseDeps);
    expect(plain.reply.text).toContain(
      'Hamburger için yakında az yer var, biraz daha geniş baktım.',
    );
    expect(lowercaseStart(plain.reply.text)).toBe(false);
    expect(digitSentences(plain.reply.text)).toHaveLength(1);

    // A wording that says nothing about "probably": the honesty note stays, the widened note goes.
    const silent = mockAi(routed, counted);
    const a = await answer("Menderes'te hamburger", emptyContext('food'), silent.deps);
    const facts = (silent.reply.mock.calls[0]![0] as ReplyReq).facts;
    expect(facts.dishLikely).toBe(true);
    expect(facts.widened).toBe(true);
    expect(a.reply.text).toContain(counted(silent.reply.mock.calls[0]![0] as ReplyReq));
    expect(a.reply.text).not.toContain('biraz daha geniş baktım');
    expect(a.reply.text).toContain('adında yer yok');

    // A wording that hedges: everything the notes said is in it, the notes are gone.
    const hedged = mockAi(
      routed,
      (req) =>
        `${req.facts.where} için ${req.facts.what} ${req.facts.count} yer buldum, büyük ihtimalle hepsinde var.`,
    );
    const b = await answer("Menderes'te hamburger", emptyContext('food'), hedged.deps);
    expect(b.reply.text).toContain('büyük ihtimalle hepsinde var');
    expect(b.reply.text).not.toContain('adında yer yok');
    expect(b.reply.text).not.toContain('biraz daha geniş baktım');
    expect(messageSentences(b.reply.text)).toBeLessThanOrEqual(2);
  });

  it('a far first place keeps its far note in front of the wording, in capitals', async () => {
    const routed = searchU({ district: 'Bornova', cat: 'fast', dish: 'kumpir' });
    const { deps } = mockAi(routed, counted, true);
    const r = await answer('Bornova kumpir', emptyContext('food'), deps);
    const min = walkMinFromMeters(r.reply.cards[0]!.distanceM);
    expect(r.reply.text.split('\n')[0]).toMatch(/^Kumpir için geniş alanda baktım; ilk sıradaki/);
    expect(r.reply.text).toContain(`~${min} dk yürüme uzaklıkta`);
    expect(r.reply.text).not.toContain('Adında');
    expect(messageSentences(r.reply.text)).toBeLessThanOrEqual(4);
  });
});

describe('2. "acelem var bi şey yiyeyim" asks which quick food', () => {
  it('the rules read acele, vaktim yok and çabucak as the quick wish', () => {
    for (const text of [
      'acelem var bi şey yiyeyim',
      'vaktim yok bir şey yiyeyim',
      'çabucak bir şey',
    ]) {
      expect(wishesIn(text)).toContain('quick');
    }
  });

  it.each([
    ['no category, no wish', {}],
    ['a guessed category', { wishes: ['quick'] as Search['wishes'], cat: 'fast' as const }],
    ['a guessed dish', { dish: 'hızlı yemek' }],
    ['both', { wishes: ['quick'] as Search['wishes'], cat: 'fast' as const, dish: 'fast food' }],
  ])('router: %s -> the quick question with chips and Hepsi, no results', async (_name, over) => {
    const { deps } = mockAi(searchU({ nearMe: true, ...over }));
    const r = await answer('acelem var bi şey yiyeyim', emptyContext('food'), deps);
    expect(r.ctx.ask).toBe('quick');
    expect(r.reply.cards).toHaveLength(0);
    const labels = r.reply.actions.map((a) => a.label);
    expect(labels).toContain('Döner');
    expect(labels[labels.length - 1]).toBe(HEPSI);
  });

  it('a dish the user named stays: "acele döner" shows döner places', async () => {
    const { deps } = mockAi(
      searchU({ nearMe: true, wishes: ['quick'], cat: 'fast', dish: 'döner' }),
    );
    const r = await answer('acele döner', emptyContext('food'), deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('3. name lookups with typos', () => {
  it('"øzlem restoran nerede": ø is o, restoran and nerede are not the name, and the name ask has its own sentence', async () => {
    // A name nobody has: the sentence is about a name, built from the extracted words.
    setActiveCity('bursa');
    const { deps } = mockAi(searchU({ place: 'Øxyzlem Restoran' }));
    const r = await answer('øxyzlem restoran nerede', emptyContext('food'), deps);
    expect(r.reply.text).toContain('"Öxyzlem Restoran" adında bir yer bulamadım.');
    expect(r.reply.text).not.toContain('yapan');
    expect(r.reply.text).not.toContain('nerede');
    // A name the data has: the generic word is dropped and the places called so are found.
    setActiveCity('izmir');
    const found = await answer('øzlem restoran nerede', emptyContext('food'), baseDeps);
    expect(found.reply.cards.length).toBeGreaterThan(0);
    expect(found.reply.cards.every((c) => fold(c.name).startsWith('ozlem'))).toBe(true);
  });

  it('"parga balıık" finds Parga Balık', async () => {
    setActiveCity('istanbul');
    const r = await answer('parga balıık', emptyContext('food'), baseDeps);
    expect(r.reply.cards.map((c) => c.name)).toContain('Parga Balık');
    expect(r.reply.text).not.toContain('yemek mi');
  });

  it('"aklan unlu mamüllerri" finds Aklan Unlu Mamülleri', async () => {
    const r = await answer('aklan unlu mamüllerri', emptyContext('food'), baseDeps);
    expect(r.reply.cards.map((c) => c.name)).toContain('Aklan Unlu Mamülleri');
  });

  it('does not turn a dish or a category into a name', async () => {
    const dish = await answer('kahvaltı nerede', emptyContext('food'), baseDeps);
    expect(dish.ctx.cat).toBe('breakfast');
    const typo = await answer('lahmacn nerede', emptyContext('food'), baseDeps);
    expect(typo.reply.text).not.toContain('diye');
    // A known place stays the place, even when a restaurant's name starts almost like it.
    const square = await answer('konak meydanı', emptyContext('food'), baseDeps);
    expect(square.ctx.place?.label).toBe('Konak Meydanı');
    const where = await answer('kordon nerede', emptyContext('food'), baseDeps);
    expect(where.ctx.place?.label).toBe('Kordon');
  });
});

describe('4. the pick line and the cards tell the same walk', () => {
  it('the minutes in "Benim seçimim X: en yakın olanı (~N dk yürüme)" are the picked card\'s own', async () => {
    setActiveCity('bursa');
    const { deps } = mockAi(
      searchU({ district: 'Nilüfer', cat: 'meat', dish: 'köfte' }),
      counted,
      true,
    );
    const r = await answer("Nilüfer'de köfte", emptyContext('food'), deps);
    const picked = r.reply.cards.find((c) => c.kind === 'restaurant' && c.picked)!;
    const line = r.reply.text.split('\n').find((l) => l.startsWith('Benim seçimim'))!;
    expect(line).toContain(picked.name);
    expect(line).toContain(`~${walkMinFromMeters(picked.distanceM)} dk yürüme`);
  });
});
