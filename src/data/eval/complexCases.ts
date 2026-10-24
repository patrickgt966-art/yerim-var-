// The complex layer of the conversation evals: harder conversations for the fresh part of an adaptive
// exam (src/data/eval/adaptive.ts). They combine several things in one conversation: corrections on
// corrections, a plan that changes half way, a landmark instead of a district, several wishes at
// once, a switch of city, follow-ups that need the memory of the last answer ("en yakını hangisi"),
// a typo in the district and the dish, Turkish and English in one message, honest-limit traps
// (ratings, phone, a guaranteed space) inside a normal ask, and out-of-scope talk inside a valid one.
//
// Every expectation says only what the app already does (the same vocabulary and the same shapes as
// the mega set: TurnExpect, nothing new), so a different sensible answer passes. A case is level 2.
// Same seed (and wanted counts), same cases. The old templates stay in convoCases.ts / megaCases.ts.
import en from '@/i18n/en';
import tr from '@/i18n/tr';
import type { AiCityId, Wish } from '@/lib/ai/protocol';
import { CITY_QUARTERS } from '../quarters';
import { caseHash } from './adaptive';
import { CITY_IDS, asciiFold, dishByX, locative, makeRng, type Dish, type Rng } from './aiBigCases';
import {
  ASK_SPECS,
  ALL_ANSWERS,
  CORE_DISTRICTS,
  DISH_TYPOS,
  GREET_CHIPS,
  MORE_DISH_XS,
  answerTurn,
  asksFor,
  at,
  fill,
  food,
  low,
  say,
  tap,
  typo,
  wishesFor,
  type ConvoCase,
  type ConvoTurn,
  type TurnExpect,
} from './convoCases';
import { DISH_LANG, caps, voice } from './megaText';

type Ui = 'tr' | 'en';
type Ctx = { r: Rng; city: AiCityId; ui: Ui };
type Theme = {
  id: string;
  /** The category in the mega set and in the convo set. */
  mega: string;
  convo: string;
  style: string;
  section?: 'food' | 'park';
  /** The theme has English wording and may run in the English app. */
  en?: boolean;
  make: (c: Ctx) => ConvoTurn[];
};

// --- Words and expectations -------------------------------------------------------------------

const core = (city: AiCityId): readonly string[] => CORE_DISTRICTS[city] ?? [];
const pickD = (c: Ctx, not?: string): string => c.r.pick(core(c.city).filter((d) => d !== not));
/** A district where a food ask with parking has results (checked against the data, as the mega set does). */
const parkedD = (c: Ctx, x: string, not?: string): string =>
  c.r.pick(
    core(c.city).filter(
      (d) =>
        d !== not &&
        !(c.city === 'ankara' && d === 'Mamak') &&
        !(c.city === 'antalya' && d === 'Kepez' && x === 'döner'),
    ),
  );

const enName = (dish: Dish): string => DISH_LANG[dish.x]?.en ?? dish.x;
const nameOf = (c: Ctx, dish: Dish): string => (c.ui === 'en' ? enName(dish) : dish.x);

/** Dishes every core district has places for. */
const DISHES = ['balık', 'kebap', 'pide', 'lahmacun', 'döner', 'köfte', 'pizza', 'hamburger'].map(
  dishByX,
);
/** Dishes with a car park result in a core district. */
const PARKABLE = ['köfte', 'kebap', 'balık', 'pide', 'lahmacun', 'döner', 'pizza'].map(dishByX);
const VEGGIE_OK = new Set(['pide', 'lahmacun', 'pizza']);
const RARE = MORE_DISH_XS.map(dishByX);

const FOOD_ONLY = { requireParking: false, parkShown: false } as const;
const WITH_PARKING = { requireParking: true, parkShown: true } as const;

/** A food search in a district with results and no car park on the cards. */
const results = (d: string, dish: Dish | null, more: Partial<TurnExpect> = {}): TurnExpect =>
  food([d], dish, { cards: 'some', ...FOOD_ONLY, ...more });
/** A question about the earlier answer: no one reading is right, the reply and honesty checks apply. */
const OPEN: TurnExpect = { kind: 'food', free: true };

