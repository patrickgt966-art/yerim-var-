// A typed place name wins over a dish or category read (by the router or the rules), also with
// typing slips; dish, category and known-place texts stay searches.
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import type { AiReplyFacts, AiReplyKind, PickCandidate, Understanding } from '@/lib/ai/protocol';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { activeCity, setActiveCity } from '../cities';
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

const names = (r: Awaited<ReturnType<typeof answer>>) => r.reply.cards.map((c) => c.name);

describe('a place name typed with slips comes before a dish or category search', () => {
  it('"kardeş balıkçıılk" (doubled letter, router read a fish category) shows Kardeş Balıkçılık', async () => {
    setActiveCity('izmir');
    for (const deps of [
      baseDeps,
      mockAi(searchU({ cat: 'fish', dish: null })).deps,
      mockAi(searchU({ cat: 'fish', dish: 'balık' })).deps,
    ]) {
      const r = await answer('kardeş balıkçıılk', emptyContext('food'), deps);
      expect(names(r)[0]).toBe('Kardeş Balıkçılık');
    }
  });

  it('"aklan unlu mamüllerri" read as a börek dish search still shows Aklan Unlu Mamülleri first', async () => {
    setActiveCity('izmir');
    const { deps } = mockAi(searchU({ cat: 'lokanta', dish: 'börek' }));
    const r = await answer('aklan unlu mamüllerri', emptyContext('food'), deps);
    expect(names(r)[0]).toBe('Aklan Unlu Mamülleri');
  });

  it('"bursa kebap evi" read as a kebap search shows the place Bursa Kebap Evi', async () => {
    setActiveCity('bursa');
    const { deps } = mockAi(searchU({ cat: 'meat', dish: 'kebap' }));
    const r = await answer('bursa kebap evi', emptyContext('food'), deps);
    expect(names(r).length).toBeGreaterThan(0);
    expect(names(r).every((n) => fold(n).startsWith('bursa kebap evi'))).toBe(true);
  });

  it('negative controls stay searches: a dish, a category, a short generic name, a known place', async () => {
    setActiveCity('izmir');
    // "kebap evi" alone: the router read the dish, nothing before it makes it a name.
    const kebap = await answer(
      'kebap evi',
      emptyContext('food'),
      mockAi(searchU({ cat: 'meat', dish: 'kebap' })).deps,
    );
    expect(kebap.ctx.dish).toBe('kebap');
    expect(names(kebap)).not.toContain('Kebap Evi Hasan Usta');
    // "et lokantası": one word once the generic noun is dropped, a category search.
    const et = await answer(
      'et lokantası',
      emptyContext('food'),
      mockAi(searchU({ cat: 'meat' })).deps,
    );
    expect(et.ctx.cat).toBe('meat');
    expect(et.reply.text).not.toContain('diye');
    // A district / city then a dish is a dish ask in a place.
    const dish = await answer(
      'izmir köfte',
      emptyContext('food'),
      mockAi(searchU({ cat: 'meat', dish: 'köfte' })).deps,
    );
    expect(dish.ctx.dish).toMatch(/köfte/);
    expect(dish.reply.text).not.toContain('diye');
    // A known place stays the place.
    const square = await answer('konak meydanı', emptyContext('food'), baseDeps);
    expect(square.ctx.place?.label).toBe('Konak Meydanı');
  });
});
