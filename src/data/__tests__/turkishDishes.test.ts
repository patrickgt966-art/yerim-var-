import '@/i18n';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { commonShop, dishProfile, GENERIC_DISH_STEMS, likelyServes, typicalMatch } from '../dishes';
import { CITY_STYLES, ORDER_WORDS } from '../foodLexicon';
import { distanceMeters } from '../geo';
import { IZMIR_DISTRICTS, parseQuery } from '../intent';
import { isInIzmirArea } from '../places';
import { dishStem, getRestaurant, type FoodCategory } from '../restaurants';
import { fold, searchPlaces } from '../search';
import { staticParkings } from '../staticParkings';

// AI off, plain keys as text: the reply must be a food answer with cards, never a "what is this?" reply.
const deps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings: staticParkings(),
  t: (k) => k,
};

const DISHES_TR = [
  'lahmacun,pide,kıymalı pide,kuşbaşılı pide,kaşarlı pide,karışık pide,yumurtalı pide,sucuklu pide,etli ekmek',
  'döner,et döner,tavuk döner,iskender,dürüm,tavuk dürüm,et dürüm,çiğ köfte,hamburger,pizza,tost,ayvalık tostu',
  'kumpir,kokoreç,midye,midye dolma,midye tava,balık ekmek,kumru,boyoz,gevrek,simit,poğaça,açma',
  'börek,su böreği,kol böreği,sigara böreği,çiğ börek,gözleme,bazlama,pişi,menemen,sucuklu yumurta',
  'sahanda yumurta,çılbır,mıhlama,kuymak,serpme kahvaltı,kahvaltı,katmer,adana kebap,urfa kebap,adana,urfa',
  'şiş kebap,kuzu şiş,tavuk şiş,ciğer şiş,beyti,ali nazik,testi kebabı,patlıcan kebabı,kağıt kebabı',
  'cağ kebabı,tokat kebabı,bursa kebabı,büryan,kuyu kebabı,halep işi,fırın kebabı,orman kebabı,tas kebabı',
  'çökertme,kebap,ızgara,karışık ızgara,pirzola,kuzu pirzola,kanat,tavuk kanat,köfte,ızgara köfte',
  'izmir köfte,kasap köfte,akçaabat köfte,inegöl köfte,kuru köfte,köfte ekmek,piyaz,ciğer,arnavut ciğeri',
  'tava ciğer,kelle,kelle paça,paça,işkembe,işkembe çorbası,mercimek çorbası,ezogelin,tarhana çorbası',
  'yayla çorbası,domates çorbası,tavuk çorbası,şehriye çorbası,düğün çorbası,beyran,çorba,tantuni',
  'sac kavurma,kavurma,kuşbaşı,kuzu tandır,tandır,kuzu incik,mantı,kuru fasulye,taze fasulye,nohut',
  'etli nohut,pilav,tavuk pilav,nohutlu pilav,pilav üstü,bulgur pilavı,perde pilavı,dolma,sarma',
  'yaprak sarma,lahana sarması,karnıyarık,imam bayıldı,hünkar beğendi,güveç,kuzu güveç,mücver',
  'içli köfte,mercimek köftesi,kısır,zeytinyağlı,enginar,türlü,keşkek,hingel,ev yemeği,çipura,levrek',
  'hamsi,kalamar,karides,ahtapot,lüfer,barbun,istavrit,sardalya,uskumru,palamut,somon,alabalık,kalkan',
  'mezgit,çinekop,kefal,balık,meze,rakı,bira,baklava,künefe,sütlaç,kazandibi,dondurma,profiterol,waffle',
  'krep,lokma,tulumba,revani,şekerpare,kadayıf,supangle,aşure,güllaç,keşkül,tavuk göğsü,irmik helvası',
  'helva,kemalpaşa tatlısı,trileçe,tiramisu,cheesecake,san sebastian,pasta,kurabiye,türk kahvesi',
  'filtre kahve,çay,salep,boza,sosisli,patso,sandviç,şırdan,mumbar,kuzu kokoreç,söğüş,pastırma,sucuk',
  'cantık,su muhallebisi,muhallebi,kabak tatlısı,ayva tatlısı,höşmerim,cevizli sucuk,lahmacun dürüm',
  'ciğer dürüm,kokoreç dürüm,et sote,tavuk sote,çoban salata,gavurdağı salatası,ezme,humus,haydari',
  'acılı ezme,patlıcan salatası,kuzu kapama,saray sarması,yuvarlama,analı kızlı,lebeniye,ekşili köfte',
  'sulu köfte,tepsi kebabı,kebap çeşitleri,ızgara balık,balık tava,hamsi tava,kalamar tava',
  'karides güveç,deniz mahsulleri,şalgam',
]
  .join(',')
  .split(',');

// Regional and street dishes of Turkey (deduplicated against the list above).
const REGIONAL = [
  'babagannuş,bamya,bomba,bulgur köftesi,cacık,cevizli erişte,ciroz,ciğer kebabı,deniz börülcesi',
  'dibek kahvesi,erişte,et,etli yaprak sarma,fava,firik pilavı,hamsi buğulama,hamsi köftesi',
  'hamsili pilav,haşhaş kebabı,isot,kabak çiçeği dolması,kaburga dolması,kara lahana sarması',
  'karalahana çorbası,kaygana,kayseri mantısı,kaytaz böreği,keme kebabı,kerebiç,kestane şekeri',
  'kumru sandviç,kuşburnu,lakerda,laz böreği,levrek ızgara,makarna,menengiç kahvesi',
  'mercimek,muhammara,muhlama,mırra,mısır ekmeği,omlet,pestil,pideli köfte,radika,rus salatası',
  'sac böreği,sakızlı muhallebi,salata,sembusek,simit kebabı,soğan kebabı,sushi,tarhana',
  'tatlı,tavuk,tirit,topik,trabzon ekmeği,uskumru dolma,yanıç,yağlama,zeytinyağlı enginar',
  'çipura ızgara,çiroz,çiğ köfte dürüm,çökertme kebabı,şakşuka,şambali,şevketi bostan',
  'şiş,şıllık',
]
  .join(',')
  .split(',');