const THANKS_TR = ['teşekkürler', 'sağ ol', 'eyvallah', 'çok teşekkürler', 'sağolun'];
const THANKS_EN = ['thanks', 'thank you', 'thanks a lot', 'cheers'];
const farewell = (ui: Ui): TurnExpect => ({
  kind: 'greeting',
  noChips: ui === 'en' ? [en.chat.greetPark, en.chat.greetFood] : GREET_CHIPS,
  cards: 'none',
});
const thanks = (c: Ctx): ConvoTurn =>
  say(c.r.pick(c.ui === 'en' ? THANKS_EN : THANKS_TR), farewell(c.ui));

const ASK_TR = [
  '{L} {X} nerede yenir',
  '{L} iyi bir {X} yeri var mı',
  '{D} {X}',
  '{L} {X} yiyecek yer lazım',
  'canım {X} çekti {L} nereye gideyim',
];
const ASK_EN = [
  'where can I eat {X} in {D}',
  '{X} in {D} please',
  'any good {X} place in {D}?',
  'looking for {X} around {D}',
];
/** The first words of a search: the district, the dish (as written: it may carry a typo). */
const ask = (c: Ctx, d: string, dish: Dish, spoken: string = nameOf(c, dish)): string =>
  fill(c.r.pick(c.ui === 'en' ? ASK_EN : ASK_TR), d, spoken);
/** A search as a result expectation, said again: the next ask of a conversation. */
const newAsk = (c: Ctx, d: string, dish: Dish): ConvoTurn => say(ask(c, d, dish), results(d, dish));

/** Wishes the app reads from a short phrase, with the honest "no data" note on the results. */
const MODS: { tr: string; en: string; wish: Wish }[] = [
  { tr: 'ucuz olsun', en: 'make it cheap', wish: 'cheap' },
  { tr: 'manzaralı olsun', en: 'with a view please', wish: 'view' },
  { tr: 'sakin bir yer olsun', en: 'somewhere quiet please', wish: 'quiet' },
];
const OTHER_TR = ['başka var mı', 'başka yerler de göster', 'diğerleri'];
const OTHER_EN = ['any others?', 'show me more'];

const PARK_YES: TurnExpect = {
  kind: 'parkAsk',
  parkAsk: 'cars',
  cards: 'some',
  cardKind: 'parking',
};
const PARK_GO: TurnExpect = { kind: 'parkAsk', parkAsk: 'directions', cards: 'none' };

/** "Yol tarifi" on the first card, the offer of car parks, and the answer (a chip or typed). */
function directionsFlow(c: Ctx): ConvoTurn[] {
  const { r, ui } = c;
  const tapYes = ui === 'en' ? en.chat.parkAskYes : tr.chat.parkAskYes;
  const tapNo = ui === 'en' ? en.chat.parkAskNo : tr.chat.parkAskNo;
  const question: TurnExpect = {
    kind: 'parkAsk',
    parkAsk: 'question',
    cards: 'none',
    chips: [tapYes, tapNo],
  };
  const yes = r.chance(0.5);
  const typed =
    ui === 'en'
      ? yes
        ? ['yes', 'yeah', 'ok']
        : ['no', 'nope']
      : yes
        ? ['evet', 'olur', 'tamam', 'isterim', 'göster']
        : ['hayır', 'istemem', 'gerek yok', 'yürüyerek gidiyorum'];
  const go: ConvoTurn = {
    input: { type: 'directions', text: tr.chat.directions },
    expect: question,
  };
  const answer = r.chance(0.5)
    ? tap(yes ? tapYes : tapNo, yes ? PARK_YES : PARK_GO)
    : answerTurn(r.pick(typed), yes ? PARK_YES : PARK_GO);
  return [go, answer];
}

// --- Landmarks (real names of the data, as in the mega set) -----------------------------------

const LANDMARKS: Record<string, { n: string; w: string }[]> = {
  izmir: [
    { n: 'Kültürpark', w: 'kultur' },
    { n: 'Konak Meydanı', w: 'konak' },
    { n: 'Agora AVM', w: 'agora' },
    { n: 'Forum Bornova', w: 'forum' },
  ],
  istanbul: [
    { n: 'Zorlu Center', w: 'zorlu' },
    { n: 'Kanyon AVM', w: 'kanyon' },
    { n: 'Taksim Meydanı', w: 'taksim' },
    { n: 'Galata Kulesi', w: 'galata' },
  ],
  ankara: [
    { n: 'Atakule', w: 'atakule' },
    { n: 'Kızılay', w: 'kizilay' },
    { n: 'ANKAmall', w: 'ankamall' },
    { n: 'Panora AVM', w: 'panora' },
  ],
  bursa: [
    { n: 'Korupark', w: 'korupark' },
    { n: 'Heykel', w: 'heykel' },
    { n: 'Zafer Plaza', w: 'zafer' },
    { n: 'Anatolium', w: 'anatolium' },
  ],
  antalya: [
    { n: 'Kaleiçi', w: 'kaleici' },
    { n: 'Konyaaltı Plajı', w: 'konyaalti' },
    { n: 'Mall of Antalya', w: 'mall' },
    { n: 'MarkAntalya', w: 'markantalya' },
  ],
};

