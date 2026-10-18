import {
  PARK_BIG_CAPACITY,
  type ParkPickCandidate,
  type PickCandidate,
  type PlanCandidate,
} from '../protocol';
import {
  PARKING_CLOSE_M,
  parkReasonHolds,
  pickReasonHolds,
  verifyParkPick,
  verifyPick,
  verifyPlan,
} from '../verify';

const cand = (i: number, over: Partial<PickCandidate> = {}): PickCandidate => ({
  i,
  kind: 'restaurant',
  walkMin: 10,
  openState: 'unknown',
  closesLate: false,
  parkingM: null,
  parkingFree: null,
  freeSpots: null,
  dishMatch: 'none',
  outdoor: null,
  ...over,
});

const res = (over: Record<string, unknown> = {}) =>
  ({ pick: 0, reasons: [], runnerUp: null, runnerUpWhy: null, tone: null, ...over }) as never;

describe('pick reasons are accepted only when true for that candidate', () => {
  const all = [
    cand(0, {
      walkMin: 3,
      openState: 'open',
      closesLate: true,
      parkingM: 80,
      parkingFree: true,
      freeSpots: 12,
      dishMatch: 'named',
      outdoor: true,
    }),
    cand(1, { walkMin: 8, parkingM: 400, parkingFree: false, freeSpots: 5 }),
    cand(2, { walkMin: 3 }),
  ];

  it('accepts each code when it is a fact', () => {
    for (const code of [
      'closest',
      'open_now',
      'open_late',
      'free_parking',
      'parking_close',
      'most_free_spots',
      'dish_named',
      'outdoor',
    ] as const) {
      expect(pickReasonHolds(code, all[0]!, all)).toBe(true);
    }
  });

  it('rejects each code when it is not a fact', () => {
    const c = all[1]!;
    for (const code of [
      'closest',
      'open_now',
      'open_late',
      'free_parking',
      'parking_close',
      'most_free_spots',
      'dish_named',
      'outdoor',
    ] as const) {
      expect(pickReasonHolds(code, c, all)).toBe(false);
    }
  });

  it('treats unknown values as not true', () => {
    const unknown = cand(0);
    expect(pickReasonHolds('free_parking', unknown, [unknown])).toBe(false);
    expect(pickReasonHolds('outdoor', unknown, [unknown])).toBe(false);
    expect(pickReasonHolds('open_now', unknown, [unknown])).toBe(false);
  });

  it('"closest" needs the smallest walk; ties count', () => {
    expect(pickReasonHolds('closest', all[2]!, all)).toBe(true);
    expect(pickReasonHolds('closest', all[1]!, all)).toBe(false);
  });

  it('"parking_close" needs the car park within the limit', () => {
    expect(pickReasonHolds('parking_close', cand(0, { parkingM: PARKING_CLOSE_M }), [])).toBe(true);
    expect(pickReasonHolds('parking_close', cand(0, { parkingM: PARKING_CLOSE_M + 1 }), [])).toBe(
      false,
    );
  });

  it('"most_free_spots" needs a unique, positive, fresh maximum', () => {
    const a = cand(0, { freeSpots: 9 });
    const b = cand(1, { freeSpots: 9 });
    const c = cand(2, { freeSpots: null });
    expect(pickReasonHolds('most_free_spots', a, [a, c])).toBe(true);
    expect(pickReasonHolds('most_free_spots', a, [a, b])).toBe(false);
    const zero = cand(0, { freeSpots: 0 });
    expect(pickReasonHolds('most_free_spots', zero, [zero, c])).toBe(false);
  });
});

