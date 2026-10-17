import {
  FREE_DAILY,
  MAX_CANDIDATES,
  MAX_LABEL_CHARS,
  MAX_PICK_CANDIDATES,
  MAX_PLAN_PARKINGS,
  parkPickOutputSchema,
  pickOutputSchema,
  planOutputSchema,
  UnderstandingSchema,
} from '../../../../src/lib/ai/protocol';
import { validPick, validPlan } from '../quota';

const rest = (i: number, over: Record<string, unknown> = {}) => ({
  i,
  kind: 'restaurant',
  walkMin: 4,
  openState: 'unknown',
  closesLate: false,
  parkingM: 120,
  parkingFree: true,
  freeSpots: null,
  dishMatch: 'none',
  outdoor: null,
  ...over,
});

const park = (i: number, over: Record<string, unknown> = {}) => ({
  i,
  kind: 'parking',
  walkMin: 3,
  openState: 'open',
  nonstop: false,
  free: true,
  tariffKnown: false,
  covered: null,
  freeSpots: 7,
  nearRail: false,
  capacity: 100,
  ...over,
});

const base = { deviceId: 'd-1', messageId: 'm1', text: 'romantik bir yer' };

describe('shared quota constant', () => {
  it('is 10 a day', () => {
    expect(FREE_DAILY).toBe(10);
  });
});

describe('validPick', () => {
  it("keeps a restaurant's short name and type (to judge fit) and drops unknown fields", () => {
    const body = {
      ...base,
      candidates: [
        rest(0, { name: 'Mado', type: 'Tatlı, dondurma', phone: '+90 232 000 00 00' }),
        rest(1, { name: 'x'.repeat(MAX_LABEL_CHARS + 1), type: 7 }),
      ],
    };
    const v = validPick(body);
    expect(v?.candidates).toHaveLength(2);
    expect(v?.candidates[0]).toMatchObject({ name: 'Mado', type: 'Tatlı, dondurma' });
    expect(JSON.stringify(v)).not.toContain('+90');
    expect(Object.keys(v!.candidates[1]!)).not.toContain('name');
    expect(Object.keys(v!.candidates[1]!)).not.toContain('type');
  });

  it('takes up to 15 restaurants and 5 car parks; rejects none and a non-array', () => {
    const many = (n: number, f: (i: number) => object) => Array.from({ length: n }, (_, i) => f(i));
    expect(validPick({ ...base, candidates: many(MAX_PICK_CANDIDATES, rest) })).not.toBeNull();
    expect(validPick({ ...base, candidates: many(MAX_PICK_CANDIDATES + 1, rest) })).toBeNull();
    expect(validPick({ ...base, candidates: many(MAX_CANDIDATES + 1, (i) => park(i)) })).toBeNull();
    expect(validPick({ ...base, candidates: [] })).toBeNull();
    expect(validPick({ ...base, candidates: 'x' })).toBeNull();
  });

  it('rejects a bad index, enum, type or id', () => {
    expect(validPick({ ...base, candidates: [rest(1)] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0, { openState: 'maybe' })] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0, { dishMatch: 'yes' })] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0, { walkMin: -1 })] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0, { freeSpots: 1.5 })] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0, { closesLate: 'yes' })] })).toBeNull();
    expect(validPick({ ...base, deviceId: 'a b', candidates: [rest(0)] })).toBeNull();
  });

  it('rejects over-long text and mixed kinds', () => {
    expect(validPick({ ...base, text: 'a'.repeat(201), candidates: [rest(0)] })).toBeNull();
    expect(validPick({ ...base, candidates: [rest(0), park(1)] })).toBeNull();
  });

  it('accepts car park candidates', () => {
    const v = validPick({ ...base, candidates: [park(0), park(1)] });
    expect(v?.candidates.every((c) => c.kind === 'parking')).toBe(true);
    expect(validPick({ ...base, candidates: [park(0, { nearRail: 'yes' })] })).toBeNull();
    expect(validPick({ ...base, candidates: [park(0, { capacity: -3 })] })).toBeNull();
  });
});

const pk = (p: number, over: Record<string, unknown> = {}) => ({
  p,
  walkMin: 2,
  parkingFree: false,
  freeSpots: null,
  openState: 'open',
  ...over,
});
const planRest = (i: number, parkings: unknown[]) => {
  const { parkingM: _a, parkingFree: _b, freeSpots: _c, ...r } = rest(i);
  return { ...r, parkings };
};

