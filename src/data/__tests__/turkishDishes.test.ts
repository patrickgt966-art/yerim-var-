import '@/i18n';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { dishProfile, GENERIC_DISH_STEMS, likelyServes } from '../dishes';
import { parseQuery } from '../intent';
import { dishStem, getRestaurant } from '../restaurants';
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