describe('verifyPick', () => {
  const all = [
    cand(0, { parkingM: 100, parkingFree: false, openState: 'open' }),
    cand(1, { parkingM: 50, parkingFree: true }),
    cand(2),
  ];

  it('keeps true reasons and drops lies', () => {
    const v = verifyPick(
      res({ pick: 0, reasons: ['free_parking', 'open_now', 'parking_close'] }),
      all,
    );
    // free_parking is false for #0 (paid); open_now and parking_close are true.
    expect(v?.reasons).toEqual(['open_now', 'parking_close']);
  });

  it('is rejected when no reason survives', () => {
    expect(verifyPick(res({ pick: 0, reasons: ['free_parking', 'outdoor'] }), all)).toBeNull();
    expect(verifyPick(res({ pick: 0, reasons: [] }), all)).toBeNull();
  });

  it('rejects a pick when a nonempty fit list contains no valid candidate', () => {
    expect(verifyPick(res({ pick: 0, fit: [99], reasons: ['open_now'] }), all)).toBeNull();
  });

  it('is rejected for an index out of range or not an integer', () => {
    expect(verifyPick(res({ pick: 3, reasons: ['open_now'] }), all)).toBeNull();
    expect(verifyPick(res({ pick: -1, reasons: ['open_now'] }), all)).toBeNull();
    expect(verifyPick(res({ pick: 0.5, reasons: ['open_now'] }), all)).toBeNull();
  });

  it('drops a runner-up equal to the pick, out of range, or with a false reason', () => {
    const base = { pick: 0, reasons: ['open_now'] };
    expect(verifyPick(res({ ...base, runnerUp: 0, runnerUpWhy: 'open_now' }), all)?.runnerUp).toBe(
      null,
    );
    expect(verifyPick(res({ ...base, runnerUp: 9, runnerUpWhy: 'open_now' }), all)?.runnerUp).toBe(
      null,
    );
    expect(
      verifyPick(res({ ...base, runnerUp: 1, runnerUpWhy: 'outdoor' }), all)?.runnerUp,
    ).toBeNull();
    expect(verifyPick(res({ ...base, runnerUp: 1, runnerUpWhy: null }), all)?.runnerUp).toBeNull();
    expect(
      verifyPick(res({ ...base, runnerUp: 1, runnerUpWhy: 'free_parking' }), all)?.runnerUp,
    ).toEqual({ index: 1, why: 'free_parking' });
  });

  it('passes the tone only when it validates', () => {
    const base = { pick: 0, reasons: ['open_now'] };
    expect(verifyPick(res({ ...base, tone: 'Afiyet olsun!' }), all)?.tone).toBe('Afiyet olsun!');
    expect(verifyPick(res({ ...base, tone: 'Otopark ücretsiz!' }), all)?.tone).toBeNull();
  });
});

describe('verifyPlan', () => {
  const plan = (): PlanCandidate[] => [
    {
      i: 0,
      kind: 'restaurant',
      walkMin: 4,
      openState: 'open',
      closesLate: true,
      dishMatch: 'none',
      outdoor: null,
      parkings: [
        { p: 0, walkMin: 1, parkingFree: true, freeSpots: 10, openState: 'open' },
        { p: 1, walkMin: 5, parkingFree: false, freeSpots: 2, openState: 'unknown' },
      ],
    },
    {
      i: 1,
      kind: 'restaurant',
      walkMin: 9,
      openState: 'closed',
      closesLate: false,
      dishMatch: 'none',
      outdoor: null,
      parkings: [{ p: 2, walkMin: 1, parkingFree: true, freeSpots: null, openState: 'open' }],
    },
  ];
  const r = (over: Record<string, unknown>) =>
    ({ restaurant: 0, parking: 0, reasons: ['free_parking'], tone: null, ...over }) as never;

  it('accepts a car park that belongs to the restaurant, with true reasons only', () => {
    const v = verifyPlan(
      r({ reasons: ['free_parking', 'parking_close', 'outdoor'] }),
      plan(),
      'now',
    );
    expect(v).toMatchObject({
      restaurant: 0,
      parking: 0,
      reasons: ['free_parking', 'parking_close'],
    });
  });

  it('rejects a car park that belongs to another restaurant', () => {
    expect(verifyPlan(r({ restaurant: 0, parking: 2 }), plan(), 'now')).toBeNull();
  });

  it('rejects out-of-range indices', () => {
    expect(verifyPlan(r({ restaurant: 5 }), plan(), 'now')).toBeNull();
    expect(verifyPlan(r({ parking: 7 }), plan(), 'now')).toBeNull();
  });

  it('rejects a restaurant known to be closed at that time', () => {
    expect(verifyPlan(r({ restaurant: 1, parking: 2 }), plan(), 'now')).toBeNull();
  });

  it('"open_now" holds only for a plan for now', () => {
    expect(verifyPlan(r({ reasons: ['open_now'] }), plan(), 'now')).not.toBeNull();
    expect(verifyPlan(r({ reasons: ['open_now'] }), plan(), 'tonight')).toBeNull();
  });

  it('is rejected when every reason is false', () => {
    expect(verifyPlan(r({ parking: 1, reasons: ['free_parking'] }), plan(), 'now')).toBeNull();
  });
});

