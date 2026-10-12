import '@/i18n';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { dishProfile, GENERIC_DISH_STEMS, likelyServes, typicalMatch } from '../dishes';
import { parseQuery } from '../intent';
import { dishStem, getRestaurant, type FoodCategory } from '../restaurants';
import { fold } from '../search';
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

/** The top card is a place whose name or cuisine fits the dish's profile (or names a word of the dish). */
function topCardFits(dish: string, cardId: string, cardName: string): boolean {
  const profile = dishProfile(fold(dish));
  // A generic word ("ev yemeği", "balık") is a plain category answer, not a dish match.
  if (!profile || GENERIC_DISH_STEMS.has(dishStem(fold(dish)))) return true;
  const name = fold(cardName);
  const cuisines = getRestaurant(cardId)?.cuisines ?? [];
  if (likelyServes(profile, name, cuisines)) return true;
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