// --- The themes -------------------------------------------------------------------------------

/** "yok A değil… aslında B", then "aslında C ama ucuz", then "Kadıköy değil Moda": corrections on corrections. */
function correctionChain(c: Ctx): ConvoTurn[] {
  const { r, ui } = c;
  const [a, b, d3] = r.shuffle(DISHES) as [Dish, Dish, Dish];
  const d1 = pickD(c);
  const d2 = pickD(c, d1);
  const typed = ui === 'tr' && r.chance(0.35) ? r.pick(DISH_TYPOS[a.x] ?? [a.x]) : nameOf(c, a);
  const turns: ConvoTurn[] = [say(ask(c, d1, a, typed), results(d1, a))];
  turns.push(
    say(
      ui === 'en'
        ? r.pick([
            `no, not ${enName(a)}... actually ${enName(b)}`,
            `sorry, ${enName(b)} instead of ${enName(a)}`,
          ])
        : r.pick([
            `yok ${low(a.x)} değil… aslında ${low(b.x)}`,
            `${low(a.x)} değil ${low(b.x)} olsun`,
            `pardon ${low(b.x)} yiyelim, ${low(a.x)} değil`,
          ]),
      results(d1, b),
    ),
  );
  const mod = r.pick(MODS);
  turns.push(
    say(
      ui === 'en' ? `actually ${enName(d3)}, but ${mod.en}` : `aslında ${low(d3.x)} ama ${mod.tr}`,
      results(d1, d3, { wishes: [mod.wish], note: true }),
    ),
  );
  const quarters = (CITY_QUARTERS[c.city] ?? []).filter((q) => !q.common && q.d === d1);
  if (ui === 'tr' && quarters.length > 0 && r.chance(0.5)) {
    const q = r.pick(quarters);
    turns.push(say(`${low(d1)} değil ${locative(q.n)}`, food([q.n, d1], d3, FOOD_ONLY)));
  } else {
    turns.push(
      say(
        ui === 'en'
          ? `not ${d1}, try ${d2}`
          : r.pick([`${low(d1)} değil ${low(d2)}`, `yok ${low(d2)} olacaktı`]),
        results(d2, d3),
      ),
    );
  }
  if (r.chance(0.6)) {
    turns.push(
      say(
        ui === 'en'
          ? 'which was the second place you showed first'
          : 'ilk gösterdiğin ikinci yer neresiydi',
        OPEN,
      ),
    );
  }
  if (r.chance(0.7)) turns.push(thanks(c));
  return turns;
}

/** A plan with parking, then the time, the district, the dish and the party change on the way. */
function planChange(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const dish = r.pick(PARKABLE);
  const d = parkedD(c, dish.x);
  const dish2 = r.pick(PARKABLE.filter((x) => x !== dish));
  const d2 = parkedD(c, dish2.x, d);
  const d3 = pickD(c, d2);
  const dish3 = r.pick(DISHES.filter((x) => x !== dish2));
  const first = r.pick([
    `akşam 8'de ${locative(d)} ${dish.x} yiyeceğiz, otopark lazım`,
    `bu akşam ${locative(d)} ${dish.x} yiyelim otoparklı bir yer olsun`,
    `saat 7'de ${locative(d)} ${dish.x} yemek istiyoruz otopark şart`,
  ]);
  const turns: ConvoTurn[] = [
    say(first, food([d], dish, { cards: 'some', ...WITH_PARKING })),
    say(
      r.pick([
        `yok öğlene alalım, ${locative(d)} yine ${dish.x}`,
        `saati değiştirdik öğlen olsun, ${low(d)} ${dish.x}`,
      ]),
      food([d], dish, { cards: 'some' }),
    ),
    say(
      r.pick([
        `aslında ${locative(d2)} ${dish2.x} olsun`,
        `${low(d)} değil ${low(d2)}, ${dish2.x} yiyelim`,
      ]),
      food([d2], dish2, { cards: 'some' }),
    ),
    say(
      `${3 + r.int(6)} kişiyiz ${locative(d2)} ${dish2.x} arabayla geliyoruz`,
      food([d2], dish2, { cards: 'some' }),
    ),
    thanks(c),
    newAsk(c, d3, dish3),
  ];
  return turns;
}