// Dishes in no dish list: they resolve through the head noun or the Turkish food lexicon.
const UNLISTED = [
  'pirinç pilavı,armut tatlısı,sebzeli pilav,iç pilav,ıspanaklı börek,patatesli börek,peynirli pide',
  'ıspanaklı pide,kıymalı börek,tavuk kavurma,tavuk sote,et sote,kuzu kavurma,kuru köfte,dalyan köfte',
  'hasanpaşa köfte,çiftlik kebabı,islim kebabı,kiremitte köfte,kiremitte tavuk,tavuk kanat,tavuk izgara',
  'ızgara tavuk,piliç,piliç çevirme,tavuk çevirme,kokoreç ekmek,yarım ekmek döner,porsiyon döner',
  'pilav üstü döner,iskender döner,kaşarlı tost,karışık tost,sucuklu tost,kumru tost,simit tost',
  'patates kızartması,soğan halkası,mısır,kestane,midye tava,kalamar,balık çorbası,kelle söğüş,beyin,dil',
  'kuzu kelle,paça çorbası,tavuk suyu,mantar çorbası,sebze çorbası,mercimek,yeşil mercimek',
  'barbunya pilaki,pilaki,fasulye pilaki,taze fasulye,bezelye,ıspanak,pırasa,kereviz,karnabahar,mücver',
  'patlıcan musakka,musakka,kabak dolması,biber dolması,etli dolma,sarma dolma,yaprak dolma',
  'lahmacun ayran,ayran,limonata,şerbet,kahve,türk kahvesi,çay,sahlep,dondurmalı irmik helvası',
  'fırın sütlaç,ekmek kadayıfı,tel kadayıf,burma kadayıf,fıstıklı baklava,cevizli baklava,şöbiyet',
  'sarı burma,dilber dudağı,vezir parmağı,kalburabastı,tulumba tatlısı,ekler,pasta,yaş pasta',
  'doğum günü pastası,cheesecake,kurabiye,poğaça,açma,simit,çatal,kandil simidi,bagel,gözleme',
  'patatesli gözleme,peynirli gözleme,kahvaltı tabağı,köy kahvaltısı,serpme,sucuk ekmek,köfte ekmek',
  'balık ekmek,midye',
]
  .join(',')
  .split(',');

const ALL = [...DISHES_TR, ...REGIONAL];

/** Turkish letters typed on an ASCII keyboard: ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c. */
const toAscii = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

const ASCII = [...new Set(ALL.map(toAscii))].filter((a) => !ALL.includes(a));

/**
 * Every phrasing takes ~11 minutes, too slow for each CI run, so CI checks the
 * dish alone and with a district; `npm run test:dishes` runs them all.
 */
const FULL = process.env.DISH_AUDIT === 'full';

const phrasings = (dish: string) =>
  FULL
    ? [
        dish,
        `${dish} yemek istiyorum`,
        `Bornova'da ${dish}`,
        `canım ${dish} çekti`,
        `${dish} yiyelim`,
        `en yakın ${dish}`,
      ]
    : [dish, `Bornova'da ${dish}`];

const BAD_TEXT = ['chat.placeNotFound', 'dishUnknown', 'dishOrPlace', 'dishNotFound', 'foodNone'];

/** The top card is a place whose name or cuisine fits the dish's profile, a shop type that usually has it, or names a word of the dish. */
function topCardFits(dish: string, cardId: string, cardName: string): boolean {
  const profile = dishProfile(fold(dish));
  // A generic word ("ev yemeği", "balık") is a plain category answer, not a dish match.
  if (!profile || GENERIC_DISH_STEMS.has(dishStem(fold(dish)))) return true;
  const name = fold(cardName);
  const cuisines = getRestaurant(cardId)?.cuisines ?? [];
  if (likelyServes(profile, name, cuisines) || commonShop(profile, name)) return true;
  return fold(dish)
    .split(' ')
    .some((w) => w.length >= 3 && name.includes(w));
}

/**
 * `allowUnknown`: a dish only the lexicon knows may be answered with the honest "no place is
 * sure to make it" text, as long as the nearby places of its category come as cards.
 */
async function failures(
  dishes: string[],
  skip: Record<string, string[]> = {},
  allowUnknown = false,
): Promise<string[]> {
  const badText = allowUnknown ? BAD_TEXT.filter((w) => w !== 'dishUnknown') : BAD_TEXT;
  const bad: string[] = [];
  for (const dish of dishes) {
    for (const q of phrasings(dish)) {
      if (skip[dish]?.includes(q)) continue;
      const it = parseQuery(q);
      if (it.kind !== 'search') {
        bad.push(`${q}: parseQuery kind ${it.kind}`);
        continue;
      }
      const { reply } = await answer(q, emptyContext('food'), deps);
      const text = reply.text;
      if (text.startsWith('chat.placeNotFound') || badText.some((w) => text.includes(w))) {
        bad.push(`${q}: ${text}`);
      } else if (reply.cards.length === 0) {
        bad.push(`${q}: no cards (${text})`);
      } else {
        const top = reply.cards[0]!;
        if (top.kind !== 'restaurant') bad.push(`${q}: first card is not a place`);
        else if (!text.includes('dishUnknown') && !topCardFits(dish, top.id, top.name))
          bad.push(`${q}: irrelevant top card ${top.name}`);
      }
    }
  }
  return bad;
}

describe('Turkish dishes with the AI off', () => {
  it('has no duplicate dishes in the lists', () => {
    expect(ALL.length - new Set(ALL).size).toBe(0);
  });

  it('answers every dish with a food reply and cards', async () => {
    expect(await failures(ALL, {})).toEqual([]);
  }, 1_800_000);

  it('answers the ASCII-typed variants too', async () => {
    expect(await failures(ASCII, {})).toEqual([]);
  }, 1_800_000);
});

describe('Turkish dishes in no list', () => {
  it('has no duplicate dishes in the list', () => {
    expect(UNLISTED.length - new Set(UNLISTED).size).toBe(0);
  });

  it('answers every one with a food reply and cards, never an empty question', async () => {
    expect(await failures(UNLISTED, {}, true)).toEqual([]);
  }, 1_800_000);
});

describe('head noun of a dish phrase', () => {
  it('reads an unlisted phrase by the dish it ends or starts with', () => {
    expect(dishProfile('armut tatlisi')?.cat).toBe('dessert');
    expect(dishProfile('sebze corbasi')?.cat).toBe('soup');
    expect(dishProfile('havuclu salata')?.label).toBe('salata-meze');
    expect(dishProfile('ispanakli borek')?.dish).toBe('borek');
    expect(dishProfile('peynirli pide')?.dish).toBe('pide');
    expect(dishProfile('yagli kebabi')?.dish).toBe('kebab');
    expect(dishProfile('hamsi tava')?.dish).toBe('hamsi');
    expect(dishProfile('levrek izgara')?.cat).toBe('fish');
  });

  it('lets the exact dish win over its head noun', () => {
    expect(dishProfile('su boregi')?.dish).toBe('su boregi');
    expect(dishProfile('tepsi kebabi')?.dish).toBe('tepsi kebabi');
    expect(dishProfile('kabak tatlisi')?.dish).toBe('kabak tatlisi');
  });

  it('does not read single words or non-dishes this way', () => {
    expect(dishProfile('tatli')).toBeNull();
    expect(dishProfile('araba parki')).toBeNull();
  });

  it('reads a food phrase as a search, but a place before the dish stays a place', () => {
    expect(parseQuery('tepsi kebabı')).toMatchObject({ kind: 'search', cat: 'meat' });
    expect(parseQuery('sucuklu pide')).toMatchObject({ cat: 'fast', dish: 'sucuklu pide' });
    expect(parseQuery("Bornova'da tepsi kebabı")).toMatchObject({
      cat: 'meat',
      dish: 'tepsi kebabı',
      district: { name: 'Bornova' },
    });
    expect(parseQuery('Bornova kebap')).toMatchObject({
      cat: 'meat',
      dish: 'kebap',
      district: { name: 'Bornova' },
    });
    expect(parseQuery('kemalpaşa lokanta')).toMatchObject({
      cat: 'lokanta',
      district: { name: 'Kemalpaşa' },
    });
  });

  it('shows the full phrase the user typed', async () => {
    const echo: AssistantDeps = { ...deps, t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k) };
    const { reply } = await answer('tepsi kebabı yemek istiyorum', emptyContext('food'), echo);
    expect(reply.text).toContain('"dish":"tepsi kebabı"');
  });
});

