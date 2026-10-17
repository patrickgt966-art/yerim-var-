import { CITIES } from '../cities';
import {
  BIG_GROUPS,
  BIG_PICK_CASES,
  BIG_UNDERSTAND_CASES,
  buildBigCases,
  locative,
} from '../eval/aiBigCases';
import { fold } from '../search';

const all = [...BIG_UNDERSTAND_CASES, ...BIG_PICK_CASES];

describe('the big live AI eval cases', () => {
  it('has 560-620 cases with unique names in every group', () => {
    expect(all.length).toBeGreaterThanOrEqual(560);
    expect(all.length).toBeLessThanOrEqual(620);
    expect(new Set(all.map((c) => c.name)).size).toBe(all.length);
    const groups = new Set(all.map((c) => c.group));
    for (const g of BIG_GROUPS) expect(groups.has(g)).toBe(true);
    for (const c of all) expect(c.name.startsWith(`${c.group}: `)).toBe(true);
  });

  it('is deterministic', () => {
    const a = buildBigCases();
    const b = buildBigCases();
    expect(a).toEqual(b);
    expect(a.understand).toEqual(BIG_UNDERSTAND_CASES);
    expect(a.pick).toEqual(BIG_PICK_CASES);
  });

  it('expects only districts of the case city', () => {
    for (const c of BIG_UNDERSTAND_CASES) {
      const city = CITIES.find((x) => x.id === (c.city ?? 'izmir'));
      expect(city?.available).toBe(true);
      const d = c.expect.district;
      if (d) expect(city?.districts.map(fold)).toContain(fold(d));
    }
  });

  it('pick expectations point at real candidates and do not contradict', () => {
    for (const c of BIG_PICK_CASES) {
      const n = c.candidates.length;
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(6);
      c.candidates.forEach((p, i) => expect(p.i).toBe(i));
      const pickIn = c.expect.pickIn ?? [];
      const notFit = c.expect.notFit ?? [];
      for (const k of [...pickIn, ...notFit]) {
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(n);
      }
      expect(pickIn.filter((k) => notFit.includes(k))).toEqual([]);
      if (!c.expect.noneFit) expect(pickIn.length).toBeGreaterThan(0);
    }
  });

  it('builds the locative with vowel and consonant harmony', () => {
    expect(locative('bornova')).toBe('bornovada');
    expect(locative('kadıköy')).toBe('kadıköyde');
    expect(locative('şişli')).toBe('şişlide');
    expect(locative('çankaya')).toBe('çankayada');
    expect(locative('etimesgut')).toBe('etimesgutta');
    expect(locative('muratpaşa')).toBe('muratpaşada');
    expect(locative('karşıyaka')).toBe('karşıyakada');
    expect(locative('nilüfer')).toBe('nilüferde');
    expect(locative('Kaş', true)).toBe("Kaş'ta");
  });
});