/** Follow-ups that need the memory of the last answer, then a new ask after thanks. */
function backReference(c: Ctx): ConvoTurn[] {
  const { r, ui } = c;
  const [a, b] = r.shuffle(DISHES) as [Dish, Dish];
  const d = pickD(c);
  const d2 = pickD(c, d);
  const tr_ = (trs: string[], ens: string[]) => r.pick(ui === 'en' ? ens : trs);
  const turns: ConvoTurn[] = [
    newAsk(c, d, a),
    say(tr_(OTHER_TR, OTHER_EN), results(d, a)),
    say(
      tr_(
        ['ilk gösterdiğin ikinci yer neresiydi', 'en başta çıkan ikinci yer hangisiydi'],
        ['which was the second place you showed first', 'what was the first one again'],
      ),
      OPEN,
    ),
    say(
      tr_(['en yakını hangisi', 'bunların en yakını hangisi'], ['which one is the closest']),
      OPEN,
    ),
    say(
      tr_(['ikincisine yol tarifi', 'üçüncüye nasıl giderim'], ['directions to the second one']),
      OPEN,
    ),
  ];
  if (r.chance(0.6)) {
    turns.push(say(tr_(['otoparkı olanlar hangileri'], ['which of them have parking']), OPEN));
  }
  turns.push(thanks(c), newAsk(c, d2, b));
  return turns;
}

/** "En yakını", "otoparkı olanlar", the map offer with its answer, thanks, a new ask. */
function followMemory(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b] = r.shuffle(DISHES) as [Dish, Dish];
  const d = pickD(c);
  const d2 = pickD(c, d);
  return [
    newAsk(c, d, a),
    say(r.pick(['en yakını hangisi', 'yürüyerek en yakın hangisi']), OPEN),
    say(r.pick(['otoparkı olanlar hangileri', 'içlerinde otoparkı olan var mı']), OPEN),
    say(r.pick(OTHER_TR), results(d, a)),
    ...directionsFlow({ ...c, ui: 'tr' }),
    thanks({ ...c, ui: 'tr' }),
    say(`${locative(d2)} ${b.x} yiyelim`, results(d2, b)),
  ];
}

/** A chain across cities: ask, refine, switch city, refine, switch again, thanks. */
function cityHop(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const turns: ConvoTurn[] = [];
  let city = c.city;
  const refine = (d: string, dish: Dish): ConvoTurn => {
    const mod = r.pick(MODS);
    return r.chance(0.5)
      ? say(mod.tr, results(d, dish, { wishes: [mod.wish], note: true }))
      : say(r.pick(OTHER_TR), results(d, dish));
  };
  const d0 = pickD(c);
  const x0 = r.pick(DISHES);
  turns.push(newAsk(c, d0, x0), refine(d0, x0));
  const hops = 2 + r.int(2);
  for (let k = 0; k < hops; k++) {
    city = r.pick(CITY_IDS.filter((x) => x !== city));
    const d = r.pick(core(city));
    const x = r.pick(DISHES);
    turns.push(
      say(
        r.pick([`${locative(d)} ${x.x}`, `${low(d)} ${x.x}`, `${locative(d)} ${x.x} yiyelim`]),
        results(d, x),
        city,
      ),
    );
    if (r.chance(0.7)) turns.push(refine(d, x));
  }
  turns.push(thanks({ ...c, ui: 'tr' }));
  return turns;
}

const PARK_WISHES: { tr: string; en: string; wish: Wish }[] = [
  { tr: 'kapalı', en: 'covered', wish: 'covered' },
  { tr: '24 saat açık', en: 'open 24 hours', wish: 'nonstop' },
  { tr: 'ücretsiz', en: 'free', wish: 'free' },
];

