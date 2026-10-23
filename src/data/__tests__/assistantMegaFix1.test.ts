// Fixes from the first mega eval run (2479 of 2984 conversations passed): each describe block
// replays a real transcript of that run against the assistant with a stand-in router that answers
// what the model answered there.
/* eslint-disable import/no-named-as-default-member -- the default export of i18next is the instance */
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import enText from '@/i18n/en';
import { validateFreeText } from '@/lib/ai/freeText';
import { langNote, replyLangNote, type Understanding } from '@/lib/ai/protocol';
import { looksTurkish, validateReply } from '@/lib/ai/replyCheck';

import { answer, emptyContext, type AssistantDeps, type ChatContext } from '../assistant';
import { activeCity, setActiveCity } from '../cities';
import { KINDS, memberLabel } from '../choices';
import { MEGA_SEED, buildMegaCases } from '../eval/megaCases';
import type { ConvoTurn, TurnExpect } from '../eval/convoCases';
import {
  PARTY_LABELS,
  claimsIn,
  distanceClaims,
  forbiddenClaims,
  scoreTurn,
  type ObservedTurn,
} from '../eval/convoScore';
import { settleDistrict } from '../districtMatch';
import { emojiWords, resultsRefIn, statedStayIn } from '../intent';
import { staticParkings } from '../staticParkings';

const t: AssistantDeps['t'] = (k, o) => i18n.t(k, o) as string;
const baseDeps = (): AssistantDeps => ({
  here: async () => activeCity().center,
  geocode: async () => null,
  parkings: staticParkings(),
  t,
});

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
    nearMe: false,
    dishServes: null,
    wishes: [],
    partySize: null,
    clarify: null,
    plan: null,
    tone: null,
    dishNote: null,
    meaning: null,
    notCat: null,
    ...over,
  },
});
const chatU = (reply: string): AiResult<Understanding> => ({
  ok: true,
  remaining: 8,
  value: { kind: 'chat', reply, action: 'none' } as Understanding,
});