// Dishes the app only understands by their category (the reply says so and lists the category's
// places): the top card must then be a place that is typical for that category, not just the
// best-ranked one. Dishes it does know ("su böreği peynirli") must be read as the dish.
const FALLBACK_BASE = [
  'et haşlama,dana haşlama,patlıcan kızartma,kabak kızartma,biber kızartma,etli bezelye,etli patates',
  'kıymalı patates,kıymalı ıspanak,havuç dilim,karışık kızartma,et kızartma,oğlak kızartma,keçi eti',
  'kek,muffin,kruvasan,kavurmalı yumurta,bal kaymak,kahvaltılık,meyve suyu,smoothie',
  'taze sıkma portakal suyu,su böreği peynirli,kol böreği patatesli,sigara böreği peynirli',
  'kumru sucuklu,pişi peynir,simit peynir,menemen soğanlı,omlet peynirli,çiğ börek kıymalı',
  'çibörek,çiböreği,ezo gelin,çiğköfte,kelle paça,kellepaça',
]
  .join(',')
  .split(',');

const FALLBACK_RELEVANCE = FALLBACK_BASE.flatMap((p) => [p, `canım ${p} çekti`, `Bornova'da ${p}`]);

/**
 * Places the category ranking used to put first for these dishes, by the category the dish is
 * read as: not what anyone asking for it wants. ("Energy Vitamin" is a juice bar, so it is
 * wrong for a lokanta dish and right for a juice.)
 */
const KNOWN_BAD_TOP: Partial<Record<FoodCategory, string[]>> = {
  lokanta: ['Energy Vitamin', 'Şefin Tavsiyesi'],
  meat: ['Kasap Fuat'],
  dessert: ['Helvacı Ali'],
  breakfast: ['By Melly'],
  cafe: ['Kendine Has', 'Manti Evi'],
};

/** Phrases whose leading words are a dish and the last word only describes it. */
const LEADING_DISH: Record<string, string> = {
  'su böreği peynirli': 'su böreği',
  'kol böreği patatesli': 'kol böreği',
  'sigara böreği peynirli': 'sigara böreği',
  'kumru sucuklu': 'kumru',
  'pişi peynir': 'pişi',
  'simit peynir': 'simit',
  'menemen soğanlı': 'menemen',
  'omlet peynirli': 'omlet',
  'çiğ börek kıymalı': 'çiğ börek',
};

describe('dishes known only by category: the top card is typical for it', () => {
  it('has no duplicate phrases', () => {
    expect(FALLBACK_RELEVANCE.length - new Set(FALLBACK_RELEVANCE).size).toBe(0);
  });

  it('puts a typical place first, never a butcher, juice bar mix-up or helva shop', async () => {
    const bad: string[] = [];
    // Like the dish lists: CI asks the phrase alone and with a district, DISH_AUDIT=full every form.
    for (const q of FALLBACK_RELEVANCE.filter((x) => FULL || !x.startsWith('canım '))) {
      const it = parseQuery(q);
      if (it.kind !== 'search' || !it.cat) {
        bad.push(`${q}: not read as a food search`);
        continue;
      }
      const { reply } = await answer(q, emptyContext('food'), deps);
      if (
        BAD_TEXT.filter((w) => w !== 'dishUnknown').some((w) => reply.text.includes(w)) ||
        reply.cards.length === 0
      ) {
        bad.push(`${q}: ${reply.text}`);
        continue;
      }
      const top = reply.cards[0]!;
      if (top.kind !== 'restaurant') {
        bad.push(`${q}: first card is not a place`);
        continue;
      }
      const place = getRestaurant(top.id);
      if (reply.text.includes('dishUnknown')) {
        // Only the category is known: the card's name or cuisine must say it fits.
        if (!place || !typicalMatch(place, it.cat)) bad.push(`${q}: atypical top card ${top.name}`);
        if (KNOWN_BAD_TOP[it.cat]?.includes(top.name))
          bad.push(`${q}: known-bad top card ${top.name}`);
      } else if (!topCardFits(it.dish ?? q, top.id, top.name)) {
        bad.push(`${q}: irrelevant top card ${top.name}`);
      }
    }
    expect(bad).toEqual([]);
  }, 1_800_000);

  it('reads "dish + modifier" as the dish', () => {
    for (const [phrase, dish] of Object.entries(LEADING_DISH)) {
      for (const q of [phrase, `Bornova'da ${phrase}`, `canım ${phrase} çekti`]) {
        const it = parseQuery(q);
        expect({ q, dish: it.kind === 'search' ? it.dish : null }).toEqual({ q, dish });
      }
    }
  });

  it('keeps a modifier next to a word that is not a dish, and a second dish, as they were', () => {
    expect(parseQuery('bal kaymak')).toMatchObject({ dish: 'bal kaymak' });
    expect(parseQuery('peynirli pide')).toMatchObject({ cat: 'fast', dish: 'peynirli pide' });
  });
});

describe('joined and split spellings of a dish', () => {
  it('reads çibörek as çiğ börek, ezo gelin as ezogelin, kellepaça as kelle paça', () => {
    expect(parseQuery('çibörek')).toMatchObject({ cat: 'fast', dish: 'çiğ börek' });
    expect(parseQuery('çiböreği')).toMatchObject({ dish: 'çiğ böreği' });
    expect(parseQuery('canım ezo gelin çekti')).toMatchObject({ cat: 'soup', dish: 'ezogelin' });
    expect(parseQuery('kellepaça')).toMatchObject({ cat: 'soup', dish: 'kelle paça' });
    expect(parseQuery('cigborek')).toMatchObject({ cat: 'fast' });
    expect(dishProfile('ciboregi')?.dish).toBe('cig borek');
    expect(dishProfile('ezo gelin')?.dish).toBe('ezogelin');
    expect(dishProfile('kellepaca')?.dish).toBe('kelle paca');
    expect(dishProfile('cigkofte')?.dish).toBe('cigkofte');
  });
});