/** Many constraints at once (district, dish, time, party, budget, diet, a car park wish) in one message or over turns. */
function constraintPile(c: Ctx): ConvoTurn[] {
  const { r, ui } = c;
  const dish = r.pick(PARKABLE);
  const d = parkedD(c, dish.x);
  const party = 3 + r.int(6);
  const park = r.pick(PARK_WISHES);
  const veggie = VEGGIE_OK.has(dish.x) && r.chance(0.5);
  if (r.chance(0.5)) {
    const time = r.pick(["akşam 8'de", 'bu akşam', 'yarın akşam', 'cumartesi öğlen']);
    const budget = r.pick(['ucuz olsun', 'hesaplı bir yer olsun', 'bütçe dostu olsun']);
    const text =
      ui === 'en'
        ? `table for ${party} in ${low(d)}, ${enName(dish)}, tonight, cheap, with ${park.en} parking${veggie ? ', vegetarian options' : ''}`
        : `${time} ${locative(d)} ${party} kişiyiz ${dish.x} yiyeceğiz, ${park.tr} otoparklı ${budget}${veggie ? ', etsiz de olsun' : ''}`;
    return [say(text, food([d], dish, { cards: 'some', ...WITH_PARKING })), thanks(c)];
  }
  return [
    newAsk(c, d, dish),
    say(
      ui === 'en' ? 'cheap please' : r.pick(['ucuz olsun', 'hesaplı olsun']),
      results(d, dish, { wishes: ['cheap'], note: true }),
    ),
    say(
      ui === 'en'
        ? `we are ${party} people, around 8 tonight${veggie ? ', something vegetarian' : ''}`
        : `${party} kişiyiz, akşam 8 gibi${veggie ? ', etsiz bir şey olsun' : ''}`,
      OPEN,
    ),
    say(
      ui === 'en' ? `with ${park.en} parking please` : `${park.tr} otoparklı olsun`,
      food([d], dish, { requireParking: true }),
    ),
    thanks(c),
  ];
}

/** Several car park wishes at once, a third one added, then a landmark and a duration. */
function parkingPile(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b, third] = r.shuffle(PARK_WISHES) as [
    (typeof PARK_WISHES)[number],
    (typeof PARK_WISHES)[number],
    (typeof PARK_WISHES)[number],
  ];
  const d = pickD(c);
  const lm = r.pick(LANDMARKS[c.city] ?? []);
  const nameWords = lm.n
    .toLocaleLowerCase('tr')
    .split(' ')
    .flatMap((w) => (w.length >= 4 ? [w, w.slice(0, 4)] : []));
  return [
    say(
      r.pick([
        `${locative(d)} hem ${a.tr} hem ${b.tr} otopark lazım`,
        `${low(d)} ${a.tr} ve ${b.tr} bir otopark var mı`,
      ]),
      { kind: 'park', cardKind: 'parking', place: [d], wishes: [a.wish, b.wish], cards: 'some' },
    ),
    say(`${third.tr} olanı var mı`, {
      kind: 'park',
      cardKind: 'parking',
      place: [d],
      wishes: [third.wish],
    }),
    say(`peki ${lm.n} yakını`, {
      kind: 'park',
      cardKind: 'parking',
      placeHas: [lm.w],
      placeAlso: nameWords,
      cards: 'some',
    }),
    say(`${locative(d)} 3 saat park edeceğim`, {
      kind: 'park',
      cardKind: 'parking',
      place: [d],
      cards: 'some',
    }),
    thanks({ ...c, ui: 'tr' }),
  ];
}

const MIXED = [
  '{L} best {E} nerede var',
  '{D} civarında good {E} place arıyorum',
  'hey {D} da {E} yemek istiyorum please',
  '{L} bir {E} spot önerir misin',
  'merhaba, i am hungry, {L} {X} var mı',
  'bugün çok yoğunum, {D} tarafında quick {E} lazım',
];

/** Turkish and English in one message, a dictated run-on, a correction in the other language. */
function mixedTalk(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b] = r.shuffle(DISHES) as [Dish, Dish];
  const d = pickD(c);
  const template = r.pick(MIXED);
  const first =
    r.int(3) === 0
      ? voice(
          r,
          `${locative(d)} ${a.x} yiyeceğiz ${3 + r.int(5)} kişiyiz arabayla geliyoruz bir bak`,
        )
      : fill(template, d, template.includes('{E}') ? enName(a) : a.x);
  const turns: ConvoTurn[] = [
    say(first, results(d, a)),
    say(
      r.pick([
        `no sorry, ${low(a.x)} değil, I meant ${enName(b)}`,
        `wait, aslında ${enName(b)} olsun`,
        `hayır hayır ${low(b.x)}, ${enName(a)} değil`,
      ]),
      results(d, b),
    ),
  ];
  if (r.chance(0.6)) turns.push(say(r.pick(['closer please', 'daha yakın olsun']), results(d, b)));
  if (r.chance(0.5)) turns.push(say(r.pick(THANKS_EN), farewell('en')));
  return turns;
}