/** An AI layer whose router answers the given readings one after the other. */
function routerSays(...readings: AiResult<Understanding>[]): AssistantDeps {
  const fail = async (): Promise<unknown> => ({ ok: false, reason: 'error' });
  let n = 0;
  return {
    ...baseDeps(),
    ai: {
      understand: jest.fn(async () => readings[Math.min(n++, readings.length - 1)]!),
      reply: jest.fn(async () => null),
      pick: jest.fn(fail),
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
}

const parkAskedCards = (cards: { kind: string; parkAsked?: true }[]) =>
  cards.filter((c) => c.kind === 'restaurant' && c.parkAsked);

afterEach(async () => {
  setActiveCity('izmir');
  if (i18n.language !== 'tr') await i18n.changeLanguage('tr');
});

describe('1. a refine turn never attaches car parks', () => {
  const kahvalti = (over: Partial<Search> = {}) =>
    searchU({ district: 'Çankaya', cat: 'breakfast', dish: 'serpme kahvaltı', ...over });

  it.each(['şu an açık olanlar olsun', 'açık olan var mı', 'open now please'])(
    '"%s" after a search: the router read a plan "now" and a parking need, neither counts',
    async (wish) => {
      setActiveCity('ankara');
      const deps = routerSays(
        kahvalti(),
        kahvalti({ plan: { when: 'now' }, requireParking: true }),
      );
      const first = await answer('çankayada serpme kahvaltı', emptyContext('food'), deps);
      expect(first.reply.cards.length).toBeGreaterThan(0);
      const next = await answer(wish, first.ctx, deps);
      expect(next.reply.cards.length).toBeGreaterThan(0);
      expect(next.ctx.requireParking).toBe(false);
      expect(parkAskedCards(next.reply.cards)).toHaveLength(0);
      expect(next.reply.plan).toBeUndefined();
      expect(next.reply.text).not.toMatch(/otopark/i);
    },
  );

  it('a parking word of the user still turns parking on', async () => {
    setActiveCity('ankara');
    const deps = routerSays(kahvalti(), kahvalti({ requireParking: true, plan: { when: 'now' } }));
    const first = await answer('çankayada serpme kahvaltı', emptyContext('food'), deps);
    const next = await answer('otoparklı olsun', first.ctx, deps);
    expect(next.ctx.requireParking).toBe(true);
  });

  it.each([
    ['izmir', 'Araba kenarda duracak konakta köfte hemen yanında olsun ya', 'Konak', 'köfte'],
    ['istanbul', 'araba kenarda duracak sislide balik hemen yaninda olsun', 'Şişli', 'balık'],
  ])('%s: "%s" is a roadside stop, not a car park ask', async (city, text, district, dish) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const deps = routerSays(
      searchU({
        district,
        cat: dish === 'balık' ? 'fish' : 'meat',
        dish,
        requireParking: true,
        plan: { when: 'now' },
      }),
    );
    const r = await answer(text, emptyContext('food'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.ctx.requireParking).toBe(false);
    expect(parkAskedCards(r.reply.cards)).toHaveLength(0);
  });
});

describe('4. "Yol tarifi" after an ask without parking asks the parking question', () => {
  it('the typed English chip answers the question', async () => {
    await i18n.changeLanguage('en');
    setActiveCity('antalya');
    const deps = baseDeps();
    const ctx: ChatContext = {
      ...emptyContext('food'),
      parkAsk: { id: 'x', name: 'Ülkü Fırın', lat: 36.88, lng: 30.65 },
    };
    const yes = await answer(t('chat.parkAskYes'), ctx, deps);
    expect(yes.reply.cards.length).toBeGreaterThan(0);
    expect(yes.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
    const no = await answer(t('chat.parkAskNo'), ctx, deps);
    expect(no.reply.directions?.name).toBe('Ülkü Fırın');
  });
});

describe('2. a follow-up that points at the results stays with the results', () => {
  it.each([
    ['en yakını hangisi', 'nearest'],
    ['en yakın olan hangisi', 'nearest'],
    ['which one is the closest', 'nearest'],
    ['diğerleri', 'more'],
    ['başka var mı', 'more'],
    ['başka yerler de göster', 'more'],
    ['show me more', 'more'],
    ['any others?', 'more'],
    ['daha fazla göster', 'more'],
    ['ikincisi nerede acaba', 'nth'],
    ['listedeki ikinci yer nerede', 'nth'],
    ['2.si nerede', 'nth'],
    ['where is the second one', 'nth'],
    ['ilk sıradakine nasıl giderim', 'nth'],
    ['and the third one?', 'nth'],
  ])('"%s" is a pointer at the results (%s)', (text, kind) => {
    expect(resultsRefIn(text)?.kind).toBe(kind);
  });

  it.each([
    'daha yakın olsun',
    'başka bir köfteci var mı',
    'en yakın otopark',
    'ikinci el',
    'kadıköyde ikincisi',
  ])('"%s" is no pointer: the router reads it', (text) => {
    expect(resultsRefIn(text)).toBeNull();
  });

  async function listed(city: Parameters<typeof setActiveCity>[0], ask: string) {
    setActiveCity(city);
    const deps = routerSays(
      searchU({ district: 'Nilüfer', cat: 'breakfast', dish: 'serpme kahvaltı' }),
      chatU('Onu bilemem ama nereye gideceksen yer bulmakta iyiyim.'),
    );
    const first = await answer(ask, emptyContext('food'), deps);
    expect(first.reply.cards.length).toBeGreaterThan(0);
    return { deps, first };
  }

  it('"en yakını hangisi" (the router said chat): sorted nearest, the first card named', async () => {
    const { deps, first } = await listed('bursa', 'nilüferde serpme kahvaltı');
    const next = await answer('en yakını hangisi', first.ctx, deps);
    expect(next.reply.cards.length).toBeGreaterThan(0);
    expect(next.reply.text).not.toMatch(/bilemem/);
    expect(next.ctx.sort).toBe('distance');
    expect(next.reply.text).toContain(next.reply.cards[0]!.name);
    const d = next.reply.cards.map((c) => c.distanceM);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });

  it('"diğerleri" (the router said chat): the next places, none of the shown ones', async () => {
    const { deps, first } = await listed('bursa', 'nilüferde serpme kahvaltı');
    const shown = first.reply.cards.map((c) => c.id);
    const next = await answer('diğerleri', first.ctx, deps);
    expect(next.reply.cards.length).toBeGreaterThan(0);
    expect(next.reply.cards.some((c) => shown.includes(c.id))).toBe(false);
    const again = await answer('başka var mı', next.ctx, deps);
    const both = [...shown, ...next.reply.cards.map((c) => c.id)];
    expect(again.reply.cards.length).toBeGreaterThan(0);
    expect(again.reply.cards.some((c) => both.includes(c.id))).toBe(false);
  });

  it('"ikincisi nerede": the second card with its walk, and its own card to ask directions on', async () => {
    const { deps, first } = await listed('bursa', 'nilüferde serpme kahvaltı');
    const second = first.reply.cards[1]!;
    const next = await answer('ikincisi nerede acaba', first.ctx, deps);
    expect(next.reply.cards.map((c) => c.id)).toEqual([second.id]);
    expect(next.reply.text).toContain(second.name);
    expect(next.reply.text).toMatch(/dk/);
    expect(next.reply.text).toMatch(/Yol tarifi/);
  });

  it('English: "show me more" lists more places', async () => {
    await i18n.changeLanguage('en');
    const { deps, first } = await listed('bursa', 'nilüferde serpme kahvaltı');
    const next = await answer('show me more', first.ctx, deps);
    expect(next.reply.cards.length).toBeGreaterThan(0);
    expect(next.reply.text).toMatch(/more places|wider/i);
  });
});

describe('3. asks outside the app get an honest scope answer, never a fake search', () => {
  it.each([
    ['izmir', "Paris'te arabamı nereye bırakayım", { place: 'Paris', food: false }],
    ['bursa', 'restaurants in Mersin', { place: 'Mersin', food: true }],
    ['bursa', 'Mersin otopark', { place: 'Mersin', food: false }],
    ['izmir', "Konya'da arabamı nereye bırakayım", { place: 'Konya', food: false }],
    ['ankara', "Berlin'deki restoranlar", { place: 'Berlin', food: true }],
    ['antalya', 'where can I park in Samsun', { place: 'Samsun', food: false }],
    ['istanbul', 'Eskişehir yemek önerisi', { place: 'Eskişehir', food: true }],
  ])('%s: "%s" names the open cities and shows no card', async (city, text, over) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('food'), routerSays(searchU(over)));
    expect(r.reply.cards).toHaveLength(0);
    expect(r.reply.text).toMatch(/İzmir/);
    expect(r.reply.text).toMatch(/Antalya/);
    expect(r.reply.text).not.toMatch(/\d/);
  });

  it.each([
    ['izmir', 'oto yıkama nerede', { food: false }],
    ['istanbul', 'oto yikama nerde', { food: false }],
    ['antalya', 'find me an ATM', { food: true }],
    ['istanbul', 'en yakın benzinlik', { food: true }],
    ['izmir', 'dişçi arıyorum', { food: true }],
    ['izmir', 'çamaşırhane arıyorum', { food: false }],
    ['ankara', 'lastikçi arıyorum', { food: true }],
    ['izmir', 'nöbetçi eczane nerede', { food: true }],
  ])('%s: "%s" says food and car parks only, no card', async (city, text, over) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('food'), routerSays(searchU(over)));
    expect(r.reply.cards).toHaveLength(0);
    expect(r.reply.text).toMatch(/yemek yerleri ve otopark/);
    expect(r.reply.text.split('\n')).toHaveLength(1);
  });

  it('English UI: the scope answer is English', async () => {
    await i18n.changeLanguage('en');
    setActiveCity('antalya');
    const r = await answer('find me an ATM', emptyContext('food'), routerSays(searchU()));
    expect(r.reply.cards).toHaveLength(0);
    expect(r.reply.text).toMatch(/food places and car parks/);
  });

  it.each([
    ['izmir', 'adana kebap'],
    ['izmir', 'konak otopark'],
    ['bursa', 'hastane yanında otopark'],
    ['antalya', 'sinemadan önce bir şeyler yiyelim'],
  ])('%s: "%s" is still a real ask', async (city, text) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('food'), baseDeps());
    expect(r.reply.text).not.toMatch(/yalnızca yemek yerleri ve otopark|kapsamıyorum/);
  });
});