// Round 3: dishes a holdout check could not place (hard failures, category fallbacks with an odd top card).
const ROUND3_BASE = [
  'çörek,haşhaşlı çörek,tahinli çörek,susamlı çörek,kandil çöreği,paskalya çöreği,çörekotlu',
  'tuzlama,işkembe tuzlama,paça tuzlama,sıcak süt,ballı süt,soğuk süt,kakaolu süt,salep sıcak',
  'sıcak şarap,ara sıcak,ara sıcaklar,soğuk meze,taze meyve suyu,sebze yemeği,et yemeği',
  'tavuk yemeği,etli yemek,zeytinyağlı yemek,tavuklu makarna,peynirli makarna,makarnalı tavuk',
  'pilavlı tavuk,nohutlu tavuk,poke tavuk,hindi füme',
  // Round 4: bread by its loaf, nutella, a compound dish that starts with a name, honey with kaymak.
  'tam buğday ekmeği,ekşi mayalı ekmek,çavdar ekmeği,köy ekmeği,nutella,ali paşa kebabı',
  'hasan paşa köftesi,sultan kebabı,paşa böreği,vezir kebabı,kaymaklı bal,bal kaymak',
]
  .join(',')
  .split(',');

const ROUND3 = ROUND3_BASE.flatMap((p) => [p, `Bornova'da ${p}`, `canım ${p} çekti`]);

/** The dish whose profile the top card must fit, where the phrase is another dish's word order. */
const ROUND3_PROFILE: Record<string, string> = {
  'tavuklu makarna': 'makarna',
  'peynirli makarna': 'makarna',
  'makarnalı tavuk': 'makarna',
  'pilavlı tavuk': 'tavuk pilav',
  'nohutlu tavuk': 'nohutlu pilav',
  'poke tavuk': 'poke',
  'hindi füme': 'fume',
  'tam buğday ekmeği': 'tam bugday ekmegi',
  'ekşi mayalı ekmek': 'eksi mayali ekmek',
  'çavdar ekmeği': 'cavdar ekmegi',
  'köy ekmeği': 'koy ekmegi',
  nutella: 'nutella',
  'ali paşa kebabı': 'kebap',
  'hasan paşa köftesi': 'kofte',
  'sultan kebabı': 'kebap',
  'paşa böreği': 'borek',
  'vezir kebabı': 'kebap',
  'kaymaklı bal': 'kaymak bal',
  'bal kaymak': 'kaymak bal',
};

describe('round 3: no hard failure, a typical top card, and never a modifier as the name match', () => {
  it('has no duplicate phrases', () => {
    expect(ROUND3.length - new Set(ROUND3).size).toBe(0);
  });

  it('answers every phrase with cards and a top card that fits', async () => {
    const bad: string[] = [];
    for (const q of ROUND3.filter((x) => FULL || !x.startsWith('canım '))) {
      const it = parseQuery(q);
      if (it.kind !== 'search' || !it.cat) {
        bad.push(`${q}: not read as a food search`);
        continue;
      }
      const { reply } = await answer(q, emptyContext('food'), deps);
      if (
        BAD_TEXT.filter((w) => w !== 'dishUnknown').some((w) => reply.text.includes(w)) ||
        reply.cards.length === 0
      ) {
        bad.push(`${q}: ${reply.text}`);
        continue;
      }
      const top = reply.cards[0]!;
      const place = top.kind === 'restaurant' ? getRestaurant(top.id) : undefined;
      if (!place) {
        bad.push(`${q}: first card is not a place`);
        continue;
      }
      const fits = topCardFits(it.dish ?? q, top.id, top.name) || typicalMatch(place, it.cat);
      if (!fits) bad.push(`${q}: irrelevant top card ${top.name}`);
      if (reply.text.includes('dishUnknown') && !typicalMatch(place, it.cat))
        bad.push(`${q}: atypical top card ${top.name}`);
      const want = ROUND3_PROFILE[ROUND3_BASE.find((b) => q.includes(b)) ?? ''];
      const wanted = want ? dishProfile(want) : null;
      if (wanted && !likelyServes(wanted, fold(top.name), place.cuisines))
        bad.push(`${q}: top card ${top.name} is no ${want} place`);
    }
    expect(bad).toEqual([]);
  }, 1_800_000);

  it('never answers with a place named after a modifier or a pub that only has the tag', async () => {
    const top = async (q: string) => (await answer(q, emptyContext('food'), deps)).reply.cards[0];
    for (const q of ['taze meyve suyu', "Bornova'da taze meyve suyu"]) {
      expect(fold((await top(q))?.name ?? '')).not.toContain('balik');
    }
    for (const q of ['sebze yemeği', "Bornova'da sebze yemeği"]) {
      expect(fold((await top(q))?.name ?? '')).not.toContain('doner');
    }
    for (const q of ['tavuklu makarna', 'peynirli makarna', 'makarnalı tavuk', 'pilavlı tavuk']) {
      expect((await top(q))?.name).not.toBe('Laruv GastroPub & Cocktails');
      expect((await top(`Bornova'da ${q}`))?.name).not.toBe('Laruv GastroPub & Cocktails');
    }
    expect((await top('nohutlu tavuk'))?.name).not.toBe('Laruv GastroPub & Cocktails');
  });

  it('reads the phrases by the category of the dish they name', () => {
    const cat = (q: string) => {
      const it = parseQuery(q);
      return it.kind === 'search' ? it.cat : null;
    };
    expect(cat('çörek')).toBe('breakfast');
    expect(cat('kandil çöreği')).toBe('breakfast');
    expect(cat('tuzlama')).toBe('soup');
    expect(cat('sıcak süt')).toBe('cafe');
    expect(cat('ara sıcak')).toBe('meyhane');
    expect(cat('sebze yemeği')).toBe('lokanta');
    expect(cat('et yemeği')).toBe('meat');
    expect(cat('tavuk yemeği')).toBe('meat');
    expect(cat('etli yemek')).toBe('meat');
    expect(cat('zeytinyağlı yemek')).toBe('lokanta');
    expect(cat('makarnalı tavuk')).toBe('world');
    expect(cat('pilavlı tavuk')).toBe('lokanta');
    expect(cat('nohutlu tavuk')).toBe('lokanta');
    expect(cat('poke tavuk')).toBe('world');
    expect(cat('hindi füme')).toBe('breakfast');
    // The -lı word is the dish only before a plain protein: a dish at the end stays the head.
    expect(cat('tavuklu makarna')).toBe('world');
    expect(cat('peynirli pide')).toBe('fast');
    // "yemek" after a plain dish is the verb, as before.
    expect(parseQuery('pide yemek istiyorum')).toMatchObject({ cat: 'fast', dish: 'pide' });
  });

  it('puts the taste modifier into the dish, not into a place search', () => {
    expect(parseQuery('taze meyve suyu')).toMatchObject({
      cat: 'cafe',
      dish: 'taze meyve suyu',
      placeQuery: '',
    });
    expect(parseQuery('salep sıcak')).toMatchObject({ cat: 'cafe', dish: 'salep', placeQuery: '' });
  });
});