/** One conversation, three ways of writing: no Turkish letters, then CAPS, then a dictated run-on. */
function styleShift(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b, d3] = r.shuffle(DISHES) as [Dish, Dish, Dish];
  const d = pickD(c);
  const d2 = pickD(c, d);
  const mod = r.pick(MODS);
  return [
    say(asciiFold(ask({ ...c, ui: 'tr' }, d, a)), results(d, a)),
    say(caps(r, `yok ${low(a.x)} değil ${low(b.x)} olsun`), results(d, b)),
    say(
      voice(r, `${locative(d2)} ${d3.x} olsun ${mod.tr}`),
      results(d2, d3, { wishes: [mod.wish], note: true }),
    ),
    ...(r.chance(0.6) ? [thanks({ ...c, ui: 'tr' })] : []),
  ];
}

/** A typo in the district and in the dish, and a second dish with a typo of its own. */
function doubleTypo(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const withTypo = DISHES.filter((x) => DISH_TYPOS[x.x]);
  const [a, b] = r.shuffle(withTypo) as [Dish, Dish];
  const d = pickD(c);
  const badD = d.length >= 5 ? typo(r, d) : low(d);
  const bad = (x: Dish) => r.pick(DISH_TYPOS[x.x] ?? [x.x]);
  const d2 = pickD(c, d);
  return [
    say(
      r.pick([
        `${locative(badD)} ${bad(a)} nerede yenir`,
        `${badD} ${bad(a)} var mı`,
        `${locative(badD)} iyi bir ${bad(a)} yeri lazım`,
      ]),
      results(d, a),
    ),
    say(r.pick([`yok ${bad(b)} olsun`, `aslında ${bad(b)} yiyelim`]), results(d, b)),
    say(
      d2.length >= 5 ? `${typo(r, d2)} tarafında bakalım` : `${low(d2)} tarafında bakalım`,
      results(d2, b),
    ),
    ...(r.chance(0.6) ? [thanks({ ...c, ui: 'tr' })] : []),
  ];
}

/** A normal ask with an honest-limit trap inside: ratings, phone, hours, booking, price, menu, a guaranteed space. */
function honestyTraps(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const dish = r.pick(DISHES);
  const d = pickD(c);
  const traps: { texts: string[]; expect: TurnExpect }[] = [
    {
      texts: ['en iyisi hangisi, kaç yıldız', 'puanı en yüksek olan hangisi'],
      expect: { kind: 'food', free: true, noClaim: ['best'] },
    },
    {
      texts: ['telefon numarasını verir misin', 'hangisini arayabilirim numarası ne'],
      expect: { kind: 'food', free: true, noClaim: ['phone'] },
    },
    {
      texts: ['kaça kadar açık', 'pazar günü açık mı bunlar'],
      expect: { kind: 'food', free: true, noClaim: ['hours'] },
    },
    {
      texts: ['masa ayırtır mısın', 'akşam için rezervasyon yap'],
      expect: { kind: 'food', free: true, noClaim: ['reservation'] },
    },
    { texts: ['kişi başı ne kadar tutar', 'fiyatları ne kadar'], expect: OPEN },
    { texts: ['menüde ne var', 'menüsünü gösterir misin'], expect: OPEN },
  ];
  const turns: ConvoTurn[] = [];
  if (r.chance(0.5)) {
    const trap = r.pick(traps.slice(0, 4));
    turns.push(
      say(`${locative(d)} en iyi ${dish.x} hangisi, ${r.pick(trap.texts)}`, {
        kind: 'food',
        free: true,
        noClaim: [...new Set([...(trap.expect.noClaim ?? []), 'best' as const])],
      }),
    );
  } else {
    turns.push(newAsk(c, d, dish));
  }
  for (const trap of r.shuffle(traps).slice(0, 2 + r.int(2))) {
    turns.push(say(r.pick(trap.texts), trap.expect));
  }
  const d2 = pickD(c, d);
  turns.push(
    say(`garanti boş yer olan bir otopark da lazım ${locative(d2)}`, {
      kind: 'park',
      cardKind: 'parking',
      place: [d2],
      cards: 'some',
      noClaim: ['guarantee'],
    }),
    thanks({ ...c, ui: 'tr' }),
  );
  return turns;
}

