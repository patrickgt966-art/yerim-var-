import { CITIES } from '../cities';
import {
  EXTREME_PARK_CASES,
  EXTREME_PICK_CASES,
  EXTREME_PLAN_CASES,
  EXTREME_UNDERSTAND_CASES,
  buildExtremeCases,
} from '../eval/aiExtremeCases';
import { BIG_UNDERSTAND_CASES } from '../eval/aiBigCases';
import { fold } from '../search';
import { MAX_MESSAGE_CHARS } from '@/lib/ai/protocol';

const all = [
  ...EXTREME_UNDERSTAND_CASES,
  ...EXTREME_PICK_CASES,
  ...EXTREME_PARK_CASES,
  ...EXTREME_PLAN_CASES,
];

describe('the extreme live AI eval cases', () => {
  it('has 640-720 cases with unique names', () => {
    expect(all.length).toBeGreaterThanOrEqual(640);
    expect(all.length).toBeLessThanOrEqual(720);
    expect(new Set(all.map((c) => c.name)).size).toBe(all.length);
    for (const c of all) expect(c.name.startsWith(`${c.group}: `)).toBe(true);
  });

  it('is deterministic', () => {
    const a = buildExtremeCases();
    expect(a).toEqual(buildExtremeCases());
    expect(a.understand).toEqual(EXTREME_UNDERSTAND_CASES);
  });

  it('asks other questions than the big set, each fitting in a message', () => {
    const big = new Set(BIG_UNDERSTAND_CASES.map((c) => `${c.city}|${c.text}`));
    for (const c of EXTREME_UNDERSTAND_CASES) {
      expect(big.has(`${c.city}|${c.text}`)).toBe(false);
      expect(c.text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
  });

  it('expects only districts of the case city', () => {
    for (const c of EXTREME_UNDERSTAND_CASES) {
      const city = CITIES.find((x) => x.id === c.city);
      expect(city?.available).toBe(true);
      const ds = city?.districts.map(fold);
      for (const d of [c.expect.district, ...(c.expect.districtIn ?? [])]) {
        if (d) expect(ds).toContain(fold(d));
      }
    }
  });

  it('pick, car park and plan expectations point at real candidates', () => {
    for (const c of [...EXTREME_PICK_CASES, ...EXTREME_PARK_CASES]) {
      c.candidates.forEach((p, i) => expect(p.i).toBe(i));
      const pickIn = c.expect.pickIn ?? [];
      expect(pickIn.length).toBeGreaterThan(0);
      for (const k of pickIn) expect(k).toBeLessThan(c.candidates.length);
    }
    for (const c of EXTREME_PLAN_CASES) {
      const ps = c.candidates.flatMap((r) => r.parkings.map((p) => p.p));
      expect(new Set(ps).size).toBe(ps.length);
      for (const k of c.expect.restaurantIn ?? []) expect(k).toBeLessThan(c.candidates.length);
      for (const k of c.expect.parkingIn ?? []) expect(ps).toContain(k);
      // A wanted restaurant must own one of the wanted car parks.
      if (c.expect.restaurantIn && c.expect.parkingIn) {
        const owned = c.candidates
          .filter((r) => c.expect.restaurantIn?.includes(r.i))
          .flatMap((r) => r.parkings.map((p) => p.p));
        expect(owned.some((p) => c.expect.parkingIn?.includes(p))).toBe(true);
      }
    }
  });
});
