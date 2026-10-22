import '@/i18n';
import i18n from 'i18next';

import { answer, emptyContext, refine, type AssistantDeps, type BotMessage } from '../assistant';
import { CHOICES, inMember, memberLabel, memberOf, type ChoiceEntry } from '../choices';
import { wishesIn } from '../intent';
import { CATEGORY_RADII_M, categoryForQuery, getRestaurant, restaurantsNear } from '../restaurants';
import { staticParkings } from '../staticParkings';

// Real Turkish strings, real İzmir data, standing at Alsancak.
const ALSANCAK = { lat: 38.4365, lng: 27.1437 };
const deps: AssistantDeps = {
  here: async () => ALSANCAK,
  geocode: async () => null,
  parkings: staticParkings(),
  // eslint-disable-next-line import/no-named-as-default-member
  t: (k, o) => i18n.t(k, o) as string,
};
const reach = CATEGORY_RADII_M[CATEGORY_RADII_M.length - 1]!;
const lang = 'tr';

const restaurants = (reply: BotMessage) =>
  reply.cards.filter((c) => c.kind === 'restaurant').map((c) => getRestaurant(c.id)!);
const ids = (reply: BotMessage) => reply.cards.map((c) => c.id);
const labels = (reply: BotMessage) => reply.actions.map((a) => a.label);
const chip = (reply: BotMessage, label: string) => {
  const a = reply.actions.find((x) => x.label === label);
  if (!a || a.kind !== 'refine') throw new Error(`no chip ${label}`);
  return a;
};
/** Members of an entry that have a place within reach of Alsancak. */
const present = (e: ChoiceEntry) => {
  const around = restaurantsNear(ALSANCAK, reach, 5000);
  return e.members.filter((m) => around.some((r) => inMember(r, m)));
};
const noWords = (text: string) => {
  expect(text).not.toMatch(/undefined|null|\{\{|NaN/);
};

// An ask with no category: Yerim asks first. A message, a typed word for a member.
const ASKS = [
  { id: 'protein', msg: 'kaslıyım bana yer bul', wish: 'protein', noData: 'Menü verimiz yok' },
  { id: 'healthy', msg: 'fit menü arıyorum', wish: 'healthy', noData: 'Menü verimiz yok' },
  { id: 'quick', msg: 'hızlı bir şey', wish: 'quick', noData: 'Fiyat verimiz yok' },
  { id: 'hearty', msg: 'kilo almak istiyorum', wish: 'hearty', noData: 'Menü verimiz yok' },
  { id: 'sweet', msg: 'canım tatlı çekti', wish: null, noData: null },
];
// A broad category named directly: no question, narrowing chips after the results.
const NARROWS = [
  { id: 'sweet', msg: 'tatlı' },
  { id: 'meat', msg: 'et' },
  { id: 'world', msg: 'dünya mutfağı' },
  { id: 'breakfast', msg: 'kahvaltı' },
];

it('the table covers every ask and every narrowing above, and nothing else', () => {
  expect(CHOICES.map((e) => e.id).sort()).toEqual(
    [...new Set([...ASKS, ...NARROWS].map((x) => x.id))].sort(),
  );
});

describe('the words of a goal', () => {
  it.each([
    ['çok kaslıyım bana göre yer bul', ['protein']],
    ['çok kaslı olduğum için bana ona göre bul', ['protein']],
    ['fit menü arıyorum', ['healthy']],
    ['diyetteyim akşam ne yesem', ['healthy']],
    ['proteinli bir şeyler', ['protein']],
    ['yüksek protein', ['protein']],
    ['spor sonrası', ['protein']],
    ['hafif bir şey', ['healthy']],
    ['düşük kalorili', ['healthy']],
    ['temiz beslenmek istiyorum', ['healthy']],
    ['fitness sonrası', ['protein']],
    ['kilo almak istiyorum', ['hearty']],
    ['kilo almam lazım', ['hearty']],
    ['bulk yapıyorum', ['hearty']],
    ['doyurucu bir şey', ['hearty']],
    ['çok acıktım tok tutsun', ['hearty']],
    ['karnım çok aç', ['hearty']],
    ['kalorili bir şey lazım', ['hearty']],
    ['yüksek kalorili', ['hearty']],
    ['kilo vermek istiyorum', ['healthy']],
    ['kilo veriyorum bir yer söyle', ['healthy']],
    ['zayıflamak istiyorum', ['healthy']],
    ['kalori sayıyorum', ['healthy']],
    ['az kalorili bir şey', ['healthy']],
    ['kalorisi yüksek bir şey', ['hearty']],
    ['kalorisi düşük bir şey', ['healthy']],
  ])('"%s" is %j', (text, wishes) => {
    expect(wishesIn(text)).toEqual(wishes);
  });

  it('keeps clear of the words that only look like a goal', () => {
    // "kas" is a whole word (kasap = butcher), "fit" too, and Kaş (the district) is not muscle.
    for (const text of ['kasap', 'kasap fuat', 'kasa', 'fitil', "Kaş'ta yemek", 'Etiler']) {
      expect(wishesIn(text)).not.toEqual(expect.arrayContaining(['protein']));
      expect(wishesIn(text)).not.toEqual(expect.arrayContaining(['healthy']));
    }
  });

  it('protein is no longer the meat category', () => {
    for (const w of ['protein', 'proteinli', 'yüksek protein'])
      expect(categoryForQuery(w)).toBeNull();
  });
});

describe.each(ASKS)('ask: $id ("$msg")', ({ id, msg, wish, noData }) => {
  const entry = CHOICES.find((e) => e.id === id)!;
  const members = present(entry);

  it('has places of several kinds around Alsancak (the test is meaningful)', () => {
    expect(members.length).toBeGreaterThanOrEqual(3);
  });

  it('asks first: no cards, one chip per kind with a place within reach, "Hepsi" last', async () => {
    const r = await answer(msg, emptyContext('food'), deps);
    expect(r.reply.cards).toEqual([]);
    // eslint-disable-next-line import/no-named-as-default-member
    expect(r.reply.text).toBe(i18n.t(`chat.choice.ask.${id}`));
    expect(labels(r.reply)).toEqual([...members.map((m) => memberLabel(m, lang)), 'Hepsi']);
    expect(r.ctx.ask).toBe(id);
    if (wish) expect(r.ctx.wishes).toContain(wish);
    noWords(r.reply.text);
  });

  it('a member chip searches that kind only, with its reason on every card', async () => {
    const q = await answer(msg, emptyContext('food'), deps);
    for (const m of members) {
      const r = await refine(q.ctx, chip(q.reply, memberLabel(m, lang)).patch, deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) {
        expect(inMember(getRestaurant(c.id)!, m)).toBe(true);
        if (c.kind === 'restaurant') {
          const reason = `${memberLabel(m, lang).toLocaleLowerCase('tr')} · ${entry.reason.tr}`;
          expect(c.reason).toBe(reason);
        }
      }
      noWords(r.reply.text);
    }
  });

  it('"Hepsi" shows the kinds side by side, each at most 40% when three or more are there', async () => {
    const q = await answer(msg, emptyContext('food'), deps);
    const r = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
    const shown = restaurants(r.reply);
    expect(shown.length).toBe(5);
    const kinds = shown.map((x) => memberOf(x, entry.members)!.id);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(kinds)) {
      expect(kinds.filter((x) => x === k).length / kinds.length).toBeLessThanOrEqual(0.4);
    }
    if (noData) {
      expect(r.reply.text).toContain(noData);
      // Only kinds that are on the screen are named.
      const named = entry.members.filter((m) =>
        r.reply.text.toLocaleLowerCase('tr').includes(memberLabel(m, lang).toLocaleLowerCase('tr')),
      );
      for (const m of named) expect(kinds).toContain(m.id);
    }
    noWords(r.reply.text);
  });

  it('typed answers work like the chips, without a router call', async () => {
    const q = await answer(msg, emptyContext('food'), deps);
    const first = members[0]!;
    const typed = await answer(first.words[0]!, q.ctx, deps);
    const tapped = await refine(q.ctx, chip(q.reply, memberLabel(first, lang)).patch, deps);
    expect(ids(typed.reply)).toEqual(ids(tapped.reply));
    const hepsi = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
    for (const word of ['hepsi', 'tümü', 'farketmez']) {
      const r = await answer(word, q.ctx, deps);
      expect(ids(r.reply)).toEqual(ids(hepsi.reply));
      // The sentence about the data is said once; the generic "no info" note is not added to it.
      if (noData) {
        expect(r.reply.text.match(new RegExp(noData, 'g'))).toHaveLength(1);
        expect(r.reply.text).not.toMatch(/bilgimiz yok/);
      }
    }
  });

  it('a typed answer that names no kind is a new message, not an answer', async () => {
    const q = await answer(msg, emptyContext('food'), deps);
    const r = await answer('kahvaltı', q.ctx, deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.ctx.cat).toBe('breakfast');
  });
});

// "hızlı bir şey otoparklı" keeps the car park reading it always had; goals and sweets carry the wish.
describe.each(ASKS.filter((a) => a.id !== 'quick'))(
  'ask: $id with a district and a car park',
  ({ msg }) => {
    it('keeps the district and the car park wish from the message', async () => {
      const q = await answer(`Bornova'da ${msg} otoparklı`, emptyContext('food'), deps);
      expect(q.ctx.place?.label).toBe('Bornova');
      expect(q.reply.cards).toEqual([]);
      const r = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
      expect(r.ctx.place?.label).toBe('Bornova');
      expect(r.ctx.requireParking).toBe(true);
      expect(r.reply.cards.every((c) => c.kind !== 'restaurant' || c.parkingM !== null)).toBe(true);
    });
  },
);

describe.each(NARROWS)('narrowing: $id ("$msg")', ({ id, msg }) => {
  const entry = CHOICES.find((e) => e.id === id)!;

  it('shows the category right away, plus chips only for kinds that have places', async () => {
    const r = await answer(msg, emptyContext('food'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.ctx.ask).toBeUndefined();
    const chips = labels(r.reply).filter((l) =>
      entry.members.some((m) => memberLabel(m, lang) === l),
    );
    expect(chips.length).toBeGreaterThanOrEqual(2);
    // A kind with no place around is never offered.
    const have = restaurantsNear(ALSANCAK, reach, 5000).filter((p) =>
      inMember(p, { id: 'x', tr: '', en: '', words: [], cat: entry.cat }),
    );
    for (const m of entry.members) {
      if (chips.includes(memberLabel(m, lang))) expect(have.some((p) => inMember(p, m))).toBe(true);
    }
    noWords(r.reply.text);
  });

  it('a chip narrows to that kind, and "Hepsi" brings the category back', async () => {
    const r = await answer(msg, emptyContext('food'), deps);
    const label = labels(r.reply).find((l) =>
      entry.members.some((m) => memberLabel(m, lang) === l),
    )!;
    const member = entry.members.find((m) => memberLabel(m, lang) === label)!;
    const narrowed = await refine(r.ctx, chip(r.reply, label).patch, deps);
    expect(narrowed.reply.cards.length).toBeGreaterThan(0);
    for (const c of narrowed.reply.cards) expect(inMember(getRestaurant(c.id)!, member)).toBe(true);
    expect(labels(narrowed.reply)).toContain('Hepsi');
    expect(labels(narrowed.reply)).not.toContain(label);
    const back = await refine(narrowed.ctx, chip(narrowed.reply, 'Hepsi').patch, deps);
    expect(ids(back.reply)).toEqual(ids(r.reply));
  });

  it('a typed kind still finds places', async () => {
    const r = await answer(msg, emptyContext('food'), deps);
    const label = labels(r.reply).find((l) =>
      entry.members.some((m) => memberLabel(m, lang) === l),
    )!;
    const member = entry.members.find((m) => memberLabel(m, lang) === label)!;
    const typed = await answer(member.words[0]!, r.ctx, deps);
    expect(typed.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('a goal with a category or dish named: no question, the goal only reorders', () => {
  it('"fit balık" is fish with the healthy wish', async () => {
    const r = await answer('fit balık', emptyContext('food'), deps);
    expect(r.ctx.cat).toBe('fish');
    expect(r.ctx.wishes).toEqual(['healthy']);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(restaurants(r.reply).every((x) => inMember(x, CHOICES[1]!.members[3]!))).toBe(true);
    expect(r.reply.text).toContain(
      'Menü verimiz yok; hafif ve sağlıklı seçenekleri yer türüne göre seçtim: balık.',
    );
    expect(r.reply.text).not.toMatch(/bilgimiz yok/);
    noWords(r.reply.text);
  });

  it('"proteinli kahvaltı" stays breakfast; no member appears, so the honest generic note stays', async () => {
    const r = await answer('proteinli kahvaltı', emptyContext('food'), deps);
    expect(r.ctx.cat).toBe('breakfast');
    expect(r.ctx.wishes).toEqual(['protein']);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.text).not.toContain('seçtim');
    expect(r.reply.text).toMatch(/Menü bilgimiz yok/);
    noWords(r.reply.text);
  });

  it('the AI path asks the same way: a goal wish with no category', async () => {
    const understand = jest.fn(async () => ({
      ok: true as const,
      remaining: 5,
      value: {
        kind: 'search' as const,
        district: null,
        cat: null,
        dish: null,
        place: null,
        food: true,
        requireParking: false,
        appleQuery: null,
        nearMe: true,
        dishServes: null,
        wishes: ['protein' as const],
      },
    }));
    const ai = {
      understand,
      pick: jest.fn(async () => ({ ok: false as const, reason: 'error' as const })),
      plan: jest.fn(),
      pickPark: jest.fn(),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>;
    const q = await answer('çok kaslıyım bana göre yer bul', emptyContext('food'), { ...deps, ai });
    expect(q.reply.cards).toEqual([]);
    expect(labels(q.reply).at(-1)).toBe('Hepsi');
    // The typed answer does not spend a router use.
    await answer('balık', q.ctx, { ...deps, ai });
    expect(understand).toHaveBeenCalledTimes(1);
  });
});

describe('wishes with no data keep the honest note and get no invented list', () => {
  it.each([
    "Bornova'da romantik bir yer",
    "Bornova'da sakin bir yer",
    "Bornova'da manzaralı bir yer",
    "Bornova'da çocukla gidilecek bir yer",
  ])('"%s"', async (msg) => {
    const r = await answer(msg, emptyContext('food'), deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.text).toMatch(/bilgimiz yok/);
    expect(r.reply.text).not.toContain('seçtim');
  });

  it('"ucuz romantik" is not asked either: the romantic wish has no data', async () => {
    const r = await answer("Bornova'da ucuz romantik bir yer", emptyContext('food'), deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('"ucuz otopark" in the car park chat stays a car park ask', async () => {
    const r = await answer("Bornova'da ucuz otopark", emptyContext('park'), deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.ctx.section).toBe('park');
  });
});

describe('the quick ask makes no price claim', () => {
  it.each(['ucuz bir yer', 'cebime uygun', 'acele'])(
    '"%s" asks, and the sentence says no price data',
    async (msg) => {
      const q = await answer(msg, emptyContext('food'), deps);
      expect(q.ctx.ask).toBe('quick');
      const r = await answer('hepsi', q.ctx, deps);
      expect(r.reply.text).toContain('Fiyat verimiz yok');
      expect(r.reply.text).not.toMatch(/ucuz|uygun fiyat|ekonomik/i);
    },
  );
});