/** Talk outside the app's scope inside a valid ask, then plain off-topic talk, then back to the search. */
function scopeInside(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b] = r.shuffle(DISHES) as [Dish, Dish];
  const d = pickD(c);
  const d2 = pickD(c, d);
  const inside: { text: string; more: Partial<TurnExpect> }[] = [
    { text: `${locative(d)} ${a.x} yiyeceğiz bir de yarın hava nasıl olacak`, more: {} },
    { text: `${locative(d)} ${a.x} nerede yenir, dolar kaç lira`, more: {} },
    {
      text: `başım ağrıyor hangi ilaç iyi gelir, bir de ${locative(d)} ${a.x} lazım`,
      more: { noClaim: ['medical'] },
    },
    { text: `${locative(d)} ${a.x} bul, sonra bana bir şiir yaz`, more: {} },
  ];
  const pick = r.pick(inside);
  return [
    say(pick.text, { kind: 'food', free: true, ...pick.more }),
    say(r.pick(['bana bir fıkra anlat', 'sen kimsin, hangi modelsin', 'ankaranın nüfusu kaç']), {
      kind: 'offtopic',
      cards: 'none',
    }),
    say(`peki ${locative(d2)} ${b.x}`, results(d2, b)),
    thanks({ ...c, ui: 'tr' }),
  ];
}

/** A goal with a district, the kinds question and a tapped or typed kind, a change of district, a new dish. */
function goalChain(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const spec = r.pick(ASK_SPECS);
  const d = pickD(c);
  const d2 = pickD(c, d);
  const dish = r.pick(DISHES);
  const text = `${locative(d)} ${r.pick(spec.texts)}`;
  const asked: TurnExpect = {
    kind: 'choice',
    ask: [...asksFor(spec, text), 'ai'],
    hepsi: true,
    chipsMin: 2,
    cards: 'none',
    ...(spec.wishes.length > 0 ? { wishes: wishesFor(spec, text) } : { cat: ['dessert', null] }),
    place: [d],
  };
  const t = r.pick(spec.taps);
  const found: TurnExpect = {
    kind: 'food',
    member: t.member,
    cards: 'some',
    ...(spec.note ? { note: true } : {}),
  };
  return [
    say(text, asked),
    r.chance(0.5)
      ? tap(t.label, found)
      : r.chance(0.5)
        ? answerTurn(t.word, found)
        : answerTurn(r.pick(ALL_ANSWERS), { ...found, member: 'all' }),
    say(`bir de ${locative(d2, true)} bak`, { kind: 'food', place: [d2], cards: 'some' }),
    thanks({ ...c, ui: 'tr' }),
    newAsk({ ...c, ui: 'tr' }, d, dish),
  ];
}

/** Rarer dishes, changed twice, and a question about the answer. */
function dishChain(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b, d3] = r.shuffle(RARE) as [Dish, Dish, Dish];
  const d = pickD(c);
  return [
    say(fill(r.pick(ASK_TR), d, a.x), food([d], a)),
    say(r.pick([`yok ${low(a.x)} değil ${low(b.x)}`, `${low(b.x)} olsun aslında`]), food([d], b)),
    say(r.pick([`peki ${low(d3.x)} var mı`, `${low(d3.x)} da olur`]), food([d], d3)),
    say('en yakını hangisi', OPEN),
    thanks({ ...c, ui: 'tr' }),
  ];
}

const NOISE = ['asdf jkjk', 'hmm ... ??', 'ııı şey neyse', 'xyz aaa', '!!! ???'];
const nothing: TurnExpect = { kind: 'none', cards: 'none' };

/** Noise between two real asks: the search of the first is not lost, nothing is made up of the noise. */
function noiseBetween(c: Ctx): ConvoTurn[] {
  const { r } = c;
  const [a, b] = r.shuffle(DISHES) as [Dish, Dish];
  const d = pickD(c);
  const d2 = pickD(c, d);
  return [
    newAsk({ ...c, ui: 'tr' }, d, a),
    say(r.pick(NOISE), nothing),
    newAsk({ ...c, ui: 'tr' }, d2, b),
    say(r.pick(NOISE), nothing),
    thanks({ ...c, ui: 'tr' }),
  ];
}

