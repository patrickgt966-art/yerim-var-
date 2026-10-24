import { caseHash } from '../eval/adaptive';
import { COMPLEX_THEMES, buildComplexCases, complexCategories } from '../eval/complexCases';
import { CONVO_CATEGORIES } from '../eval/convoCases';
import { MEGA_CATEGORIES } from '../eval/megaCases';

const WANT = Object.fromEntries(MEGA_CATEGORIES.map((c) => [c, 40]));
const cases = buildComplexCases(7, WANT);

describe('the complex generator layer', () => {
  it('makes the wanted number of cases in every category of the mega set', () => {
    for (const cat of MEGA_CATEGORIES) {
      expect(cases.filter((c) => c.category === cat)).toHaveLength(40);
    }
    expect(complexCategories('mega').sort()).toEqual([...MEGA_CATEGORIES].sort());
  });

  it('is the same for the same seed, another set of cases for another seed', () => {
    expect(buildComplexCases(7, WANT)).toEqual(cases);
    const other = buildComplexCases(8, WANT);
    const mine = new Set(cases.map(caseHash));
    expect(other.filter((c) => mine.has(caseHash(c))).length).toBeLessThan(cases.length * 0.1);
  });

  it('gives every case expectations on every turn, and marks it level 2', () => {
    for (const c of cases) {
      expect(c.level).toBe(2);
      expect(c.turns.length).toBeGreaterThanOrEqual(2);
      expect(c.turns.length).toBeLessThanOrEqual(10);
      expect(c.sub).toBeTruthy();
      expect(['tr', 'en']).toContain(c.ui);
      expect(typeof c.located).toBe('boolean');
      for (const t of c.turns) {
        expect(t.input.text.trim()).not.toBe('');
        const keys = Object.keys(t.expect).filter((k) => k !== 'kind');
        expect(t.expect.kind).toBeTruthy();
        // something beyond the kind: cards, a place, a claim, a chip, "free" ...
        expect(keys.length).toBeGreaterThan(0);
      }
    }
  });

  it('is complex: most cases are long conversations or combine several things', () => {
    const long = cases.filter((c) => c.turns.length >= 5).length;
    expect(long).toBeGreaterThan(cases.length * 0.4);
    const subs = new Set(cases.map((c) => c.sub));
    expect(subs.size).toBe(COMPLEX_THEMES.length);
  });

  it('has no repeated conversation and no repeated name, and avoids the hashes it is given', () => {
    const hashes = cases.map(caseHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    const avoid = new Set(hashes.slice(0, 100));
    const again = buildComplexCases(7, WANT, 'mega', avoid);
    expect(again.some((c) => avoid.has(caseHash(c)))).toBe(false);
  });

  it('covers what the owner asked for', () => {
    const texts = cases.flatMap((c) => c.turns.map((t) => t.input.text.toLocaleLowerCase('tr')));
    const has = (re: RegExp) => texts.some((t) => re.test(t));
    expect(has(/yok .* değil/)).toBe(true); // a correction
    expect(has(/ilk gösterdiğin ikinci/)).toBe(true); // an earlier result
    expect(has(/en yakını hangisi/)).toBe(true); // memory
    expect(has(/ikincisine yol tarifi/)).toBe(true);
    expect(has(/otoparkı olanlar hangileri/)).toBe(true);
    expect(has(/kapalı|ücretsiz|24 saat/)).toBe(true); // parking wishes
    expect(has(/kişiyiz/)).toBe(true); // party size
    expect(has(/\bbest\b|\bgood\b|\bquick\b/)).toBe(true); // mixed TR / EN
    expect(has(/telefon|yıldız|rezervasyon|garanti/)).toBe(true); // honest-limit traps
    expect(has(/hava|fıkra|şiir|ilaç/)).toBe(true); // out of scope
    expect(cases.some((c) => c.turns.some((t) => t.input.type === 'say' && t.input.city))).toBe(
      true,
    );
    expect(cases.some((c) => c.turns.some((t) => t.input.type === 'directions'))).toBe(true);
    // several cities in one conversation
    expect(
      cases.some(
        (c) =>
          new Set([
            c.city,
            ...c.turns.flatMap((t) =>
              t.input.type === 'say' && t.input.city ? [t.input.city] : [],
            ),
          ]).size >= 3,
      ),
    ).toBe(true);
  });

  it('makes cases of the convo set in the categories of that set', () => {
    const want = Object.fromEntries(CONVO_CATEGORIES.map((c) => [c, 10]));
    const convo = buildComplexCases(3, want, 'convo');
    expect(convo.length).toBeGreaterThan(0);
    for (const c of convo) expect(CONVO_CATEGORIES as readonly string[]).toContain(c.category);
    for (const cat of complexCategories('convo')) {
      expect(convo.filter((c) => c.category === cat)).toHaveLength(10);
    }
    expect(buildComplexCases(3, want, 'convo')).toEqual(convo);
  });

  it('skips a category it has no theme for', () => {
    expect(buildComplexCases(1, { nonsense: 5 })).toEqual([]);
    expect(buildComplexCases(1, { style: 0 })).toEqual([]);
  });
});