describe('round 4: bread, nutella, compound dishes that start with a name, short dish words', () => {
  const read = (q: string) => {
    const it = parseQuery(q);
    return it.kind === 'search'
      ? { cat: it.cat, dish: it.dish, placeQuery: it.placeQuery }
      : { kind: it.kind };
  };

  it('reads "X ekmeği" as bread from a bakery and keeps the ekmek dishes as they were', () => {
    for (const q of ['tam buğday ekmeği', 'ekşi mayalı ekmek', 'çavdar ekmeği', 'köy ekmeği']) {
      for (const p of [q, `Bornova'da ${q}`, `canım ${q} çekti`]) {
        expect(read(p)).toMatchObject({ cat: 'breakfast', dish: q, placeQuery: '' });
      }
    }
    expect(dishProfile('çavdar ekmeği')?.cat).toBe('breakfast');
    expect(dishProfile('çavdar ekmeği')?.serves).toContain('firin');
    expect(read('etli ekmek')).toMatchObject({ cat: 'fast', dish: 'etli ekmek' });
    expect(read('balık ekmek')).toMatchObject({ cat: 'fish', dish: 'balık ekmek' });
    expect(read('köfte ekmek')).toMatchObject({ cat: 'meat', dish: 'köfte ekmek' });
    expect(read('sucuk ekmek')).toMatchObject({ cat: 'meat', dish: 'sucuk' });
    expect(read('tavuk ekmek')).toMatchObject({ cat: 'meat', dish: 'tavuk' });
    expect(read('ekmek arası')).toMatchObject({ cat: 'fast', dish: 'ekmek arası' });
    expect(read('ekmek kadayıfı')).toMatchObject({ cat: 'dessert', dish: 'ekmek kadayıfı' });
    expect(read('mısır ekmeği')).toMatchObject({ cat: 'breakfast', dish: 'mısır ekmeği' });
  });

  it('reads nutella as a waffle / crêpe / pastry-shop dessert', () => {
    for (const q of ['nutella', "Bornova'da nutella", 'canım nutella çekti']) {
      expect(read(q)).toMatchObject({ cat: 'dessert', dish: 'nutella', placeQuery: '' });
    }
    expect(dishProfile('nutella')?.label).toBe('waffle-krep-tatlıcı');
    expect(dishProfile('nutella')?.serves).toEqual(
      expect.arrayContaining(['waffle', 'krep', 'kreperi', 'tatlici', 'pastane', 'cikolata']),
    );
  });

  it('reads a compound head after a name as a dish, unless the name is an İzmir district', () => {
    for (const q of [
      'ali paşa kebabı',
      'hasan paşa köftesi',
      'sultan kebabı',
      'paşa böreği',
      'vezir kebabı',
    ]) {
      for (const p of [q, `Bornova'da ${q}`]) {
        expect(read(p)).toMatchObject({ dish: q, placeQuery: '' });
      }
    }
    expect(read('ali paşa kebabı')).toMatchObject({ cat: 'meat' });
    expect(read('paşa böreği')).toMatchObject({ cat: 'breakfast' });
    expect(read('bornova köftesi')).toMatchObject({ cat: 'meat', dish: 'köftesi' });
  });

  it('never matches a dish word of under 4 letters inside a longer name word', async () => {
    const names = async (q: string) =>
      (await answer(q, emptyContext('food'), deps)).reply.cards.map((c) => fold(c.name));
    for (const q of ['kaymaklı bal', "Bornova'da kaymaklı bal", 'bal kaymak']) {
      const top = (await names(q)).slice(0, 3);
      expect(top.length).toBeGreaterThan(0);
      expect(top.filter((n) => /\bbal(ci|li)\b/.test(n))).toEqual([]);
    }
    expect(dishProfile('kaymaklı bal')?.dish).toBe('kaymakli bal');
    expect(dishProfile('bal kaymak')?.cat).toBe('breakfast');
  });
});

// Round 5: dishes that were missing (or read as a district / an unknown word), district-named dishes.
const ROUND5_DISHES = [
  'şinitzel,schnitzel,sinitzel,cordon bleu,kibbe,oruk,bumbar,menengiç,menengiç kahvesi,dibek',
  'dibek kahvesi,bıçak arası,uykuluk,koç yumurtası,böbrek,yürek,beğendi,arapsaçı,cibes otu,sirken',
  'ebegümeci,turp otu,kuşkonmaz,ısırgan,kaymaklı dondurmalı irmik,kemalpaşa dondurmalı',
  'kemalpaşa tatlısı,kemalpaşa dondurmalı tatlı,künefe dondurmalı,kazandibi dondurmalı',
  'irmik helvası dondurmalı,tire köfte,ödemiş köfte,bergama köfte',
]
  .join(',')
  .split(',');

// Fish only the food lexicon knows: the honest "no place is sure" text plus the fish places is the answer.
const ROUND5_LEXICON = 'sarıgöz,karagöz,izmarit,kolyoz,torik'.split(',');