describe("5. a district typed with a slip is the city's own district", () => {
  it.each([
    ['antalya', 'çok yorgunum enerji verecek bir şey kepedze', 'Kepez'],
    ['antalya', 'kepedze', 'Kepez'],
    ['ankara', 'mamk balık', 'Mamak'],
    ['ankara', 'in maak bulk yapıyorum', 'Mamak'],
    ['izmir', 'buacda', 'Buca'],
    ['izmir', 'buacda balık', 'Buca'],
    ['istanbul', 'şişil köfte yerlerinin puanları ne', 'Şişli'],
    ['istanbul', 'şili park yeri', 'Şişli'],
  ])('%s: "%s" is %s, not the user\'s own location', async (city, text, district) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    // The router found nothing in the word (it answered the way it did in the run).
    const r = await answer(text, emptyContext('food'), routerSays(searchU({ nearMe: true })));
    expect(r.ctx.place?.label).toBe(district);
  });

  it('the router invented a district for a slip: the slip wins ("buacda", not Bayraklı)', async () => {
    setActiveCity('izmir');
    const r = await answer(
      'buacda serpme kahvaltı',
      emptyContext('food'),
      routerSays(searchU({ district: 'Bayraklı', cat: 'breakfast', dish: 'serpme kahvaltı' })),
    );
    expect(r.ctx.place?.label).toBe('Buca');
  });

  it("a slip the router wrote into district or place is the city's own district", () => {
    const value = (over: Partial<Search>) =>
      (searchU(over) as { value: Extract<Understanding, { kind: 'search' }> }).value;
    setActiveCity('izmir');
    const asPlace = settleDistrict(
      value({ place: 'buacda' }),
      'buacda balık',
      activeCity().districts,
    );
    expect(asPlace.district).toBe('Buca');
    expect(asPlace.place).toBeNull();
    setActiveCity('ankara');
    const asDistrict = settleDistrict(
      value({ district: 'mamk' }),
      'mamk balık',
      activeCity().districts,
    );
    expect(asDistrict.district).toBe('Mamak');
  });

  it('plain words next to a district are not slips', async () => {
    setActiveCity('izmir');
    for (const text of ['kimlik lazım', 'bayıldım köfteye', 'saniye saniye']) {
      const r = await answer(text, emptyContext('food'), baseDeps());
      expect(r.ctx.place?.label ?? null).not.toBe('Kınık');
      expect(r.ctx.place?.label ?? null).not.toBe('Bayındır');
    }
  });
});

