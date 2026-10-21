import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import { FAR_WALK_MIN, type Understanding } from '@/lib/ai/protocol';
import { walkMinFromMeters } from '@/lib/ai/verify';

import { answer, emptyContext, pickFromCards, type AssistantDeps } from '../assistant';
import { activeCity, setActiveCity } from '../cities';
import { wishesIn } from '../intent';
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

/** An AI layer whose router answers the given readings one after the other. */
function routerSays(...readings: AiResult<Understanding>[]): AssistantDeps {
  const fail = async (): Promise<unknown> => ({ ok: false, reason: 'error' });
  let n = 0;
  return {
    ...baseDeps,
    ai: {
      understand: jest.fn(async () => readings[Math.min(n++, readings.length - 1)]!),
      reply: jest.fn(async () => null),
      pick: jest.fn(fail),
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
}

afterEach(() => setActiveCity('izmir'));

describe('1. a follow-up wish keeps the current dish', () => {
  it('"ucuz olsun" is a cheap wish the rules know', () => {
    expect(wishesIn('ucuz olsun').length).toBeGreaterThan(0);
  });

  it.each([
    ['döner', 'fast'],
    ['kebap', 'meat'],
  ] as const)(
    'konyaaltında %s -> ucuz olsun: results, not a choice question',
    async (dish, cat) => {
      setActiveCity('antalya');
      const deps = routerSays(
        searchU({ district: 'Konyaaltı', cat, dish: dish === 'kebap' ? null : dish }),
        searchU({
          district: 'Konyaaltı',
          cat,
          dish: dish === 'kebap' ? null : dish,
          wishes: ['cheap'],
        }),
      );
      const first = await answer(`konyaaltında ${dish}`, emptyContext('food'), deps);
      expect(first.reply.cards.length).toBeGreaterThan(0);
      const next = await answer('ucuz olsun', first.ctx, deps);
      expect(next.ctx.ask).toBeUndefined();
      expect(next.reply.cards.length).toBeGreaterThan(0);
      expect(next.ctx.cat).toBe(cat);
      expect(next.ctx.place?.label).toContain('Konyaaltı');
    },
  );

  it('a kind the router invented for a mood with no search before still goes', async () => {
    const deps = routerSays(searchU({ nearMe: true, wishes: ['quick'], cat: 'fast' }));
    const r = await answer('acelem var bi şey yiyeyim', emptyContext('food'), deps);
    expect(r.ctx.ask).toBe('quick');
  });
});

describe('4. a business name the router could not read is still looked up', () => {
  const unknown = (): AiResult<Understanding> => ({
    ok: true,
    remaining: 8,
    value: { kind: 'unknown' } as Understanding,
  });

  it.each([
    ['istanbul', 'New Season', 'New Season'],
    ['antalya', 'sesi beach event', 'SeSi Beach Event'],
  ])('%s: "%s" shows %s', async (city, text, name) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('food'), routerSays(unknown()));
    expect(r.reply.cards.map((c) => c.name)).toContain(name);
    expect(r.reply.text).not.toMatch(/anlayamad/i);
  });

  it('a text that is no name in the city is still "not understood"', async () => {
    setActiveCity('istanbul');
    const r = await answer('blorp zanzibar quux', emptyContext('food'), routerSays(unknown()));
    expect(r.reply.cards).toHaveLength(0);
  });
});

describe('5. a far list with no match says it once and never calls the places near', () => {
  const NEAR = /\ben yak[ıi]n|\byak[ıi]nda|hemen yan[ıi]nda|nearby|closest|nearest/i;
  const routed = () => searchU({ district: 'Çamlıdere', cat: 'fast', dish: 'kumpir' });

  /** A router that finds the kumpir search, and a pick that says no candidate fits. */
  function withNoneFitPick(wording: (() => string) | null = null): AssistantDeps {
    const deps = routerSays(routed());
    const ai = deps.ai as unknown as Record<string, jest.Mock>;
    ai.pick = jest.fn(async (...args: unknown[]) => ({
      ok: true,
      remaining: 5,
      value: {
        pick: 0,
        fit: [],
        noneFit: true,
        reasons: [],
        runnerUp: null,
        runnerUpWhy: null,
        tone: null,
      },
      args,
    }));
    if (wording) ai.reply = jest.fn(async () => wording());
    return deps;
  }

  it('template note: "benzer yerleri gösteriyorum", no "yakındaki"', async () => {
    setActiveCity('ankara');
    const r = await answer('çamlıdere kumpir nerde yenir', emptyContext('food'), withNoneFitPick());
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(walkMinFromMeters(r.reply.cards[0]!.distanceM)).toBeGreaterThan(FAR_WALK_MIN);
    expect(r.reply.text).toContain('Benzer yerleri gösteriyorum');
    expect(r.reply.text).not.toMatch(NEAR);
  });

  it('the pick that finds no fit adds no second "not found" line and no "en yakınları"', async () => {
    setActiveCity('ankara');
    const r = await answer('çamlıdere kumpir nerde yenir', emptyContext('food'), withNoneFitPick());
    expect(r.reply.text).not.toContain('göremedim');
    const pick = r.reply.actions.find((a) => a.kind === 'pick');
    expect(pick?.kind).toBe('pick');
    if (pick?.kind !== 'pick') return;
    const picked = await pickFromCards(pick.cards, pick.query, r.ctx, withNoneFitPick());
    expect(picked.reply.text).toContain('En az uzak olanları gösteriyorum');
    expect(picked.reply.text).not.toMatch(NEAR);
  });

  it('a wording that says "no candidate" next to the cards is dropped for the template', async () => {
    setActiveCity('ankara');
    const bad =
      'Kumpir için şu an uygun bir aday bulamadık, başka bir istekle tekrar deneyebilirsin.';
    const r = await answer(
      'çamlıdere kumpir nerde yenir',
      emptyContext('food'),
      withNoneFitPick(() => bad),
    );
    expect(r.reply.text).not.toContain('aday bulamadık');
    expect(r.reply.text.match(/emin olduğum yer yok|bulamad|göremedim/g)?.length ?? 0).toBeLessThan(
      2,
    );
  });
});