describe('round 5: missing dishes, district-named dishes, a leading dish with "dondurmalı"', () => {
  const read = (q: string) => {
    const it = parseQuery(q);
    return it.kind === 'search'
      ? {
          cat: it.cat,
          dish: it.dish,
          placeQuery: it.placeQuery,
          district: it.district?.name ?? null,
        }
      : { kind: it.kind };
  };

  it('has no duplicate phrases', () => {
    expect(ROUND5_DISHES.length - new Set(ROUND5_DISHES).size).toBe(0);
    expect(ROUND5_LEXICON.length - new Set(ROUND5_LEXICON).size).toBe(0);
  });

  it('answers every dish with a food reply, cards and a top card that fits', async () => {
    expect(await failures(ROUND5_DISHES, {})).toEqual([]);
  }, 1_800_000);

  it('answers the fish only the lexicon knows with the fish places', async () => {
    expect(await failures(ROUND5_LEXICON, {}, true)).toEqual([]);
    for (const q of ROUND5_LEXICON.flatMap((x) => [x, `Bornova'da ${x}`])) {
      expect(read(q)).toMatchObject({ cat: 'fish', placeQuery: '' });
    }
  });

  it('reads each new dish in the category of its kind of place', () => {
    const cat = (q: string) => read(q).cat;
    for (const q of ['şinitzel', 'schnitzel', 'sinitzel', 'cordon bleu', 'kibbe']) {
      expect(cat(q)).toBe('world');
    }
    for (const q of ['oruk', 'beğendi', 'arapsaçı', 'cibes otu', 'sirken', 'ebegümeci']) {
      expect(cat(q)).toBe('lokanta');
    }
    for (const q of ['turp otu', 'kuşkonmaz', 'ısırgan']) expect(cat(q)).toBe('lokanta');
    for (const q of ['bumbar', 'bıçak arası', 'uykuluk', 'koç yumurtası', 'böbrek', 'yürek']) {
      expect(cat(q)).toBe('meat');
    }
    for (const q of ['menengiç', 'menengiç kahvesi', 'dibek', 'dibek kahvesi']) {
      expect(cat(q)).toBe('cafe');
    }
    expect(dishProfile('bumbar')?.serves).toEqual(expect.arrayContaining(['mumbar', 'bumbar']));
    expect(dishProfile('kibbe')?.serves).toEqual(expect.arrayContaining(['falafel', 'icli kofte']));
    expect(dishProfile('oruk')?.serves).toEqual(expect.arrayContaining(['icli kofte', 'oruk']));
    expect(dishProfile('bicak arasi')?.serves).toEqual(
      expect.arrayContaining(['kebap', 'bicak arasi']),
    );
    expect(dishProfile('uykuluk')?.serves).toEqual(
      expect.arrayContaining(['iskembe', 'kebap', 'ciger']),
    );
    expect(dishProfile('sirken')?.serves).toEqual(
      expect.arrayContaining(['zeytinyagli', 'ot', 'ege mutfagi', 'ege otlari']),
    );
    // "ege" alone would put every "Ege Döner" among the greens places.
    expect(dishProfile('sirken')?.serves).not.toContain('ege');
    expect(dishProfile('schnitzel')?.serves).toEqual(
      expect.arrayContaining(['schnitzel', 'sinitzel']),
    );
    expect(dishProfile('menengic')?.cat).toBe('cafe');
    expect(dishProfile('menengic kahve')?.dish).toBe('menengic');
  });

  it('reads "dondurmalı irmik" as the irmik helvası dessert', () => {
    for (const q of ['kaymaklı dondurmalı irmik', "Bornova'da kaymaklı dondurmalı irmik"]) {
      expect(read(q)).toMatchObject({
        cat: 'dessert',
        dish: 'kaymaklı dondurmalı irmik',
        placeQuery: '',
      });
    }
    expect(dishProfile('kaymakli dondurmali irmik')?.dish).toBe('irmik helvasi');
  });

  it('lets the leading dish win over "dondurmalı"', async () => {
    for (const [q, dish] of [
      ['künefe dondurmalı', 'künefe'],
      ['kazandibi dondurmalı', 'kazandibi'],
      ['irmik helvası dondurmalı', 'irmik helvası'],
    ] as const) {
      for (const p of [q, `Bornova'da ${q}`]) {
        expect(read(p)).toMatchObject({ cat: 'dessert', dish, placeQuery: '' });
        const top = (await answer(p, emptyContext('food'), deps)).reply.cards[0];
        const place = top?.kind === 'restaurant' ? getRestaurant(top.id) : undefined;
        expect(place).toBeDefined();
        // A künefeci / tatlıcı / muhallebici / helvacı (or a shop type that usually has it), not a gelato shop.
        expect(fold(top?.name ?? '')).not.toMatch(/gelato|dondurmaci/);
        const profile = dishProfile(fold(dish))!;
        const fits =
          likelyServes(profile, fold(top!.name), place!.cuisines) ||
          commonShop(profile, fold(top!.name)) !== null;
        expect(fits).toBe(true);
      }
    }
  });

  it('reads a sweet word next to "kemalpaşa" as the dessert, not the district', async () => {
    for (const q of [
      'kemalpaşa dondurmalı',
      'kemalpaşa tatlısı',
      'kemalpaşa dondurmalı tatlı',
      'kemalpaşa tatlı',
    ]) {
      expect(read(q)).toMatchObject({
        cat: 'dessert',
        dish: 'kemalpaşa tatlısı',
        placeQuery: '',
        district: null,
      });
      expect(read(`Bornova'da ${q}`)).toMatchObject({
        cat: 'dessert',
        dish: 'kemalpaşa tatlısı',
        district: 'Bornova',
      });
    }
    expect(read('dondurmalı kemalpaşa tatlısı')).toMatchObject({
      dish: 'kemalpaşa tatlısı',
      district: null,
    });
    // Same answer as the dish itself: dessert places, none of them a "where is Kemalpaşa" list.
    const echo: AssistantDeps = { ...deps, t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k) };
    const { reply } = await answer('kemalpaşa dondurmalı', emptyContext('food'), echo);
    expect(reply.text).toContain('"dish":"kemalpaşa tatlısı"');
    const top = reply.cards[0];
    expect(top?.kind === 'restaurant' && topCardFits('kemalpaşa tatlısı', top.id, top.name)).toBe(
      true,
    );
  });

  it('keeps the district readings next to it', () => {
    expect(read('kemalpaşa')).toMatchObject({ cat: null, district: 'Kemalpaşa' });
    expect(read("kemalpaşa'da kebap")).toMatchObject({
      cat: 'meat',
      dish: 'kebap',
      district: 'Kemalpaşa',
    });
    expect(read('kemalpaşa lokanta')).toMatchObject({ cat: 'lokanta', district: 'Kemalpaşa' });
    expect(read("kemalpaşa'da kemalpaşa tatlısı")).toMatchObject({
      cat: 'dessert',
      dish: 'kemalpaşa tatlısı',
      district: 'Kemalpaşa',
    });
    // A case suffix between the name and the sweet word: a place plus a food word, as before.
    expect(read("kemalpaşa'da dondurmalı")).toMatchObject({ district: 'Kemalpaşa' });
    // "menemen" is a district and a dish: alone the dish, with a district in front it is in that district.
    expect(read('menemen')).toMatchObject({ cat: 'breakfast', dish: 'menemen', district: null });
    expect(read("Bornova'da menemen")).toMatchObject({
      cat: 'breakfast',
      dish: 'menemen',
      district: 'Bornova',
    });
    expect(read('bornova köftesi')).toMatchObject({
      cat: 'meat',
      dish: 'köftesi',
      district: 'Bornova',
    });
    expect(read('Bornova kebap')).toMatchObject({
      cat: 'meat',
      dish: 'kebap',
      district: 'Bornova',
    });
  });

  it('reads "<town> köfte" as a köfte style, not köfte in that town', async () => {
    for (const town of ['tire', 'ödemiş', 'bergama']) {
      const q = `${town} köfte`;
      expect(read(q)).toMatchObject({ cat: 'meat', dish: q, placeQuery: '', district: null });
      expect(read(`Bornova'da ${q}`)).toMatchObject({ cat: 'meat', dish: q, district: 'Bornova' });
      // Places named after the style come first, wherever they are.
      const { reply } = await answer(q, emptyContext('food'), deps);
      expect(fold(reply.cards[0]?.name ?? '')).toContain(fold(town));
    }
    // Said with a case suffix, the town is where the köfte is wanted.
    expect(read("tire'de köfte")).toMatchObject({ cat: 'meat', dish: 'köfte', district: 'Tire' });
    expect(read('tire')).toMatchObject({ cat: null, district: 'Tire' });
  });
});