describe('validPlan', () => {
  it('accepts restaurants with 1..3 car parks and global indices running 0,1,2...', () => {
    const v = validPlan({
      ...base,
      when: 'tonight',
      candidates: [planRest(0, [pk(0), pk(1)]), planRest(1, [pk(2)])],
    });
    expect(v?.candidates[1]?.parkings[0]?.p).toBe(2);
  });

  it('rejects too many car parks, none, or indices out of order', () => {
    const many = Array.from({ length: MAX_PLAN_PARKINGS + 1 }, (_, p) => pk(p));
    expect(validPlan({ ...base, when: 'now', candidates: [planRest(0, many)] })).toBeNull();
    expect(validPlan({ ...base, when: 'now', candidates: [planRest(0, [])] })).toBeNull();
    expect(validPlan({ ...base, when: 'now', candidates: [planRest(0, [pk(1)])] })).toBeNull();
    expect(
      validPlan({ ...base, when: 'now', candidates: [planRest(0, [pk(0)]), planRest(1, [pk(0)])] }),
    ).toBeNull();
  });

  it('rejects an unknown time, more than five restaurants and bad facts', () => {
    expect(validPlan({ ...base, when: 'tomorrow', candidates: [planRest(0, [pk(0)])] })).toBeNull();
    const six = Array.from({ length: 6 }, (_, i) => planRest(i, [pk(i)]));
    expect(validPlan({ ...base, when: 'now', candidates: six })).toBeNull();
    expect(
      validPlan({ ...base, when: 'now', candidates: [planRest(0, [pk(0, { openState: 'x' })])] }),
    ).toBeNull();
  });
});

describe('output schemas are bounded by what was sent', () => {
  const ok = { reasons: ['closest'], runnerUp: null, runnerUpWhy: null, tone: null };

  it('pick', () => {
    const s = pickOutputSchema(3);
    const fit = { fit: [], noneFit: false };
    expect(s.safeParse({ ...ok, ...fit, pick: 2 }).success).toBe(true);
    expect(s.safeParse({ ...ok, fit: [2, 0], noneFit: false, pick: 2 }).success).toBe(true);
    expect(s.safeParse({ ...ok, fit: [3], noneFit: false, pick: 2 }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: 2 }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: 3 }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: -1 }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: 1.5 }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: 0, runnerUp: 3, runnerUpWhy: 'closest' }).success).toBe(
      false,
    );
    expect(s.safeParse({ ...ok, pick: 0, reasons: ['cheapest'] }).success).toBe(false);
    expect(
      s.safeParse({ ...ok, pick: 0, reasons: ['closest', 'open_now', 'outdoor', 'free_parking'] })
        .success,
    ).toBe(false);
    expect(s.safeParse({ ...ok, pick: 0, tone: 12 }).success).toBe(false);
  });

  it('car park pick has its own reasons', () => {
    const s = parkPickOutputSchema(2);
    expect(s.safeParse({ ...ok, pick: 1, reasons: ['near_rail', 'free'] }).success).toBe(true);
    expect(s.safeParse({ ...ok, pick: 2, reasons: ['free'] }).success).toBe(false);
    expect(s.safeParse({ ...ok, pick: 0, reasons: ['outdoor'] }).success).toBe(false);
  });

  it('plan', () => {
    const s = planOutputSchema(2, 3);
    const good = { restaurant: 1, parking: 2, reasons: ['closest'], tone: null };
    expect(s.safeParse(good).success).toBe(true);
    expect(s.safeParse({ ...good, restaurant: 2 }).success).toBe(false);
    expect(s.safeParse({ ...good, parking: 3 }).success).toBe(false);
  });

  it('understanding carries the free-text zones as nullable strings and enum codes', () => {
    const search = {
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
      wishes: ['romantic'],
      partySize: 4,
      clarify: { ask: 'duration', text: null },
      plan: { when: 'tonight' },
      tone: null,
      dishNote: null,
      meaning: null,
      notCat: null,
    };
    expect(UnderstandingSchema.safeParse(search).success).toBe(true);
    expect(UnderstandingSchema.safeParse({ ...search, wishes: ['spacey'] }).success).toBe(false);
    expect(
      UnderstandingSchema.safeParse({ ...search, clarify: { ask: 'weather', text: null } }).success,
    ).toBe(false);
    expect(UnderstandingSchema.safeParse({ ...search, plan: { when: 'tomorrow' } }).success).toBe(
      false,
    );
    expect(UnderstandingSchema.safeParse({ ...search, partySize: 0 }).success).toBe(false);
  });

  it('the router answers search, chat (with an action code) or unknown; "offtopic" is gone', () => {
    expect(
      UnderstandingSchema.safeParse({ kind: 'chat', reply: 'Selam!', action: 'none' }).success,
    ).toBe(true);
    expect(UnderstandingSchema.safeParse({ kind: 'unknown' }).success).toBe(true);
    expect(
      UnderstandingSchema.safeParse({ kind: 'chat', reply: 'Selam!', action: 'dance' }).success,
    ).toBe(false);
    expect(UnderstandingSchema.safeParse({ kind: 'chat', reply: 'Selam!' }).success).toBe(false);
    expect(UnderstandingSchema.safeParse({ kind: 'offtopic', reply: 'Selam!' }).success).toBe(
      false,
    );
  });
});
