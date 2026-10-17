import { PICK_CASES, UNDERSTAND_CASES } from '../eval/aiCases';
import { scorePick, scoreUnderstanding } from '../eval/aiScore';
import { CITIES } from '../cities';

const search = (over: Record<string, unknown> = {}) =>
  ({
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
    ...over,
  }) as const;

describe('the live AI eval cases', () => {
  it('name real districts of their city', () => {
    for (const c of UNDERSTAND_CASES) {
      const d = c.expect.district;
      if (!d) continue;
      const city = CITIES.find((x) => x.id === (c.city ?? 'izmir'))!;
      expect(city.districtCenters.map((x) => x.name)).toContain(d);
    }
  });

  it('use valid candidate indices', () => {
    for (const c of PICK_CASES) {
      c.candidates.forEach((x, k) => expect(x.i).toBe(k));
      for (const k of [...(c.expect.pickIn ?? []), ...(c.expect.notFit ?? [])]) {
        expect(k).toBeLessThan(c.candidates.length);
      }
    }
  });
});

describe('scoring an understanding', () => {
  const c = UNDERSTAND_CASES.find((x) => x.name.startsWith('filler around'))!;

  it('passes the right reading', () => {
    const u = search({ district: 'Buca', meaning: "Buca'da vejetaryen yemek arıyor" });
    expect(scoreUnderstanding(c, u)).toEqual({ pass: true, misses: [] });
  });

  it('fails filler read as a place, and a reading that lost the earlier request', () => {
    const u = search({ district: 'Buca', place: 'hmmmmmm bro', meaning: 'Buca' });
    const s = scoreUnderstanding(c, u);
    expect(s.pass).toBe(false);
    expect(s.misses.join(' ')).toMatch(/place/);
    expect(s.misses.join(' ')).toMatch(/meaning/);
  });

  it('fails a ruled-out category that was picked', () => {
    const neg = UNDERSTAND_CASES.find((x) => x.expect.notCat === 'meat')!;
    expect(scoreUnderstanding(neg, search({ district: 'Karşıyaka', cat: 'meat' })).pass).toBe(
      false,
    );
    const ok = search({ district: 'Karşıyaka', notCat: 'meat' });
    expect(scoreUnderstanding(neg, ok).pass).toBe(true);
  });
});

describe('scoring a pick', () => {
  const veg = PICK_CASES[0]!;
  const base = { reasons: [], runnerUp: null, runnerUpWhy: null, tone: null };

  it('passes a fitting pick and fails a butcher', () => {
    expect(scorePick(veg, { ...base, fit: [2], noneFit: false, pick: 2 }).pass).toBe(true);
    expect(scorePick(veg, { ...base, fit: [0, 2], noneFit: false, pick: 2 }).pass).toBe(false);
    expect(scorePick(veg, { ...base, fit: [], noneFit: false, pick: 0 }).pass).toBe(false);
    expect(scorePick(veg, null).pass).toBe(false);
  });

  it('wants "none fits" when nothing does', () => {
    const none = PICK_CASES.find((x) => x.expect.noneFit)!;
    expect(scorePick(none, { ...base, fit: [], noneFit: true, pick: 0 }).pass).toBe(true);
    expect(scorePick(none, { ...base, fit: [2], noneFit: false, pick: 2 }).pass).toBe(false);
  });
});