describe('6. the lead describes the first card; a district with a dish is no name search', () => {
  it('free car parks first: the lead names the first shown car park, not the nearest', async () => {
    await i18n.changeLanguage('en');
    setActiveCity('ankara');
    const r = await answer(
      'WHERE CAN I PARK FOR FREE IN ÇANKAYA',
      emptyContext('park'),
      routerSays(searchU({ district: 'Çankaya', food: false, wishes: ['free'] })),
    );
    const first = r.reply.cards[0]!;
    expect(first.kind).toBe('parking');
    expect(r.reply.text).toContain(first.name);
    expect(r.reply.text).not.toMatch(/closest is/i);
  });

  it('konyaaltı balık searches fish in Konyaaltı', async () => {
    setActiveCity('antalya');
    const r = await answer(
      'konyaaltı balık',
      emptyContext('food'),
      routerSays(searchU({ district: 'Konyaaltı', cat: 'fish', dish: 'balık' })),
    );
    expect(r.ctx.place?.label).toBe('Konyaaltı');
    expect(r.ctx.cat).toBe('fish');
    expect(r.reply.cards.length).toBeGreaterThan(1);
  });
});

describe('7. a budget wish is acknowledged only with the honest no-price note', () => {
  const facts = {
    where: 'Beyoğlu',
    what: 'lahmacun',
    count: 73,
    items: [{ name: 'Cinaralti Lahmacun ve Kebap', walkMin: 4 }],
  };

  it.each([
    'Bütçe dostu lahmacun için iyi bir seçim!',
    'Bütçenize uygun bir yer bulalım.',
    'Ekonomik seçenekler arasından seçtim.',
    'Hesaplı bir lahmacun için güzel bir durak.',
  ])('rejects the promise "%s"', (text) => {
    expect(validateReply(text, facts, { userText: 'bütçe dostu olsun' })).toBeNull();
  });

  it('a question that repeats the wish stays allowed', () => {
    expect(
      validateReply('Bütçe dostu derken aklında hangisi var?', facts, {
        userText: 'bütçe dostu olsun',
      }),
    ).not.toBeNull();
  });

  it('the router tone may not promise a budget either', () => {
    const ctx = { names: [], districts: [] };
    expect(validateFreeText('tone', 'Bütçe dostu lahmacun için iyi bir seçim!', ctx)).toBeNull();
    expect(validateFreeText('tone', 'Bütçenize uygun bir yer bulalım.', ctx)).toBeNull();
  });

  it('the answer to "bütçe dostu olsun" carries the no-price note, not a promise', async () => {
    setActiveCity('istanbul');
    const first = routerSays(
      searchU({ district: 'Beyoğlu', cat: 'fast', dish: 'lahmacun' }),
      searchU({
        district: 'Beyoğlu',
        cat: 'fast',
        dish: 'lahmacun',
        wishes: ['cheap'],
        tone: 'Bütçe dostu lahmacun için iyi bir seçim!',
      }),
    );
    const one = await answer('beyoğlunda lahmacun', emptyContext('food'), first);
    const two = await answer('bütçe dostu olsun', one.ctx, first);
    expect(two.reply.text).not.toMatch(/bütçe dostu|bütçenize/i);
    expect(two.reply.text).toMatch(/Fiyat bilgimiz yok/);
  });
});

