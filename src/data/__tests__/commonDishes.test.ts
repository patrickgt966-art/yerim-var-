import i18n from '@/i18n';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { setActiveCity } from '../cities';
import { commonLast, commonShop, dishProfile, DISHES, likelyFirst, SHOP_GROUPS } from '../dishes';

// A tiny city around (38.4, 27.1): the Kebapçı is the closest place that usually has a künefe,
// the Tatlıcı (a künefe specialist) is farther, the pizza place has neither.
const mockFood = [
  { id: 'osm-c1', n: 'Hacı Kebapçı', a: 38.4005, o: 27.1, k: 'restaurant' },
  { id: 'osm-c2', n: 'Ahmet Tatlıcı', a: 38.404, o: 27.1, k: 'restaurant' },
  { id: 'osm-c3', n: 'Mavi Pizza', a: 38.4002, o: 27.1, k: 'restaurant' },
  { id: 'osm-c4', n: 'Köfteci Nuri', a: 38.401, o: 27.1, k: 'restaurant' },
];
jest.mock('../cityData', () => ({
  ...jest.requireActual('../cityData'),
  foodFile: (id: string) => ({ items: id === 'izmir' ? mockFood : [] }),
  foodOvertureFile: () => ({ items: [] }),
  categoryGuessFile: () => ({ items: {} }),
}));

const deps: AssistantDeps = {
  here: async () => ({ lat: 38.4, lng: 27.1 }),
  geocode: async () => null,
  parkings: [],
  t: (k, o) => i18n.t(k, o) as string,
};

beforeAll(async () => {
  setActiveCity('izmir');
  await i18n.changeLanguage('tr');
});
afterAll(async () => {
  await i18n.changeLanguage('en');
});

const cardsOf = (r: Awaited<ReturnType<typeof answer>>) =>
  r.reply.cards.flatMap((c) => (c.kind === 'restaurant' ? [c] : []));

describe('common dishes: a shop type that usually also serves a dish', () => {
  it('ranks a specialist before a common shop that is closer, and the common one says "usually"', async () => {
    const r = await answer('künefe', emptyContext('food'), deps);
    const cards = cardsOf(r);
    expect(cards.map((c) => c.name)).toEqual(['Ahmet Tatlıcı', 'Hacı Kebapçı']);
    expect(cards[0]!.reason).toContain('büyük ihtimalle');
    expect(cards[1]!.reason).toBe('kebapçı; künefe genelde olur');
    // A place that matches neither is not listed; the reply counts only the specialists as "likely".
    expect(cards.map((c) => c.name)).not.toContain('Mavi Pizza');
    expect(cards.map((c) => c.name)).not.toContain('Köfteci Nuri');
  });

  it('keeps specialists first when the sort is by distance', async () => {
    const r = await answer('en yakın künefe', emptyContext('food'), deps);
    expect(r.ctx.sort).toBe('distance');
    expect(cardsOf(r).map((c) => c.name)).toEqual(['Ahmet Tatlıcı', 'Hacı Kebapçı']);
  });

  it('says it is usual, not certain, when only common shops exist', async () => {
    const r = await answer('mercimek', emptyContext('food'), deps);
    const cards = cardsOf(r);
    expect(cards.map((c) => c.name)).toEqual(['Hacı Kebapçı', 'Köfteci Nuri']);
    expect(cards.map((c) => c.reason)).toEqual([
      'kebapçı; mercimek genelde olur',
      'köfteci; mercimek genelde olur',
    ]);
    expect(r.reply.text).toContain('genelde olur');
    expect(r.reply.text).not.toContain('büyük ihtimalle');
  });

  it('does not call a kebapçı common for a lahmacun: it is a specialist there', async () => {
    const r = await answer('lahmacun', emptyContext('food'), deps);
    const kebab = cardsOf(r).find((c) => c.name === 'Hacı Kebapçı');
    expect(kebab?.reason).toContain('büyük ihtimalle');
  });

  it('leaves no placeholder or "undefined" in the Turkish or English text', async () => {
    for (const lang of ['tr', 'en']) {
      await i18n.changeLanguage(lang);
      for (const q of ['künefe', 'mercimek', 'en yakın künefe']) {
        const r = await answer(q, emptyContext('food'), deps);
        const texts = [r.reply.text, ...cardsOf(r).map((c) => c.reason ?? '')];
        for (const text of texts) {
          expect(text).not.toContain('{{');
          expect(text).not.toContain('undefined');
        }
      }
    }
    await i18n.changeLanguage('tr');
  });
});

describe('common dish profiles', () => {
  it('never lists a shop group whose words the dish already serves', () => {
    for (const p of DISHES) {
      for (const g of Object.values(SHOP_GROUPS)) {
        const inCommon = g.words.every((w) => p.common?.includes(w));
        if (inCommon) expect(g.words.some((w) => p.serves.includes(w))).toBe(false);
      }
    }
  });

  it('adds the table for the dishes that exist', () => {
    expect(dishProfile('kunefe')?.common).toEqual(expect.arrayContaining(['kebap', 'kebapci']));
    expect(dishProfile('mercimek')?.common).toEqual(
      expect.arrayContaining(['kebap', 'kofte', 'pide', 'lokanta']),
    );
    expect(dishProfile('lahmacun')?.common).toBeUndefined();
    expect(dishProfile('piyaz')?.common).toBeUndefined();
    expect(dishProfile('kalamar')?.common).toEqual(['meyhane', 'meze']);
    expect(dishProfile('ezme')?.common).toEqual(expect.arrayContaining(['balik']));
    expect(dishProfile('ezme')?.common).not.toContain('kebap');
  });

  it('names the shop type of a common hit, or null', () => {
    const kunefe = dishProfile('kunefe')!;
    expect(commonShop(kunefe, 'haci kebapci')).toBe('kebapçı');
    expect(commonShop(kunefe, 'ahmet tatlici')).toBeNull();
    expect(commonShop(dishProfile('tost')!, 'mavi cafe')).toBe('kafe');
  });

  it('orders specialists before common shops; the given order holds inside each group', () => {
    const p = dishProfile('kunefe')!;
    const names = ['haci kebapci', 'birinci tatlici', 'ikinci kebap', 'ikinci tatlici'];
    const rows = names.map((name) => ({ r: { name, cuisines: [] as string[] } }));
    const want = ['birinci tatlici', 'ikinci tatlici', 'haci kebapci', 'ikinci kebap'];
    expect(likelyFirst(rows, p).map((x) => x.r.name)).toEqual(want);
    expect(commonLast(rows, p).map((x) => x.r.name)).toEqual(want);
  });
});