describe('car park picks', () => {
  const park = (i: number, over: Partial<ParkPickCandidate> = {}): ParkPickCandidate => ({
    i,
    kind: 'parking',
    walkMin: 5,
    openState: 'unknown',
    nonstop: false,
    free: null,
    tariffKnown: false,
    covered: null,
    freeSpots: null,
    nearRail: false,
    capacity: null,
    ...over,
  });
  const all = [
    park(0, {
      walkMin: 2,
      openState: 'open',
      nonstop: true,
      free: true,
      covered: true,
      freeSpots: 20,
      nearRail: true,
      capacity: PARK_BIG_CAPACITY,
    }),
    park(1, { walkMin: 6, free: false, covered: false, capacity: PARK_BIG_CAPACITY - 1 }),
  ];
  const pr = (over: Record<string, unknown>) =>
    ({ pick: 0, reasons: [], runnerUp: null, runnerUpWhy: null, tone: null, ...over }) as never;

  it('accepts every code only when it is a fact', () => {
    for (const code of [
      'closest',
      'free',
      'nonstop',
      'open_now',
      'most_free_spots',
      'near_rail',
      'covered',
      'big_capacity',
    ] as const) {
      expect(parkReasonHolds(code, all[0]!, all)).toBe(true);
      expect(parkReasonHolds(code, all[1]!, all)).toBe(false);
    }
  });

  it('drops a lying "free" for a paid car park and ignores the pick if nothing is left', () => {
    expect(verifyParkPick(pr({ pick: 1, reasons: ['free'] }), all)).toBeNull();
    expect(verifyParkPick(pr({ pick: 1, reasons: ['free', 'closest'] }), all)).toBeNull();
    expect(verifyParkPick(pr({ pick: 0, reasons: ['free', 'nonstop'] }), all)?.reasons).toEqual([
      'free',
      'nonstop',
    ]);
    expect(verifyParkPick(pr({ pick: 4, reasons: ['free'] }), all)).toBeNull();
  });

  it('never picks a car park that is closed at that time', () => {
    const shut = [park(0, { walkMin: 1, openState: 'closed', free: true }), all[1]!];
    expect(verifyParkPick(pr({ pick: 0, reasons: ['closest', 'free'] }), shut)).toBeNull();
    expect(verifyParkPick(pr({ pick: 0, reasons: ['closest'] }), shut, {}, 'dinner')).toBeNull();
    // A closed runner-up is dropped, the pick stands.
    const v = verifyParkPick(
      pr({ pick: 1, reasons: ['big_capacity'], runnerUp: 0, runnerUpWhy: 'free' }),
      [park(0, { walkMin: 1, openState: 'closed', free: true }), park(1, { capacity: 500 })],
    );
    expect(v?.pick).toBe(1);
    expect(v?.runnerUp).toBeNull();
  });

  it('"open_now" holds only for a pick about now (openState is at the planned time)', () => {
    expect(parkReasonHolds('open_now', all[0]!, all)).toBe(true);
    expect(parkReasonHolds('open_now', all[0]!, all, 'now')).toBe(true);
    expect(parkReasonHolds('open_now', all[0]!, all, 'dinner')).toBe(false);
    expect(verifyParkPick(pr({ pick: 0, reasons: ['open_now'] }), all, {}, 'tonight')).toBeNull();
    expect(
      verifyParkPick(pr({ pick: 0, reasons: ['open_now', 'free'] }), all, {}, 'tonight')?.reasons,
    ).toEqual(['free']);
  });

  it('drops a "güvenli" tone line', () => {
    const v = verifyParkPick(pr({ pick: 0, reasons: ['free'], tone: 'Güvenli bir seçim!' }), all);
    expect(v?.tone).toBeNull();
    expect(v?.reasons).toEqual(['free']);
  });
});