// Round 6: order and quantity words ("kilo", "yarım", "tabağı") are no dish and no name, a city after a dish is its style.
const ROUND6_ORDER: [q: string, cat: FoodCategory, dish: string, avoid: RegExp][] = [
  ['baklava kilo', 'dessert', 'baklava', /kilo/],
  ['fıstıklı baklava kilo', 'dessert', 'fıstıklı baklava', /kilo/],
  ['maraş dondurma kilo', 'dessert', 'maraş dondurma', /kilo/],
  ['dondurma kase', 'dessert', 'dondurma', /kase/],
  ['çay bardak', 'cafe', 'çay', /bardak/],
  ['şekerli kahve', 'cafe', 'kahve', /sekerli/],
  ['iskender yarım', 'meat', 'iskender', /yarim|diyarim/],
  ['pide yarım', 'fast', 'pide', /yarim|diyarim/],
  ['kuzu tandır yarım', 'meat', 'kuzu tandır', /yarim|diyarim/],
  ['döner yarım ekmek', 'fast', 'döner', /yarim/],
  ['yarım ekmek döner', 'fast', 'döner', /yarim/],
  ['tavuk şiş porsiyon', 'meat', 'tavuk şiş', /porsiyon|kanat/],
  ['somon tabağı', 'fish', 'somon', /tabag/],
  ['et döner pilav üstü', 'fast', 'et döner', /ustu|ayak/],
  ['pilav üstü döner', 'fast', 'döner', /ustu/],
  ['piyaz antalya', 'meat', 'piyaz', /antalya|borekci/],
  // Number words, "<n> lı" counts and promotions are order words as well.
  ['midye on tane', 'fish', 'midye', /oncu|\bon\b/],
  ['nugget 6 lı', 'fast', 'nugget', /life|\blik?\b/],
  ['kanat 8 li', 'meat', 'kanat', /life|\blik?\b/],
  ["nugget 6'lı", 'fast', 'nugget', /life|\blik?\b/],
  ['pizza 2 al 1 öde', 'fast', 'pizza', /ode/],
  ['pizza 1 alana 1 bedava', 'fast', 'pizza', /bedava|alana/],
];

// Dishes and drinks a holdout found as hard failures (a "what is this?" reply or an unrelated place).
const ROUND6_NEW: [q: string, cat: FoodCategory][] = [
  ['gavurdağı porsiyon', 'meyhane'],
  ['gavurdağı', 'meyhane'],
  ['tarator', 'meyhane'],
  ['eli böğründe', 'lokanta'],
  ['fettucine alfredo', 'world'],
  ['fettuccine alfredo', 'world'],
  ['alfredo', 'world'],
  ['arabiata', 'world'],
  ['arrabbiata', 'world'],
  ['bolonez', 'world'],
  ['carbonara', 'world'],
  ['kola', 'cafe'],
  ['soda', 'cafe'],
  ['gazoz', 'cafe'],
  ['maden suyu', 'cafe'],
];
// Plain water is a drink only when it is the whole text.
const ROUND6_WATER = ['su', 'su istiyorum', 'bir su', 'su küçük'];