export const COMPLEX_THEMES: readonly Theme[] = [
  {
    id: 'correction_chain',
    mega: 'multi',
    convo: 'split',
    style: 'corrections',
    en: true,
    make: correctionChain,
  },
  { id: 'plan_change', mega: 'plans', convo: 'split', style: 'plan', make: planChange },
  {
    id: 'back_reference',
    mega: 'multi',
    convo: 'food',
    style: 'memory',
    en: true,
    make: backReference,
  },
  { id: 'follow_memory', mega: 'multi', convo: 'both', style: 'memory', make: followMemory },
  { id: 'city_hop', mega: 'multi', convo: 'city_switch', style: 'cities', make: cityHop },
  {
    id: 'constraint_pile',
    mega: 'plans',
    convo: 'both',
    style: 'constraints',
    en: true,
    make: constraintPile,
  },
  {
    id: 'parking_pile',
    mega: 'parking',
    convo: 'park',
    style: 'constraints',
    section: 'park',
    make: parkingPile,
  },
  { id: 'mixed_talk', mega: 'style', convo: 'food', style: 'mixed', en: true, make: mixedTalk },
  { id: 'style_shift', mega: 'style', convo: 'food', style: 'shift', make: styleShift },
  { id: 'double_typo', mega: 'dishes', convo: 'food', style: 'typo', make: doubleTypo },
  { id: 'honesty_traps', mega: 'honesty', convo: 'no_data', style: 'traps', make: honestyTraps },
  { id: 'scope_inside', mega: 'honesty', convo: 'offtopic', style: 'scope', make: scopeInside },
  { id: 'goal_chain', mega: 'goals', convo: 'choice', style: 'goal', make: goalChain },
  { id: 'dish_chain', mega: 'dishes', convo: 'food', style: 'corrections', make: dishChain },
  { id: 'noise_between', mega: 'edge', convo: 'offtopic', style: 'noise', make: noiseBetween },
];

const HOURS = {
  morning: [7, 8, 9, 10],
  noon: [11, 12, 13, 14],
  evening: [18, 19, 20, 21, 22],
  night: [1, 2, 3, 4],
};
const anyHour = (r: Rng): number => {
  const x = r.int(100);
  return r.pick(
    x < 25 ? HOURS.morning : x < 50 ? HOURS.noon : x < 85 ? HOURS.evening : HOURS.night,
  );
};

/** The categories the complex layer has themes for, in a set. */
export const complexCategories = (set: 'mega' | 'convo' = 'mega'): string[] => [
  ...new Set(COMPLEX_THEMES.map((t) => t[set])),
];

/**
 * Complex conversations: `want[category]` of them per category (fewer when a category has no theme
 * or runs out of new ideas), none whose conversation hash is in `avoid`, none twice. Every case is
 * level 2. Same seed, same wants, same cases.
 */
export function buildComplexCases(
  seed: number,
  want: Readonly<Record<string, number>>,
  set: 'mega' | 'convo' = 'mega',
  avoid: ReadonlySet<string> = new Set(),
): ConvoCase<string>[] {
  const r = makeRng((seed ^ 0x2c1b3c6d) >>> 0);
  const out: ConvoCase<string>[] = [];
  const seen = new Set(avoid);
  const names = new Set<string>();
  for (const cat of Object.keys(want)) {
    const themes = COMPLEX_THEMES.filter((t) => t[set] === cat);
    const n = want[cat] ?? 0;
    if (themes.length === 0 || n <= 0) continue;
    let made = 0;
    for (let k = 0; made < n && k < n * 30 + 30; k++) {
      const theme = at(themes, k);
      const city = r.pick(CITY_IDS);
      const ui: Ui = theme.en && r.chance(0.12) ? 'en' : 'tr';
      const turns = theme.make({ r, city, ui }).slice(0, 10);
      const candidate: ConvoCase<string> = {
        name: '',
        category: cat,
        sub: theme.id,
        style: theme.style,
        city,
        section: theme.section ?? 'food',
        hour: anyHour(r),
        ui,
        located: !r.chance(0.28),
        level: 2,
        turns,
      };
      const h = caseHash(candidate);
      if (seen.has(h)) continue;
      seen.add(h);
      const first = turns[0]?.input.text ?? '';
      const short = first.length > 44 ? `${first.slice(0, 41)}...` : first;
      let name = `${cat}: [${city}] ${short}`;
      for (let j = 2; names.has(name); j++) name = `${cat}: [${city}] ${short} #${j}`;
      names.add(name);
      out.push({ ...candidate, name });
      made++;
    }
  }
  return out;
}