describe('8. the vehicle-parking pick note says nothing about price', () => {
  it.each(['tr', 'en'])('%s: the note names no fee claim', async (lang) => {
    await i18n.changeLanguage(lang);
    const note = t('chat.noInfoParkAi', {
      what: lang === 'tr' ? 'Araç yüksekliği' : 'vehicle height',
    });
    expect(claimsIn(note)).toEqual([]);
    expect(note).not.toMatch(/ücrete\b|price/i);
  });

  it('"ücretli / ücretsiz" and a pointer to the cards for the fee are no price claim', () => {
    expect(claimsIn('Üçü de ücretli görünüyor.', [], '', true)).toEqual([]);
    expect(claimsIn('Gece olduğu için kartlardan ücret durumuna bakmanı öneririm.')).toEqual([]);
    expect(claimsIn('Fiyatı 50 TL.')).not.toEqual([]);
  });
});

describe('11. no wording or note claims charging points', () => {
  it.each([
    'Şarj noktası bilgisini kartlarda kontrol etmeni öneririm.',
    'Elektrikli aracınız için rahat bir seçim yapalım.',
    'Charging stations are close by.',
  ])('rejects "%s"', (text) => {
    expect(validateReply(text, { where: 'Karşıyaka', count: 31, parkSearch: true })).toBeNull();
  });

  it('an electric-car ask gets the honest note and no charging claim', async () => {
    setActiveCity('izmir');
    const deps = routerSays(searchU({ district: 'Karşıyaka', food: false, wishes: [] }));
    const r = await answer(
      'elektrikli aracim var karsiyaka sarj noktali otopark',
      emptyContext('park'),
      deps,
    );
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.text).toMatch(/Şarj noktası bilgimiz yok/);
    expect(forbiddenClaims(r.reply.text, ['charging'])).toEqual([]);
  });
});

