import '@/i18n';

import type { AiResult } from '@/lib/ai/client';
import type {
  ParkPickCandidate,
  PickCandidate,
  PlanCandidate,
  Understanding,
} from '@/lib/ai/protocol';
import { parkReasonHolds, pickReasonHolds } from '@/lib/ai/verify';

import {
  answer,
  emptyContext,
  pickFromCards,
  refine,
  type AssistantDeps,
  type ChatCard,
} from '../assistant';
import { hasWishWords, planWhenIn, wishesIn } from '../intent';
import { staticParkings } from '../staticParkings';

const parkings = staticParkings();
const baseDeps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings,
  t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k),
};

type Search = Extract<Understanding, { kind: 'search' }>;
const search = (over: Partial<Search> = {}): Understanding => ({
  kind: 'search',
  district: 'Bornova',
  cat: null,
  dish: null,
  place: null,
  food: true,
  requireParking: false,
  appleQuery: null,
  nearMe: false,
  dishServes: null,
  ...over,
});

const okU = (u: Understanding, remaining = 8): AiResult<Understanding> => ({
  ok: true,
  value: u,
  remaining,
});

type AiMock = {
  understand: jest.Mock;
  pick: jest.Mock;
  plan: jest.Mock;
  pickPark: jest.Mock;
};