describe('round 6: order words, city styles, new dishes and drinks, famous streets', () => {
  const read = (q: string) => {
    const it = parseQuery(q);
    return it.kind === 'search'
      ? {
          cat: it.cat,
          dish: it.dish,
          placeQuery: it.placeQuery,
          district: it.district?.name ?? null,
        }
      : { kind: it.kind };
  };
  const first = async (q: string, count = 1) => {
    const { reply } = await answer(q, emptyContext('food'), deps);
    return { reply, cards: reply.cards.slice(0, count) };
  };

  it('has no duplicate phrases', () => {
    const all = [...ROUND6_ORDER.map((x) => x[0]), ...ROUND6_NEW.map((x) => x[0]), ...ROUND6_WATER];
    expect(all.length - new Set(all).size).toBe(0);
  });

  it('keeps the order words out of the dish and the place', () => {
    for (const [q, cat, dish] of ROUND6_ORDER) {
      expect(read(q)).toEqual({ cat, dish, placeQuery: '', district: null });
      expect(read(`Bornova'da ${q}`)).toEqual({ cat, dish, placeQuery: '', district: 'Bornova' });
    }
  });

  it('never answers an order word with a place named after it', async () => {
    for (const [q, , dish, avoid] of ROUND6_ORDER) {
      for (const p of [q, `Bornova'da ${q}`]) {
        const { reply, cards } = await first(p, 3);
        expect(BAD_TEXT.filter((w) => reply.text.includes(w))).toEqual([]);
        expect(cards.length).toBeGreaterThan(0);
        for (const c of cards) expect(fold(c.name)).not.toMatch(avoid);
        const top = cards[0]!;
        expect(top.kind === 'restaurant' && topCardFits(dish, top.id, top.name)).toBe(true);
      }
    }
  });

  it('puts the places that fit first: a dönerci for döner, a fish place for somon', async () => {
    for (const q of ['döner yarım ekmek', 'yarım ekmek döner', 'et döner pilav üstü']) {
      const top = (await first(q)).cards[0];
      const place = top?.kind === 'restaurant' ? getRestaurant(top.id) : undefined;
      expect(place).toBeDefined();
      expect(likelyServes(dishProfile('doner')!, fold(top!.name), place!.cuisines)).toBe(true);
    }
    const fish = (await first('somon tabağı')).cards[0];
    expect(fish?.kind === 'restaurant' && typicalMatch(getRestaurant(fish.id)!, 'fish')).toBe(true);
  });

  it('keeps the phrases that are dishes of their own, and the names that hold an order word', async () => {
    expect(read('kahvaltı tabağı')).toMatchObject({ cat: 'breakfast', dish: 'kahvaltı tabağı' });
    expect(read('tam buğday ekmeği')).toMatchObject({
      cat: 'breakfast',
      dish: 'tam buğday ekmeği',
    });
    expect(read('porsiyon döner')).toMatchObject({ cat: 'fast', dish: 'porsiyon döner' });
    expect(read('pilav üstü')).toMatchObject({ cat: 'lokanta', dish: 'pilav üstü' });
    expect(read('ekmek arası')).toMatchObject({ cat: 'fast', dish: 'ekmek arası' });
    expect(read('meze tabağı')).toMatchObject({ cat: 'meyhane', dish: 'meze tabağı' });
    // The exact name of a place, alone, is that place.
    expect(read('Yarım Ekmek')).toMatchObject({ cat: null, placeQuery: 'yarim ekmek' });
    expect(read('Büyük Efes')).toMatchObject({ cat: null, placeQuery: 'buyuk efes' });
    const { reply, cards } = await first('Yarım Ekmek');
    expect(reply.text).toMatch(/chat\.foundName/i);
    expect(cards[0]?.name).toBe('Yarım Ekmek');
  });

  it('answers a counted or promoted dish like the dish itself', async () => {
    for (const [plain, counted] of [
      ['nugget', 'nugget 6 lı'],
      ['pizza', 'pizza 2 al 1 öde'],
      ['midye', 'midye on tane'],
    ] as const) {
      expect((await first(counted)).cards[0]?.name).toBe((await first(plain)).cards[0]?.name);
    }
  });

  it('reads the town with only order words as the dessert, the town alone as the district', () => {
    expect(read('kemalpaşa iki tane')).toMatchObject({
      cat: 'dessert',
      dish: 'kemalpaşa tatlısı',
      placeQuery: '',
      district: null,
    });
    expect(read('kemalpaşa')).toMatchObject({ cat: null, district: 'Kemalpaşa' });
    expect(read("Kemalpaşa'da iki tane")).toMatchObject({ cat: null, district: 'Kemalpaşa' });
  });

  it('lists the order words folded', () => {
    for (const w of ORDER_WORDS) expect(fold(w)).toBe(w);
    for (const w of [
      'yarim',
      'kilo',
      'kase',
      'bardak',
      'tabagi',
      'sekerli',
      'porsiyon',
      'bir bucuk',
    ]) {
      expect(ORDER_WORDS.has(w)).toBe(true);
    }
  });

  it('matches a name by word starts: "yarım" is no "Peynir diyarim"', async () => {
    const { reply } = await answer('yarım', emptyContext('park'), deps);
    expect(reply.cards.length).toBeGreaterThan(0);
    for (const c of reply.cards) expect(fold(c.name)).not.toContain('diyarim');
  });

  it('reads a city after a dish as its style, but not a district or a city in front', () => {
    expect(read('piyaz antalya')).toMatchObject({ dish: 'piyaz', placeQuery: '', district: null });
    expect(read("Tire'de piyaz antalya")).toMatchObject({ dish: 'piyaz', district: 'Tire' });
    for (const town of CITY_STYLES) {
      expect(IZMIR_DISTRICTS.some((d) => fold(d.name) === town)).toBe(false);
    }
    // "Bursa'da": the case ending says where the dish is wanted, as before.
    expect(read("Bursa'da piyaz")).toMatchObject({ dish: 'piyaz', placeQuery: 'bursa' });
    expect(read('Urfa kebap')).toMatchObject({ cat: 'meat', dish: 'urfa kebap', placeQuery: '' });
    expect(read('bursa')).toMatchObject({ cat: null, placeQuery: 'bursa' });
  });

  it('answers the new dishes and drinks with a food reply and a typical top card', async () => {
    for (const [q, cat] of ROUND6_NEW) {
      for (const p of [q, `Bornova'da ${q}`]) {
        expect(read(p)).toMatchObject({ cat, placeQuery: '' });
        const { reply, cards } = await first(p);
        // "no place is sure to make it" is the honest answer for a drink only the lexicon knows.
        expect(BAD_TEXT.filter((w) => w !== 'dishUnknown' && reply.text.includes(w))).toEqual([]);
        const top = cards[0];
        const place = top?.kind === 'restaurant' ? getRestaurant(top.id) : undefined;
        expect(place).toBeDefined();
        expect(topCardFits(q, top!.id, top!.name) || typicalMatch(place!, cat)).toBe(true);
      }
    }
    const tarator = (await first('tarator')).cards[0]!;
    const place = getRestaurant((tarator as { id: string }).id)!;
    expect(likelyServes(dishProfile('tarator')!, fold(tarator.name), place.cuisines)).toBe(true);
    expect(dishProfile('tarator')?.serves).toEqual(
      expect.arrayContaining(['midye', 'meyhane', 'balik']),
    );
    expect(dishProfile('eli bogrunde')?.cat).toBe('lokanta');
    expect(dishProfile('fettucine alfredo')?.cat).toBe('world');
  });

  it('reads "su" as a drink only when it is the whole text', async () => {
    for (const q of ROUND6_WATER) {
      expect(read(q)).toEqual({ cat: 'cafe', dish: 'su', placeQuery: '', district: null });
      const { reply, cards } = await first(q);
      expect(BAD_TEXT.filter((w) => reply.text.includes(w))).toEqual([]);
      const top = cards[0];
      const place = top?.kind === 'restaurant' ? getRestaurant(top.id) : undefined;
      expect(place && typicalMatch(place, 'cafe')).toBe(true);
    }
    // Never a name word: a lone "su" does not list the places called "Su ...".
    expect(dishStem('su')).toBe('su');
    expect(GENERIC_DISH_STEMS.has('su')).toBe(true);
    // Beside other words it stays what it was.
    expect(read('su böreği')).toMatchObject({ cat: 'breakfast', dish: 'su böreği' });
    expect(read('su mantısı')).toMatchObject({ cat: 'lokanta', dish: 'su mantısı' });
    expect(read('meyve suyu')).toMatchObject({ cat: 'cafe', dish: 'meyve suyu' });
    expect(read('su kemeri')).toMatchObject({ cat: null, placeQuery: 'su kemeri' });
    expect(read('bostanlı su')).toMatchObject({ cat: null, placeQuery: 'bostanli su' });
  });

  it('resolves the streets and squares people name as places', async () => {
    const known: [q: string, name: string][] = [
      ['kıbrıs şehitleri', 'Kıbrıs Şehitleri Caddesi'],
      ['kibris sehitleri caddesi', 'Kıbrıs Şehitleri Caddesi'],
      ['alsancak kıbrıs şehitleri', 'Kıbrıs Şehitleri Caddesi'],
      ['kordon', 'Kordon'],
      ['gündoğdu', 'Gündoğdu Meydanı'],
      ['kemeraltı', 'Kemeraltı'],
      ['bostanlı', 'Bostanlı'],
      ['pasaport', 'Pasaport'],
      ['konak meydanı', 'Konak Meydanı'],
      ['mavişehir', 'Mavişehir'],
      ['alsancak garı', 'Alsancak Gar'],
    ];
    for (const [q, name] of known) {
      const hit = searchPlaces(q, 1)[0];
      expect(hit?.name).toBe(name);
      expect(hit?.kind).not.toBe('parking');
      expect(isInIzmirArea(hit!)).toBe(true);
      // The bare street name is also a fast-food shop's exact name ("Kıbrıs Şehitleri"): that shop answers.
      if (q === 'kıbrıs şehitleri') continue;
      const { ctx } = await answer(q, emptyContext('food'), deps);
      expect(ctx.place?.label).toBe(name);
    }
    // The street lies in Alsancak, beside its park and the Kordon.
    const street = searchPlaces('kıbrıs şehitleri', 1)[0]!;
    const park = searchPlaces('kıbrıs şehitleri parkı', 1)[0]!;
    expect(park.name).toBe('Kıbrıs Şehitleri Parkı');
    expect(distanceMeters(street, park)).toBeLessThan(400);
    expect(distanceMeters(street, searchPlaces('kordon', 1)[0]!)).toBeLessThan(1000);
  });

  it('answers "Alsancak\'ta Kıbrıs Şehitleri" with the places on that street', async () => {
    const { ctx, reply } = await answer("Alsancak'ta Kıbrıs Şehitleri", emptyContext('food'), deps);
    expect(ctx.place?.label).toBe('Kıbrıs Şehitleri Caddesi');
    expect(BAD_TEXT.filter((w) => reply.text.includes(w))).toEqual([]);
    expect(reply.cards.length).toBeGreaterThan(0);
    for (const c of reply.cards) expect(c.distanceM).toBeLessThan(800);
  });
});