describe('13. a stay that is already said is never asked again', () => {
  it.each([
    ['ankara', 'etimesgutta bir saat park edecegim', 'Etimesgut'],
    ['bursa', 'osmangazi 3 saatliğine park yeri lazım', 'Osmangazi'],
  ])('%s: "%s" shows car parks at once', async (city, text, district) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const deps = routerSays(
      searchU({
        district,
        food: false,
        clarify: { ask: 'duration', text: 'Ne kadar kalacaksın?' },
      }),
    );
    const r = await answer(text, emptyContext('park'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
    expect(r.reply.text).not.toMatch(/Ne kadar kalacaksın/);
  });

  it('English: "i will stay 2 hours, car park in cankaya"', async () => {
    await i18n.changeLanguage('en');
    setActiveCity('ankara');
    const deps = routerSays(
      searchU({
        district: 'Çankaya',
        food: false,
        clarify: { ask: 'duration', text: 'How long will you stay?' },
      }),
    );
    const r = await answer('i will stay 2 hours, car park in cankaya', emptyContext('park'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('a stay that is not said is still asked', async () => {
    setActiveCity('ankara');
    const deps = routerSays(
      searchU({
        district: 'Çankaya',
        food: false,
        clarify: { ask: 'duration', text: null },
      }),
    );
    const r = await answer('çankayada park yeri lazım', emptyContext('park'), deps);
    expect(r.reply.cards).toHaveLength(0);
    expect(r.reply.text).toMatch(/Ne kadar kalacaksın/);
  });

  it.each([
    ['bir saat park edecegim', 60],
    ['2 saat', 120],
    ['yarım saat', 30],
    ['iki gün', 2880],
    ['i will stay 2 hours', 120],
    ['for an hour', 60],
    ['gece boyu', 720],
    ['saat 7de yemek', null],
    ['bir yer lazım', null],
  ])('"%s" is %s minutes', (text, min) => {
    expect(statedStayIn(text)).toBe(min);
  });
});

describe('12. the English app answers in English', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('a Turkish chat reply of the router is dropped for the English template', async () => {
    setActiveCity('antalya');
    const r = await answer(
      'thanks a lot',
      emptyContext('food'),
      routerSays(chatU('Rica ederim, afiyet olsun! Yerim Var asistanı her zaman yanında.')),
    );
    expect(looksTurkish(r.reply.text)).toBe(false);
    expect(r.reply.text).toMatch(/[A-Za-z]/);
  });

  it('a Turkish tone and clarify question of the router are dropped', async () => {
    setActiveCity('istanbul');
    const deps = routerSays(
      searchU({
        district: 'Beşiktaş',
        cat: 'dessert',
        dish: 'baklava',
        tone: 'Tatlı bir ara için harika bir seçim, keyfini çıkarın!',
      }),
    );
    const r = await answer('try beşiktaş instead', emptyContext('food'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.text).not.toMatch(/keyfini|harika bir seçim/);
  });

  it('a Turkish wording is rejected, an English one with a Turkish place name is not', () => {
    const facts = {
      where: 'Muratpaşa',
      count: 41,
      items: [{ name: 'Kuledibi Ocakbaşı', walkMin: 5 }],
    };
    const opts = { lang: 'en' as const, allow: ['Muratpaşa'] };
    expect(
      validateReply('Muratpaşa’da lahmacun için 41 yer buldum, afiyet olsun.', facts, opts),
    ).toBeNull();
    expect(
      validateReply('Pizza keyfi için birkaç seçenek daha hazırladım.', facts, opts),
    ).toBeNull();
    expect(
      validateReply('Found 41 spots in Muratpaşa; Kuledibi Ocakbaşı is a 5 min walk.', facts, opts),
    ).not.toBeNull();
  });

  it('the English prompts ask for English only', () => {
    expect(replyLangNote('en')).toMatch(/İngilizce/);
    expect(replyLangNote('tr')).toBe('');
    expect(langNote('en')).toMatch(/YALNIZCA İngilizce/);
  });

  it('every new reply text has an English version', () => {
    for (const key of [
      'chat.nearestIs',
      'chat.nearestIsFar',
      'chat.moreNone',
      'chat.nthPlace',
      'chat.nthOpen',
      'chat.nthClosed',
      'chat.nthNone',
      'chat.nthOrd_1',
      'chat.nthOrd_last',
      'chat.scopeCity',
      'chat.scopeThing',
      'chat.scopeThingDrive',
      'chat.districtTie',
      'chat.noInfoCharging',
      'chat.reply.hlParkFirst',
    ]) {
      const en = t(key, {
        name: 'X',
        count: 3,
        cities: 'A',
        a: 'A',
        b: 'B',
        ord: 'The first',
        state: '',
      });
      expect(en).not.toBe(key);
      expect(looksTurkish(en, ['X', 'A', 'B'])).toBe(false);
    }
  });

  it('the typed park question answers work in English', async () => {
    setActiveCity('izmir');
    const ctx: ChatContext = {
      ...emptyContext('food'),
      parkAsk: { id: 'x', name: 'Cafe', lat: 38.42, lng: 27.14 },
    };
    const no = await answer('No, open directions', ctx, baseDeps());
    expect(no.reply.directions?.name).toBe('Cafe');
    const yes = await answer('yes show car parks', ctx, baseDeps());
    expect(yes.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
  });
});

describe('10. emoji stand for words in the rules', () => {
  it.each([
    ['📍🅿️', 'yakınımda otopark'],
    ['🅿️?', 'otopark ?'],
    ['🅿️ kepez', 'otopark kepez'],
    ['🚗 kepez', 'otopark kepez'],
    ['🍕', 'pizza'],
    ['ataşehir 🥩 🅿️', 'ataşehir et otopark'],
  ])('"%s" reads as "%s"', (emoji, words) => {
    expect(emojiWords(emoji)).toBe(words);
  });

  it.each([
    ['izmir', '📍🅿️', null],
    ['izmir', '🅿️?', null],
    ['antalya', '🅿️ kepez', 'Kepez'],
  ])('%s: "%s" in the car park chat is a car park search', async (city, text, place) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('park'), baseDeps());
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
    expect(r.ctx.place?.label ?? null).toBe(place);
  });
});

describe('9. dishes of other languages are our dishes', () => {
  it.each([
    ['antalya', 'san sebastian cheesecake', 'cheesecake'],
    ['antalya', 'CANIM SAN SEBASTİAN ÇEKTİ KONYAALTIDA NEREYE GİDEYİM', 'san sebastian'],
    ['istanbul', 'Wo kann ich in bakırköy Frikadellen essen?', 'köfte'],
    ['istanbul', 'bakırköy meatballs', 'köfte'],
    ['istanbul', 'kadıköy gyros', 'döner'],
    ['istanbul', 'beyoğlu doner kebab', 'döner'],
    ['izmir', 'konak schawarma', 'döner'],
    ['izmir', 'konak pretzel', 'simit'],
    ['izmir', 'konak dumplings', 'mantı'],
    ['izmir', 'konak lasagne', 'lazanya'],
    ['izmir', 'konak fries', 'patates kızartması'],
  ])('%s: "%s" searches %s', async (city, text, dish) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(text, emptyContext('food'), baseDeps());
    expect(r.ctx.dish).toBe(dish);
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('"et" is the meat category, not a dish', async () => {
    setActiveCity('bursa');
    const r = await answer('et', emptyContext('food'), baseDeps());
    expect(r.ctx.cat).toBe('meat');
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('a named dish is not asked about as a mood ("tiramisu çekti")', async () => {
    setActiveCity('antalya');
    const r = await answer('canım tiramisu çekti', emptyContext('food'), baseDeps());
    expect(r.ctx.ask).toBeUndefined();
    expect(r.ctx.dish).toBe('tiramisu');
  });
});

describe('9b. a dish the router left empty is read from the text', () => {
  it.each([
    ['antalya', 'CANIM SAN SEBASTİAN ÇEKTİ KONYAALTIDA NEREYE GİDEYİM', 'Konyaaltı'],
    ['istanbul', 'san sebastian yemek istiyorum kadıköy civarı', 'Kadıköy'],
  ])('%s: "%s" searches the cheesecake in %s', async (city, text, district) => {
    setActiveCity(city as Parameters<typeof setActiveCity>[0]);
    const r = await answer(
      text,
      emptyContext('food'),
      routerSays(searchU({ district, food: true })),
    );
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.ctx.place?.label).toBe(district);
    expect(r.ctx.cat).toBe('dessert');
    expect(r.reply.text).not.toMatch(/bulamadım/);
  });
});

describe('exam fixes of the mega run (scorer and expectations)', () => {
  const obsOf = (over: Partial<ObservedTurn> = {}): ObservedTurn => ({
    input: 'x',
    tapMissing: false,
    routerCalls: 1,
    understood: null,
    routerFailed: false,
    text: '',
    cards: [],
    actions: [],
    ctx: {
      place: null,
      cat: null,
      dish: null,
      requireParking: false,
      freeParking: false,
      ask: null,
      choice: null,
    },
    wordings: [],
    infra: false,
    ...over,
  });
  const turn = (expect: TurnExpect): ConvoTurn => ({ input: { type: 'say', text: 'x' }, expect });
  const found = (
    over: Partial<Extract<Understanding, { kind: 'search' }>> = {},
  ): Understanding => ({
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
  });

  it('A. the English "no data" notes are honesty notes, not claims', () => {
    for (const text of [
      'We have no menu data; I picked kinds of places that may suit your request: kebab.',
      'We have no price data; I picked kinds of places that are usually quick and easy: doner.',
      "I don't have ratings; the list is sorted by how close parking is.",
    ]) {
      expect(claimsIn(text)).toEqual([]);
    }
    const s = scoreTurn(
      turn({ kind: 'food', cards: 'some', note: true }),
      obsOf({
        text: 'There are 5 restaurants around Şişli. We have no menu data; I picked kinds: ice cream.',
        cards: [{ kind: 'restaurant', name: 'Cafe', parkingM: null, distanceM: 200 }],
        understood: found(),
      }),
      new Set(),
    );
    expect(s.honesty.misses).toEqual([]);
  });

  it('A. an English hedge about menus ("on the menu by name") is no menu claim', () => {
    expect(
      claimsIn(
        'Here are 8 spots where the meatballs are on the menu by name, like Köfteci Çetin about 6 minutes away.',
        ['Köfteci Çetin'],
      ),
    ).toEqual([]);
  });

  it('B. a kind question of the router (ai) is as good as the table entry', () => {
    const labels = [KINDS.doner, KINDS.pide, KINDS.burger].map((m) => memberLabel(m, 'en'));
    const s = scoreTurn(
      turn({ kind: 'choice', ask: ['ai', 'quick'], hepsi: true, chipsMin: 2, cards: 'none' }),
      obsOf({
        ctx: { ...obsOf().ctx, ask: 'ai' },
        actions: [...labels, enText.chat.choice.all].map((label) => ({ kind: 'refine', label })),
        understood: found(),
      }),
      new Set(),
    );
    expect(s.choices.misses).toEqual([]);
  });

  it("B. every goal case that expects a question accepts the router's own kinds", () => {
    const asks = buildMegaCases(MEGA_SEED)
      .filter((c) => c.category === 'goals')
      .flatMap((c) => c.turns.map((tn) => tn.expect))
      .filter((e) => e.kind === 'choice' && e.ask);
    expect(asks.length).toBeGreaterThan(100);
    expect(asks.every((e) => e.ask!.includes('ai'))).toBe(true);
  });

  it('D. a landmark is placed by its name or its district', () => {
    const e: TurnExpect = {
      kind: 'park',
      cardKind: 'parking',
      placeHas: ['alsancak'],
      placeAlso: ['mustafa', 'denizli', 'stadyumu'],
      cards: 'some',
    };
    const cards = [{ kind: 'parking' as const, name: 'P', parkingM: null, distanceM: 200 }];
    const named = scoreTurn(
      turn(e),
      obsOf({ cards, understood: found({ food: false, place: 'Mustafa Denizli Stadyumu' }) }),
      new Set(),
    );
    expect(named.understanding.misses).toEqual([]);
    const other = scoreTurn(
      turn(e),
      obsOf({ cards, understood: found({ food: false, place: 'Kemeraltı' }) }),
      new Set(),
    );
    expect(other.understanding.misses.join()).toMatch(/place:/);
  });

  it('E. "kalabalık grup" with no number may be a party question, then results', () => {
    const s = scoreTurn(
      turn({ kind: 'food', orAsk: true, cards: 'some' }),
      obsOf({
        text: 'Kaç kişi olacaksınız?',
        actions: PARTY_LABELS.slice(0, 3).map((label) => ({ kind: 'refine', label })),
        understood: found(),
      }),
      new Set(),
    );
    expect(s.understanding.misses).toEqual([]);
  });

  it('F. "car park nearby (128 m)" is the car park\'s distance, not the place called near', () => {
    const far = [{ kind: 'restaurant' as const, name: 'SR DÖNER', parkingM: 128, distanceM: 2400 }];
    const out = distanceClaims(
      'The first place is far away: ~30 min walk. Alternative: SR DÖNER, car park nearby (128 m)',
      far,
    );
    expect(out.join()).not.toMatch(/calls a/);
    expect(distanceClaims('Nearby: SR DÖNER is a short hop.', far).join()).toMatch(
      /calls (a place over|the list near)/,
    );
  });
});
