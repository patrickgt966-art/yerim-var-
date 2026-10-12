import '@/i18n';

import type { AiResult } from '@/lib/ai/client';
import { ROUTER_TIMEOUT_MS, type Understanding } from '@/lib/ai/protocol';

import { answer, emptyContext, refine, type AssistantDeps } from '../assistant';
import { staticParkings } from '../staticParkings';

const baseDeps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings: staticParkings(),
  t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k),
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
    nearMe: true,
    dishServes: null,
    ...over,
  },
});
const chatU = (reply: string, action = 'none' as const): AiResult<Understanding> => ({
  ok: true,
  remaining: 8,
  value: { kind: 'chat', reply, action },
});
const fail = async () => ({ ok: false as const, reason: 'error' as const });

function mockAi(
  understand: (text: string) => Promise<unknown> = async () => ({ ok: false, reason: 'error' }),
  extra: { usesLeft?: () => number } = {},
) {
  const ai = {
    understand: jest.fn(understand),
    pick: jest.fn(fail),
    plan: jest.fn(fail),
    pickPark: jest.fn(fail),
  };
  const deps: AssistantDeps = {
    ...baseDeps,
    ai: { ...ai, ...extra, quotaNotice: () => true } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { ai, deps };
}

describe('the router: every message goes to Haiku first', () => {
  it.each([
    ['lahmacun', 'food'],
    ['İyi günler', 'park'],
    ['Hi could you recommend me some food', 'food'],
  ] as const)('"%s" calls the router exactly once', async (q, section) => {
    const { ai, deps } = mockAi();
    await answer(q, emptyContext(section), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect((ai.understand.mock.calls[0] as unknown[])[0]).toBe(q);
  });

  it('an English sentence becomes a food search near the user (the AI search is run by the rules)', async () => {
    const { ai, deps } = mockAi(async () => searchU({ food: true, nearMe: true }));
    const r = await answer('Hi could you recommend me some food', emptyContext('park'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(r.ctx.section).toBe('food');
    expect(r.ctx.place).toBeNull();
    const cards = r.reply.cards.filter((c) => c.kind === 'restaurant');
    expect(cards.length).toBeGreaterThan(0);
    // The same text without the router is no food search.
    const off = await answer('Hi could you recommend me some food', emptyContext('park'), baseDeps);
    expect(off.reply.cards.filter((c) => c.kind === 'restaurant')).toHaveLength(0);
  });

  it('a chat reply is shown when valid and replaced by the template when not', async () => {
    const good = mockAi(async () => chatU('Size de iyi günler! Ne arıyoruz?'));
    const a = await answer('İyi günler', emptyContext('park'), good.deps);
    expect(a.reply.text).toBe('Size de iyi günler! Ne arıyoruz?');
    expect(a.reply.sparkle).toBe(true);
    const bad = mockAi(async () => chatU('Yakında 3 ucuz yer var!'));
    const b = await answer('İyi günler', emptyContext('park'), bad.deps);
    expect(b.reply.text.startsWith('chat.greet.day_')).toBe(true);
    expect(bad.ai.understand).toHaveBeenCalledTimes(1);
  });

  it('a search whose rules read a different district keeps the rules district; the AI fills the rest', async () => {
    const { deps } = mockAi(async () => searchU({ district: 'Konak', cat: 'fish', nearMe: false }));
    const r = await answer("Bornova'da bir yer", emptyContext('food'), deps);
    expect(r.ctx.place?.label).toBe('Bornova');
    expect(r.ctx.cat).toBe('fish');
  });

  it('a pick after the router search reuses the same call path (one pick call, no second router call)', async () => {
    const { ai, deps } = mockAi(async () => searchU({ district: 'Bornova', nearMe: false }));
    ai.pick.mockImplementation((async (req: { candidates: { i: number; walkMin: number }[] }) => {
      const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
      return {
        ok: true,
        remaining: 7,
        value: {
          pick: best.i,
          reasons: ['closest'],
          runnerUp: null,
          runnerUpWhy: null,
          tone: null,
        },
      };
    }) as never);
    const r = await answer("Bornova'da köfteci", emptyContext('food'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(ai.pick).toHaveBeenCalledTimes(1);
    expect(r.reply.cards[0]).toMatchObject({ picked: true });
  });

  describe('when the router gives nothing, the rules answer without a second AI call', () => {
    afterEach(() => jest.useRealTimers());

    it('a router that never answers: after the timeout the rule results appear', async () => {
      jest.useFakeTimers();
      const { ai, deps } = mockAi(() => new Promise(() => {}));
      const p = answer('lahmacun', emptyContext('food'), deps);
      await jest.advanceTimersByTimeAsync(ROUTER_TIMEOUT_MS - 1);
      let settled = false;
      void p.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(2);
      const r = await p;
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(ai.understand).toHaveBeenCalledTimes(1);
      expect(ai.pick).not.toHaveBeenCalled();
    });

    it('unknown, an error and a thrown error all leave the rule path (one router call)', async () => {
      for (const understand of [
        async () => ({ ok: true, remaining: 8, value: { kind: 'unknown' } }),
        fail,
        async () => {
          throw new Error('boom');
        },
      ]) {
        const { ai, deps } = mockAi(understand);
        const r = await answer('lahmacun', emptyContext('food'), deps);
        expect(r.reply.cards.length).toBeGreaterThan(0);
        expect(ai.understand).toHaveBeenCalledTimes(1);
        expect(ai.pick).not.toHaveBeenCalled();
      }
    });

    it('a plan the rules found is not asked after a failed router', async () => {
      const { ai, deps } = mockAi();
      await answer("Bornova'da önce park sonra yemek", emptyContext('food'), deps);
      expect(ai.plan).not.toHaveBeenCalled();
    });
  });

  describe('no uses left', () => {
    it('0 left in the store: no AI call at all, the rule results and the honest notice', async () => {
      const { ai, deps } = mockAi(async () => searchU(), { usesLeft: () => 0 });
      const r = await answer('lahmacun', emptyContext('food'), deps);
      expect(ai.understand).not.toHaveBeenCalled();
      expect(ai.pick).not.toHaveBeenCalled();
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(r.reply.notice).toBe('chat.sparkleOut');
      // A greeting too: template, no call.
      const g = await answer('selam', emptyContext('food'), deps);
      expect(g.reply.text.startsWith('chat.hello_')).toBe(true);
      expect(ai.understand).not.toHaveBeenCalled();
    });

    it('a 429 from the router: the rule results, the notice, no pick or plan', async () => {
      const { ai, deps } = mockAi(async () => ({ ok: false, reason: 'quota' }));
      const r = await answer("Bornova'da önce park sonra yemek", emptyContext('food'), deps);
      expect(ai.understand).toHaveBeenCalledTimes(1);
      expect(ai.plan).not.toHaveBeenCalled();
      expect(ai.pick).not.toHaveBeenCalled();
      expect(r.reply.notice).toBe('chat.sparkleOut');
      expect(r.reply.cards.length).toBeGreaterThan(0);
    });
  });

  it('a filter chip (refine) never calls the AI', async () => {
    const { ai, deps } = mockAi(async () => searchU({ district: 'Bornova', nearMe: false }));
    const first = await answer('Bornova köfteci', emptyContext('food'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    const chip = first.reply.actions.find((a) => a.kind === 'refine');
    if (chip?.kind !== 'refine') throw new Error('no refine chip');
    const before = [ai.understand, ai.pick, ai.plan, ai.pickPark].map((f) => f.mock.calls.length);
    const r = await refine(first.ctx, chip.patch, deps);
    expect(r.reply.text).not.toBe('');
    expect([ai.understand, ai.pick, ai.plan, ai.pickPark].map((f) => f.mock.calls.length)).toEqual(
      before,
    );
  });
});