/** A mocked AI layer; each job answers with `fns` or fails. Every call is recorded. */
function mockAi(fns: Partial<Record<keyof AiMock, (req: never) => unknown>> = {}) {
  const fail = async () => ({ ok: false, reason: 'error' });
  const ai: AiMock = {
    understand: jest.fn(fns.understand ?? fail),
    pick: jest.fn(fns.pick ?? fail),
    plan: jest.fn(fns.plan ?? fail),
    pickPark: jest.fn(fns.pickPark ?? fail),
  };
  const deps: AssistantDeps = {
    ...baseDeps,
    ai: { ...ai, quotaNotice: () => true } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { ai, deps };
}

const pickRes = (over: Record<string, unknown>, remaining = 8) => ({
  ok: true,
  value: { pick: 0, reasons: [], runnerUp: null, runnerUpWhy: null, tone: null, ...over },
  remaining,
});

/** Picks the closest candidate and says so; the truth is checked by the app. */
const closestPick =
  (extra: Record<string, unknown> = {}) =>
  async (req: { candidates: PickCandidate[] }) => {
    const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
    return pickRes({ pick: best.i, reasons: ['closest'], ...extra });
  };

const restaurantCards = (cards: ChatCard[]) => cards.filter((c) => c.kind === 'restaurant');

describe('wish and plan words', () => {
  it.each([
    'lahmacun',
    'Konak otopark',
    "Bornova'da köfteci",
    'balık',
    'Alsancak kahvaltı',
    'yakınımda otopark',
    "Konak'ta ücretsiz otopark",
    'metroya yakın otopark',
    'en iyi etçi',
    'akşam yemeği',
    'öğle yemeği',
    'sakız dondurma',
  ])('"%s" never reaches the AI because of a wish word', (q) => {
    expect(hasWishWords(q)).toBe(false);
  });

  it.each([
    ["Bornova'da romantik bir yer", 'romantic'],
    ['ucuz bir yer', 'cheap'],
    ['aileyle gideceğiz', 'family'],
    ['çocuklarla gidelim', 'kids'],
    ['gece geç saate kadar açık', 'late'],
    ['bahçeli bir yer', 'outdoor'],
    ['açık hava olsun', 'outdoor'],
    ['sakin bir yer', 'quiet'],
    ['kapalı otopark', 'covered'],
    ['24 saat açık otopark', 'nonstop'],
    ['güvenli otopark', 'safe'],
    ['engelli otoparkı', 'disabled'],
    ['gece boyu otopark', 'overnight'],
  ] as const)('"%s" carries the wish %s', (q, wish) => {
    expect(wishesIn(q)).toContain(wish);
  });

  it.each([
    ['önce park sonra yemek', 'now'],
    ["akşam 8'de yemek", 'tonight'],
    ['bu akşam nerede yesek', 'tonight'],
    ['öğle 1de yemek', 'lunch'],
    ['öğleden sonra Alsancak', 'later_today'],
    ['akşam romantik bir yer', null],
    ['akşam yemeği', null],
  ] as const)('"%s" is a plan for %s', (q, when) => {
    expect(planWhenIn(q)).toBe(when);
  });
});

describe('plain searches: the router first, the rules when it gives nothing', () => {
  it.each(['lahmacun', "Bornova'da köfteci", 'Konak otopark'])(
    '"%s" asks the router once; a failed router leaves the rule results and asks nothing more',
    async (q) => {
      const { ai, deps } = mockAi();
      const r = await answer(q, emptyContext(q.includes('otopark') ? 'park' : 'food'), deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(ai.understand).toHaveBeenCalledTimes(1);
      expect(ai.pick).not.toHaveBeenCalled();
      expect(ai.plan).not.toHaveBeenCalled();
      expect(ai.pickPark).not.toHaveBeenCalled();
    },
  );

  it.each(['lahmacun', "Bornova'da köfteci", 'Konak otopark'])(
    '"%s" never calls the AI without the AI layer',
    async (q) => {
      const r = await answer(q, emptyContext(q.includes('otopark') ? 'park' : 'food'), baseDeps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
    },
  );

  it('offers the pick chip under a list with two or more cards, only with the AI layer', async () => {
    const { deps } = mockAi();
    const r = await answer('lahmacun', emptyContext('food'), deps);
    expect(r.reply.actions.some((a) => a.kind === 'pick')).toBe(true);
    const off = await answer('lahmacun', emptyContext('food'), baseDeps);
    expect(off.reply.actions.some((a) => a.kind === 'pick')).toBe(false);
    const park = await answer('Konak otopark', emptyContext('park'), deps);
    expect(park.reply.actions.some((a) => a.kind === 'pick')).toBe(true);
  });

  it('does not use the removed automatic narrate (a pick/plan-less layer is fine)', async () => {
    const understand = jest.fn(async () => ({ ok: false as const, reason: 'error' as const }));
    const r = await answer('lahmacun', emptyContext('food'), {
      ...baseDeps,
      ai: { understand, quotaNotice: () => true },
    });
    expect(understand).toHaveBeenCalledTimes(1);
    expect(r.reply.sparkle).toBeFalsy();
    expect(r.reply.actions.some((a) => a.kind === 'pick')).toBe(false);
  });
});

describe('a wish the rules cannot use: understand, then pick', () => {
  const text = "Bornova'da romantik bir yer";
  const understand = async () => okU(search({ wishes: ['romantic'] }));

  it('calls understand once, then pick once; the reply is templates only', async () => {
    const { ai, deps } = mockAi({ understand, pick: closestPick() });
    const r = await answer(text, emptyContext('park'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(ai.pick).toHaveBeenCalledTimes(1);
    const req = ai.pick.mock.calls[0]![0] as { text: string; candidates: PickCandidate[] };
    expect(req.text).toBe(text);
    // Facts plus the public name and type (to judge fit); never contact details or addresses.
    for (const c of req.candidates) {
      expect(typeof c.name).toBe('string');
      for (const k of ['phone', 'address', 'website', 'instagram', 'id']) {
        expect(Object.keys(c)).not.toContain(k);
      }
    }
    const cards = restaurantCards(r.reply.cards);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0]).toMatchObject({ picked: true });
    expect(r.reply.sparkle).toBe(true);
    expect(r.reply.text).toContain('chat.pickLine');
    expect(r.reply.text).toContain(cards[0]!.name);
    expect(r.reply.text).toContain('chat.why.closest');
    // The honest note: no data on ambiance, said by the app.
    expect(r.reply.text).toContain('chat.noInfoAi');
    expect(r.reply.text).toMatch(/chat\.noInfo_ambiance/i);
    expect(r.ctx.wishes).toEqual(['romantic']);
  });

  it('drops a lying reason but keeps the true one', async () => {
    const { deps } = mockAi({
      understand,
      pick: closestPick({ reasons: ['closest', 'free_parking', 'outdoor', 'open_now'] }),
    });
    const r = await answer(text, emptyContext('park'), deps);
    expect(r.reply.text).toContain('chat.why.closest');
    expect(r.reply.text).not.toContain('chat.why.free_parking');
    expect(r.reply.text).not.toContain('chat.why.outdoor');
    expect(r.reply.text).not.toContain('chat.why.open_now');
  });

  it('falls back to the plain rule reply when every reason is false', async () => {
    const plain = await answer(text, emptyContext('park'), mockAi({ understand }).deps);
    const { deps } = mockAi({
      understand,
      pick: async () => pickRes({ pick: 1, reasons: ['free_parking', 'outdoor', 'dish_named'] }),
    });
    const r = await answer(text, emptyContext('park'), deps);
    expect(r.reply.cards.map((c) => c.id)).toEqual(plain.reply.cards.map((c) => c.id));
    expect(restaurantCards(r.reply.cards).some((c) => 'picked' in c && c.picked)).toBe(false);
    expect(r.reply.text).not.toContain('chat.pickLine');
    // No AI claim, so the note says how the app ordered, not how the AI chose.
    expect(r.reply.text).toContain('chat.noInfoRule');
    expect(r.reply.text).not.toContain('chat.noInfoAi');
    // The AI understood the search (the marker), even though its pick was not used.
    expect(r.reply.sparkle).toBe(true);
  });

  it('ignores a pick that is out of range or a failure', async () => {
    for (const pick of [
      async () => pickRes({ pick: 99, reasons: ['closest'] }),
      async () => ({ ok: false, reason: 'error' }),
    ]) {
      const { deps } = mockAi({ understand, pick });
      const r = await answer(text, emptyContext('park'), deps);
      expect(r.reply.text).not.toContain('chat.pickLine');
      expect(r.reply.cards.length).toBeGreaterThan(0);
    }
  });

  it('puts a runner-up only when its reason is true and it differs from the pick', async () => {
    const pick = async (req: { candidates: PickCandidate[] }) => {
      const sorted = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin);
      return pickRes({
        pick: sorted[0]!.i,
        reasons: ['closest'],
        runnerUp: sorted[1]!.i,
        runnerUpWhy: pickReasonHolds('outdoor', sorted[1]!, req.candidates)
          ? 'outdoor'
          : 'free_parking',
      });
    };
    const { deps } = mockAi({ understand, pick });
    const r = await answer(text, emptyContext('park'), deps);
    expect(r.reply.text).not.toContain('chat.pickRunner');
    const same = mockAi({
      understand,
      pick: async () =>
        pickRes({ pick: 0, reasons: ['closest'], runnerUp: 0, runnerUpWhy: 'closest' }),
    });
    const r2 = await answer(text, emptyContext('park'), same.deps);
    expect(r2.reply.text).not.toContain('chat.pickRunner');
  });

  it('shows a valid tone above everything and drops a tone that makes a claim', async () => {
    const good = mockAi({ understand, pick: closestPick({ tone: 'Güzel bir akşam dilerim!' }) });
    const a = await answer(text, emptyContext('park'), good.deps);
    expect(a.reply.text.split('\n')[0]).toBe('Güzel bir akşam dilerim!');
    const plainCards = (await answer(text, emptyContext('park'), mockAi({ understand }).deps)).reply
      .cards;
    const cardName = plainCards.map((c) => c.name).find((n) => /^[\p{L} ]+$/u.test(n))!;
    for (const tone of [
      'Otopark ücretsiz!',
      'Burası çok sakin',
      '3 dakikada orada',
      `${cardName} çok güzel`,
    ]) {
      const bad = mockAi({ understand, pick: closestPick({ tone }) });
      const b = await answer(text, emptyContext('park'), bad.deps);
      expect(b.reply.text).not.toContain(tone);
      expect(b.reply.text).toContain('chat.pickLine');
    }
  });

  it('shows an understand tone and a dish note only when they pass', async () => {
    const u = (tone: string | null, dishNote: string | null) => async () =>
      okU(search({ wishes: ['romantic'], dish: 'kibbe', tone, dishNote }));
    const good = mockAi({
      understand: u(
        'Yıldönümünüz kutlu olsun!',
        'Kibbe, bulgur ve kıymayla yapılan bir Orta Doğu yemeğidir.',
      ),
    });
    const a = await answer("Bornova'da romantik kibbe", emptyContext('food'), good.deps);
    expect(a.reply.text).toContain('Yıldönümünüz kutlu olsun!');
    expect(a.reply.text).toContain('bir Orta Doğu yemeğidir');
    const bad = mockAi({ understand: u('Güvenli bir yer', 'En lezzetli kibbe burada') });
    const b = await answer("Bornova'da romantik kibbe", emptyContext('food'), bad.deps);
    expect(b.reply.text).not.toContain('Güvenli');
    expect(b.reply.text).not.toContain('lezzetli kibbe');
  });

  it('works with the AI off: wishes get the honest note and the rule results', async () => {
    const r = await answer(text, emptyContext('food'), baseDeps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.text).toContain('chat.noInfoRule');
    expect(r.reply.text).toMatch(/chat\.noInfo_ambiance/i);
    expect(r.reply.sparkle).toBeFalsy();
  });

  it('with the daily uses gone: the notice, the note and the rule results, no pick', async () => {
    const { ai, deps } = mockAi({ understand: async () => ({ ok: false, reason: 'quota' }) });
    const r = await answer(text, emptyContext('food'), deps);
    expect(r.reply.notice).toBe('chat.sparkleOut');
    expect(r.reply.text).toContain('chat.noInfoRule');
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(ai.pick).not.toHaveBeenCalled();
  });

  it('says which wishes are unmappable, once each', async () => {
    const r = await answer("Bornova'da ucuz romantik bir yer", emptyContext('food'), baseDeps);
    expect(r.reply.text).toMatch(/chat\.noInfo_price/i);
    expect(r.reply.text).toMatch(/chat\.noInfo_ambiance/i);
    expect(r.reply.text.match(/chat\.noInfo_ambiance/gi)).toHaveLength(1);
  });
});

describe('wishes that map to data we have', () => {
  it('"late" and "outdoor" reorder with real fields and say what was found', async () => {
    const r = await answer("Bornova'da gece açık bahçeli bir yer", emptyContext('food'), baseDeps);
    expect(r.ctx.wishes).toEqual(expect.arrayContaining(['late', 'outdoor']));
    expect(r.reply.text).toMatch(/chat\.wishLate(None)?/);
    expect(r.reply.text).toMatch(/chat\.wishOutdoor(None)?/);
    // No claim without a match: "None" is said when no shown card has the field.
    const cards = restaurantCards(r.reply.cards);
    const anyOutdoor = cards.some((c) => c.kind === 'restaurant' && c.narr?.outdoor === true);
    expect(r.reply.text.includes('chat.wishOutdoorNone')).toBe(!anyOutdoor);
    const anyLate = cards.some((c) => c.kind === 'restaurant' && c.narr?.closesLate);
    expect(r.reply.text.includes('chat.wishLateNone')).toBe(!anyLate);
    if (anyOutdoor) expect(cards[0]).toMatchObject({ narr: { outdoor: true } });
  });

  it('family / group prefer a car park within 300 m and claim nothing more', async () => {
    const r = await answer("Bornova'da çocuklarla bir yer", emptyContext('food'), baseDeps);
    expect(r.reply.text).toMatch(/chat\.wishParking(None)?/);
    expect(r.reply.text).toMatch(/chat\.noInfo_kids/i);
    const cards = restaurantCards(r.reply.cards);
    const near = cards.map((c) =>
      c.kind === 'restaurant' && c.parkingM != null && c.parkingM <= 300 ? 1 : 0,
    );
    // Cards with a car park within 300 m come before those without.
    expect([...near].sort((a, b) => b - a)).toEqual(near);
  });

  it('"quick" sorts by distance', async () => {
    const r = await answer("Bornova'da çabuk bir yer", emptyContext('food'), baseDeps);
    expect(r.ctx.sort).toBe('distance');
  });
});

describe('clarify (job 3)', () => {
  const vague = 'ailemle güzel bir yemek yiyelim';
  const ask =
    (ask: 'district' | 'dish' | 'party' | 'time' | 'duration', text: string | null) => async () =>
      okU(
        search({
          district: null,
          wishes: ['family'],
          clarify: { ask, text },
          cat: ask === 'dish' ? null : 'meat',
        }),
      );

  it('asks the question with the district chips from our own data', async () => {
    const { ai, deps } = mockAi({ understand: ask('district', 'Hangi semtte yemek istersiniz?') });
    const r = await answer(vague, emptyContext('food'), deps);
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.text).toBe('Hangi semtte yemek istersiniz?');
    const labels = r.reply.actions.map((a) => a.label);
    expect(labels).toHaveLength(4);
    expect(labels[3]).toBe('chat.clarifyNear');
    expect(ai.pick).not.toHaveBeenCalled();
    // A chip tap goes through refine: results, and no AI call.
    const tap = r.reply.actions[0]!;
    expect(tap.kind).toBe('refine');
    const callsBefore = ai.understand.mock.calls.length;
    const res = await refine(r.ctx, (tap as { patch: object }).patch, deps);
    expect(res.reply.cards.length).toBeGreaterThan(0);
    expect(res.ctx.place?.label).toBe(labels[0]);
    expect(ai.understand.mock.calls.length).toBe(callsBefore);
    expect(ai.pick).not.toHaveBeenCalled();
  });

  it('uses the template when the wording fails validation', async () => {
    for (const text of ['Konak otopark ücretsiz mi?', 'Saat kaçta 3 kişi?', null]) {
      const { deps } = mockAi({ understand: ask('district', text) });
      const r = await answer(vague, emptyContext('food'), deps);
      expect(r.reply.text).toBe('chat.ask_district');
    }
  });

  it('offers category, party and time chips', async () => {
    const dish = await answer(
      vague,
      emptyContext('food'),
      mockAi({ understand: ask('dish', null) }).deps,
    );
    expect(dish.reply.actions.length).toBeGreaterThanOrEqual(5);
    const party = await answer(
      vague,
      emptyContext('food'),
      mockAi({ understand: ask('party', null) }).deps,
    );
    expect(party.reply.actions.map((a) => a.label)).toEqual([
      'chat.party_1',
      'chat.party_2',
      'chat.party_3',
    ]);
    const time = await answer(
      vague,
      emptyContext('food'),
      mockAi({ understand: ask('time', null) }).deps,
    );
    expect(time.reply.actions.map((a) => a.label)).toEqual([
      'chat.timeNow',
      'chat.timeLunch',
      'chat.timeTonight',
    ]);
  });

  it('a time chip prefers places open then, saying only what the data shows', async () => {
    const { deps } = mockAi({ understand: ask('time', null) });
    const r = await answer(vague, emptyContext('food'), deps);
    const lunch = r.reply.actions.find((a) => a.label === 'chat.timeLunch')!;
    const res = await refine(r.ctx, (lunch as { patch: object }).patch, deps);
    expect(res.reply.text).toMatch(/chat\.when(Prefer|None)/);
  });

  it('does not ask for what the rules already know', async () => {
    const { deps } = mockAi({
      understand: async () =>
        okU(search({ wishes: ['romantic'], clarify: { ask: 'district', text: null } })),
    });
    const r = await answer("Bornova'da romantik bir yer", emptyContext('food'), deps);
    expect(r.reply.text).not.toBe('chat.ask_district');
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('plan (job 4)', () => {
  const text = "Bornova'da önce park sonra yemek";

  /** The restaurant with the closest walk, its first car park, and a reason that is true. */
  const bestPlan = async (req: { candidates: PlanCandidate[] }) => {
    const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
    return {
      ok: true,
      value: {
        restaurant: best.i,
        parking: best.parkings[0]!.p,
        reasons: ['closest'],
        tone: null,
      },
      remaining: 8,
    };
  };

  // The plan needs the router to have answered with a search (same message id, one use).
  const routerSearch = async () => okU(search());

  it('renders the steps from our data and asks the plan once', async () => {
    const { ai, deps } = mockAi({ understand: routerSearch, plan: bestPlan });
    const r = await answer(text, emptyContext('food'), deps);
    expect(ai.plan).toHaveBeenCalledTimes(1);
    const req = ai.plan.mock.calls[0]![0] as { when: string; candidates: PlanCandidate[] };
    expect(req.when).toBe('now');
    expect(req.candidates.length).toBeLessThanOrEqual(5);
    for (const c of req.candidates) expect(c.parkings.length).toBeLessThanOrEqual(3);
    const plan = r.reply.plan!;
    expect(plan).toBeDefined();
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]).toContain(plan.dest.name);
    expect(plan.steps[1]).toMatch(/^chat\.planWalk/);
    const names = restaurantCards(r.reply.cards).map((c) => c.name);
    expect(names.some((n) => plan.steps[2]!.includes(n))).toBe(true);
    expect(plan.why).toContain('chat.why.closest');
    expect(plan.dest).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(r.reply.text).toContain('chat.planIntro');
    expect(r.reply.sparkle).toBe(true);
  });

  it('shows no plan when the car park does not belong to the restaurant', async () => {
    const { deps } = mockAi({
      understand: routerSearch,
      plan: async (req: { candidates: PlanCandidate[] }) => {
        const a = req.candidates[0]!;
        const other = req.candidates[1]!;
        return {
          ok: true,
          value: {
            restaurant: a.i,
            parking: other.parkings[0]!.p,
            reasons: ['closest'],
            tone: null,
          },
          remaining: 8,
        };
      },
    });
    const r = await answer(text, emptyContext('food'), deps);
    expect(r.reply.plan).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('shows no plan for an out-of-range restaurant, a lying reason, a failure or no AI', async () => {
    for (const plan of [
      async () => ({
        ok: true,
        value: { restaurant: 9, parking: 0, reasons: ['closest'], tone: null },
        remaining: 8,
      }),
      async () => ({
        ok: true,
        value: {
          restaurant: 0,
          parking: 0,
          reasons: ['dish_named', 'most_free_spots'],
          tone: null,
        },
        remaining: 8,
      }),
      async () => ({ ok: false, reason: 'error' }),
    ]) {
      const { deps } = mockAi({ understand: routerSearch, plan });
      const r = await answer(text, emptyContext('food'), deps);
      expect(r.reply.plan).toBeUndefined();
      expect(r.reply.cards.length).toBeGreaterThan(0);
    }
    const off = await answer(text, emptyContext('food'), baseDeps);
    expect(off.reply.plan).toBeUndefined();
  });

  it('a later time uses the opening hours at that time and sends no free-space counts', async () => {
    const { ai, deps } = mockAi({ understand: routerSearch, plan: bestPlan });
    await answer("Bornova'da akşam 8'de yemek", emptyContext('food'), {
      ...deps,
      now: new Date('2026-10-12T09:00:00Z'),
    });
    const req = ai.plan.mock.calls[0]![0] as { when: string; candidates: PlanCandidate[] };
    expect(req.when).toBe('tonight');
    for (const c of req.candidates) {
      expect(c.openState).not.toBe('closed');
      for (const p of c.parkings) expect(p.freeSpots).toBeNull();
    }
  });

  it('with the daily uses gone: the notice and the normal results', async () => {
    const { deps } = mockAi({
      understand: routerSearch,
      plan: async () => ({ ok: false, reason: 'quota' }),
    });
    const r = await answer(text, emptyContext('food'), deps);
    expect(r.reply.notice).toBe('chat.sparkleOut');
    expect(r.reply.plan).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('the "✨ Yerim seçsin" chip', () => {
  it('picks among the shown cards and puts the choice first', async () => {
    const { ai, deps } = mockAi({ pick: closestPick() });
    const first = await answer('Bornova köfteci', emptyContext('food'), deps);
    const chip = first.reply.actions.find((a) => a.kind === 'pick');
    if (chip?.kind !== 'pick') throw new Error('no chip');
    expect(ai.pick).not.toHaveBeenCalled();
    const r = await pickFromCards(chip.cards, chip.query, first.ctx, deps);
    expect(ai.pick).toHaveBeenCalledTimes(1);
    expect(r.reply.cards[0]).toMatchObject({ picked: true });
    expect(r.reply.cards).toHaveLength(chip.cards.length);
    expect(r.reply.text).toContain('chat.pickLine');
    expect(ai.pick.mock.calls[0]![0].text).toBe('Bornova köfteci');
  });

  it('says honestly that the daily uses are gone and leaves the list alone', async () => {
    const { deps } = mockAi({ pick: async () => ({ ok: false, reason: 'quota' }) });
    const first = await answer('Bornova köfteci', emptyContext('food'), deps);
    const chip = first.reply.actions.find((a) => a.kind === 'pick');
    if (chip?.kind !== 'pick') throw new Error('no chip');
    const r = await pickFromCards(chip.cards, chip.query, first.ctx, deps);
    expect(r.reply.notice).toBe('chat.sparkleOut');
    expect(r.reply.text).toBe('chat.pickUnavailable');
    expect(r.reply.cards).toEqual([]);
  });
});

describe('car parks', () => {
  const parkText = "Konak'ta kapalı otopark";

  it('maps covered / free / nonstop / rail / disabled to fields we hold and says what was found', async () => {
    const r = await answer(parkText, emptyContext('park'), baseDeps);
    expect(r.ctx.wishes).toContain('covered');
    expect(r.reply.text).toMatch(/chat\.parkWish\.covered(None)?/);
    const covered = r.reply.cards.filter((c) => c.kind === 'parking');
    const real = parkings.filter((p) => p.isIndoor === true);
    const shownCovered = covered.some((c) => real.some((p) => p.id === c.id));
    expect(r.reply.text.includes('chat.parkWish.coveredNone')).toBe(!shownCovered);
    if (shownCovered) expect(real.some((p) => p.id === covered[0]!.id)).toBe(true);
  });

  it('unmappable wishes (safe, big vehicle, motorcycle) get the honest note, without the AI', async () => {
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), baseDeps);
    expect(r.reply.text).toContain('chat.noInfoParkRule');
    expect(r.reply.text).toMatch(/chat\.noInfo_security/i);
  });

  const parkU =
    (over: Partial<Search> = {}) =>
    async () =>
      okU(search({ district: 'Konak', food: false, requireParking: false, ...over }));

  const parkPick =
    (extra: Record<string, unknown> = {}) =>
    async (req: { candidates: ParkPickCandidate[] }) => {
      const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
      return pickRes({ pick: best.i, reasons: ['closest'], ...extra });
    };

  it('a pick after the AI understood: verified reasons, a picked card, the note', async () => {
    const { ai, deps } = mockAi({
      understand: parkU({ wishes: ['safe'] }),
      pickPark: parkPick(),
    });
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(ai.pickPark).toHaveBeenCalledTimes(1);
    expect(r.reply.cards[0]).toMatchObject({ kind: 'parking', picked: true });
    expect(r.reply.text).toContain('chat.whyPark.closest');
    expect(r.reply.text).toContain('chat.noInfoParkAi');
  });

  it('drops a lying "free" for a paid or unknown car park', async () => {
    const { deps } = mockAi({
      understand: parkU({ wishes: ['safe'] }),
      pickPark: parkPick({ reasons: ['closest', 'free', 'covered', 'near_rail'] }),
    });
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), deps);
    const chosen = r.reply.cards[0]!;
    const p = parkings.find((x) => x.id === chosen.id)!;
    expect(r.reply.text.includes('chat.whyPark.free')).toBe(p.isPaid === false);
    expect(r.reply.text.includes('chat.whyPark.covered')).toBe(p.isIndoor === true);
    expect(r.reply.text).toContain('chat.whyPark.closest');
  });

  it('shows the plain list when every claim is false', async () => {
    const plain = await answer("Konak'ta güvenli otopark", emptyContext('park'), baseDeps);
    const { deps } = mockAi({
      understand: parkU({ wishes: ['safe'] }),
      pickPark: async (req: { candidates: ParkPickCandidate[] }) => {
        // Pick the farthest one and claim "closest": false.
        const far = [...req.candidates].sort((a, b) => b.walkMin - a.walkMin)[0]!;
        return pickRes({
          pick: far.i,
          reasons: ['closest', 'open_now'].filter(
            (c) => !parkReasonHolds(c as never, far, req.candidates),
          ),
        });
      },
    });
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), deps);
    expect(r.reply.cards.map((c) => c.id)).toEqual(plain.reply.cards.map((c) => c.id));
    expect(r.reply.text).not.toContain('chat.pickLine');
    expect(r.reply.text).toContain('chat.noInfoParkRule');
  });

  it('drops a "güvenli" tone line', async () => {
    const { deps } = mockAi({
      understand: parkU({ wishes: ['safe'], tone: 'Güvenli bir otopark bulalım' }),
      pickPark: parkPick({ tone: 'Güvenli bir seçim!' }),
    });
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), deps);
    expect(r.reply.text).not.toMatch(/Güvenli/);
    expect(r.reply.text).toContain('chat.pickLine');
  });

  it('a trip ("Konak\'a gideceğim, nereye bırakayım") becomes a two-step plan from our data', async () => {
    const { ai, deps } = mockAi({
      understand: parkU({ plan: { when: 'now' } }),
      pickPark: parkPick(),
    });
    const r = await answer("Konak'a gideceğim, nereye bırakayım", emptyContext('park'), deps);
    expect(ai.pickPark).toHaveBeenCalledTimes(1);
    const plan = r.reply.plan!;
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toContain(plan.dest.name);
    expect(plan.steps[1]).toMatch(/^chat\.planWalkTo/);
    expect(plan.steps[1]).toContain('Konak');
    const chosen = parkings.find((p) => p.name === plan.dest.name)!;
    expect(chosen.lat).toBe(plan.dest.lat);
  });

  it('clarifies duration with enum chips', async () => {
    const { deps } = mockAi({
      understand: parkU({
        wishes: ['safe'],
        district: null,
        clarify: { ask: 'duration', text: null },
      }),
    });
    const r = await answer('güvenli bir otopark lazım', emptyContext('park'), deps);
    expect(r.reply.text).toBe('chat.ask_duration');
    expect(r.reply.actions.map((a) => a.label)).toEqual([
      'chat.durShort',
      'chat.durFew',
      'chat.durNight',
    ]);
  });

  it('with the daily uses gone: the notice, the note and the plain list', async () => {
    const { deps } = mockAi({ understand: async () => ({ ok: false, reason: 'quota' }) });
    const r = await answer("Konak'ta güvenli otopark", emptyContext('park'), deps);
    expect(r.reply.notice).toBe('chat.sparkleOut');
    expect(r.reply.text).toContain('chat.noInfoParkRule');
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('the chip picks among car parks', async () => {
    const { deps } = mockAi({ pickPark: parkPick() });
    const first = await answer('Konak otopark', emptyContext('park'), deps);
    const chip = first.reply.actions.find((a) => a.kind === 'pick');
    if (chip?.kind !== 'pick') throw new Error('no chip');
    const r = await pickFromCards(chip.cards, chip.query, first.ctx, deps);
    expect(r.reply.cards[0]).toMatchObject({ kind: 'parking', picked: true });
    expect(r.reply.text).toContain('chat.pickLine');
  });
});

describe('the chat redirect of the router is checked like the tone', () => {
  const off = (reply: string) =>
    mockAi({ understand: async () => okU({ kind: 'chat', reply, action: 'none' }) }).deps;

  it('shows a short friendly redirect', async () => {
    const r = await answer(
      'galatasaray nasıl kazandı',
      emptyContext('park'),
      off('Maçı izleyemedim 😄 Ama yemek bulabilirim.'),
    );
    expect(r.reply.text).toBe('Maçı izleyemedim 😄 Ama yemek bulabilirim.');
    expect(r.reply.sparkle).toBe(true);
  });

  it.each([
    'Skor 3-1 bitti, ne yersin?',
    'Bornova tarafında yiyelim',
    'Ücretsiz bir yemek bulalım',
    'a'.repeat(141),
  ])('uses the template instead of "%s"', async (reply) => {
    const r = await answer('galatasaray nasıl kazandı', emptyContext('park'), off(reply));
    expect(r.reply.text.startsWith('chat.offTopic_')).toBe(true);
    expect(r.reply.sparkle).toBeFalsy();
    expect(r.reply.actions.length).toBeGreaterThan(0);
  });
});

describe('the AI judges which nearby places fit the request (name and type)', () => {
  const text = 'Ben vejetaryenim aga';
  const understand = async () => okU(search({ district: null, nearMe: true }));

  it('sees more places than are shown, and its fitting pick leads even from beyond the first five', async () => {
    let seen: PickCandidate[] = [];
    const pick = async (req: { candidates: PickCandidate[] }) => {
      seen = req.candidates;
      const last = req.candidates.length - 1;
      return pickRes({
        fit: [last, last - 1],
        noneFit: false,
        pick: last,
        reasons: ['fits_request'],
      });
    };
    const { deps } = mockAi({ understand, pick: pick as (req: never) => unknown });
    const r = await answer(text, emptyContext('food'), deps);
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((c) => typeof c.type === 'string' || c.type === undefined)).toBe(true);
    const cards = restaurantCards(r.reply.cards);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards[0]).toMatchObject({ picked: true, name: seen[seen.length - 1]!.name });
    expect(cards[1]!.name).toBe(seen[seen.length - 2]!.name);
    expect(r.reply.text).toContain('chat.why.fits_request');
  });

  it('a pick outside its own fit list is not shown', async () => {
    const pick = async () => pickRes({ fit: [1], noneFit: false, pick: 0, reasons: ['closest'] });
    const { deps } = mockAi({ understand, pick });
    const r = await answer(text, emptyContext('food'), deps);
    expect(restaurantCards(r.reply.cards).some((c) => c.picked)).toBe(false);
    expect(r.reply.text).not.toContain('chat.pickLine');
  });

  it('none fits: it says so honestly and picks nothing', async () => {
    const pick = async () => pickRes({ fit: [], noneFit: true, pick: 0, reasons: ['closest'] });
    const { deps } = mockAi({ understand, pick });
    const r = await answer(text, emptyContext('food'), deps);
    expect(r.reply.text).toContain('chat.pickNoneFit');
    expect(restaurantCards(r.reply.cards).some((c) => c.picked)).toBe(false);
    expect(restaurantCards(r.reply.cards).length).toBeGreaterThan(0);
  });

  it('the wider pool never leaves the assistant', async () => {
    const { deps } = mockAi({ understand, pick: closestPick() });
    const r = await answer(text, emptyContext('food'), deps);
    expect('pool' in r.reply).toBe(false);
  });
});
