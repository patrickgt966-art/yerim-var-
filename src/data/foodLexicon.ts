import type { FoodCategory } from './restaurants';

/**
 * A Turkish food lexicon: folded words (see `fold`) and the one category their
 * places fall into. It is how a dish that is in no dish list ("musakka",
 * "bezelye", "pilaki") is still read as food. The category words in
 * `restaurants.ts` and the dish profiles in `dishes.ts` always win over it; a
 * word that fits several categories ("kizartma") is in the one an ordinary
 * restaurant of that name would be: lokanta. Never put an İzmir district name
 * here ("kiraz", "tire", "menemen"): a district is a place first.
 */
const GROUPS: [FoodCategory, string][] = [
  // Vegetables, legumes and grains, and the ways home kitchens cook them.
  [
    'lokanta',
    `eli bogrunde, bezelye, patates puresi, puresi, ispanak, pirasa, kereviz, karnabahar, brokoli, lahana, kara lahana, karalahana, kabak, patlican, biber, yesil biber, domates, patates, havuc, enginar, bamya, barbunya, borulce, fasulye, nohut, bulgur, pirinc, sebze, turlu, musakka, pilaki, fasulye pilaki, barbunya pilaki, kapama, haslama, yahni, sote, kizartma, patlican kizartma, kabak kizartma, guvec, dolma, sarma, salatalik, marul, roka, semizotu, turp, kuskonmaz, mantar, sogan, sarimsak, bakla, taze bakla, pazi, ebegumeci, kuzukulagi, otlar, hardal otu, labada, arpacik, biber dolmasi, kabak dolmasi, patlican dolmasi, lahana dolmasi, kuru dolma, asma yapragi, sehriye, arpa, yarma, kuru baklagil, kuru patlican, etli kuru fasulye, etli taze fasulye, zeytinyagli fasulye, zeytinyagli yaprak sarma, imambayildi, hunkar, tursu, yogurtlu, yogurtlu kofte, patates koftesi, kabak koftesi, ispanak koftesi, ekmek koftesi, kadinbudu, sulu yemek, aci biber, kapya biber, sivri biber, carliston, dolmalik biber, tas dolma, bulgur pilavi, ic pilav, sebzeli pilav, domatesli pilav, safranli pilav, nohutlu pilav, pirinc pilavi, firik, firik pilavi, tavuklu pilav, zeytinyagli enginar, zeytinyagli barbunya, zeytinyagli pirasa, zeytinyagli kereviz, zeytinyagli taze fasulye, tirit, yaglama, kabak mucver, havuc mucver, kuru bamya, sogan dolma, arapsaci, cibes otu, sirken, turp otu, isirgan, oruk, begendi`,
  ],

  // Meat, poultry and offal.
  [
    'meat',
    `dana, kuzu, dana but, kuzu but, oglak, keci, tavuk, pilic, hindi, ordek, bildircin, dil, beyin, bobrek, yurek, cevirme, tavuk cevirme, pilic cevirme, kuzu cevirme, dana eti, kuzu eti, kiyma, kontrfile, entrecote, rosto, rostbif, incik, gerdan, omuz, tavuk but, pilic but, pilic izgara, tavuk izgara, izgara tavuk, tavuk kanat, koc yumurtasi, taze koc yumurtasi, sac tava, kuzu beyin, kuzu bobrek, kuzu yurek, dana dil, dana bobrek, dana ciger, kuzu ciger, tavuk ciger, ciger tava, sakatat tava, kuzu pirzola, dana pirzola, antrikot izgara, kuzu sis, dana sis, alinazik, sac kavurma, tavuk kavurma, kuzu kavurma, tavuk sis, tavuk doner, kuzu tandir, kuzu kapama, kuzu incik, dana incik, kiymali kebap, urfa durum, kadinbudu kofte, izgara et, mangal et, tavuk gogus, kanat, pilic kanat, dana kusbasi, kuzu kusbasi, dana antrikot, bumbar, uykuluk, bicak arasi`,
  ],

  // Soups.
  [
    'soup',
    `tavuk suyu, et suyu, kremali corba, yogurt corbasi, havuc corbasi, brokoli corbasi, sebze corbasi, kuru fasulye corbasi, tutmac, toyga, toyga corbasi, bulgur corbasi, mantar corbasi, kesme corba, lahana corbasi, ispanak corbasi, kabak corbasi, balik corbasi, paca corbasi, kelle corbasi, tuzlama, iskembe tuzlama, paca tuzlama, kelle tuzlama`,
  ],

  // Fish and seafood.
  [
    'fish',
    `kalkan, mezgit, kefal, cinekop, lufer, palamut, torik, kolyoz, izmarit, mercan, sinarit, orfoz, lagos, lahos, dil baligi, kilic, kilic baligi, zargana, istakoz, yengec, midye, istiridye, karides, jumbo karides, kalamar, ahtapot, subye, murekkep baligi, kerevit, deniz taragi, kidonya, levrek, cipura, hamsi, istavrit, barbun, sardalya, uskumru, somon, alabalik, mirmir, karagoz, sargoz, sarigoz, fangri, eskina, lipsos, minekop, trilye, tranca, dulger baligi, akya, iskorpit, kaya baligi, pisi baligi, vatoz, sazan, turna baligi, tatlisu baligi, orkinos, ton baligi, gumus baligi, istavrit tava, hamsi tava, mezgit tava, kefal bugulama, levrek bugulama, deniz borulcesi, yosun, kalkan tava, kalkan izgara, mercan izgara, sinarit izgara, cipura izgara, levrek izgara, somon izgara, karides tava, karides guvec, kalamar tava, ahtapot izgara, ahtapot salatasi, midye dolma, midye tava`,
  ],

  // Desserts, sweets, cakes and pastry-shop things.
  [
    'dessert',
    `sobiyet, sari burma, sarigi burma, dilber dudagi, vezir parmagi, kalburabasti, hanim gobegi, sultan lokmasi, bulbul yuvasi, fistik sarma, dolama, gul tatlisi, lokum, helva, un helvasi, tahin helvasi, kar helvasi, irmik helvasi, pismaniye, kunefe, tatli, sutlu tatli, nuriye, sutlu nuriye, kek, pasta, yas pasta, mozaik pasta, kurabiye, muffin, cookie, brownie, puding, jole, sufle, macun, mesir macunu, tel kadayif, burma kadayif, ekmek kadayifi, havuc dilimi, tulumba tatlisi, halka tatli, ayva tatlisi, kabak tatlisi, armut tatlisi, incir tatlisi, elma tatlisi, ekler, profiterol, macaron, donut, cupcake, churros, tart, tartolet, milfoy, sekerleme, akide sekeri, pamuk sekeri, truf, bonbon, komposto, hosaf, asure, gullac, revani, sekerpare, kazandibi, sutlac, firin sutlac, supangle, muhallebi, tavuk gogsu, dondurma, maras dondurma, gelato, waffle, krep, pankek, cheesecake, tiramisu, trilece, san sebastian, dogum gunu pastasi, biskuvi, cikolata, cikolatali, lokma, lokmacilar, baklava, fistikli baklava, cevizli baklava, kuru baklava, sutlu baklava, fistik ezmesi, nutella, nutellali, lotuslu, tahin pekmez tatlisi, kaymakli tatli, irmik`,
  ],

  // Breakfast and bakery.
  [
    'breakfast',
    `simit, kandil simidi, catal, bagel, acma, pogaca, pisi, bazlama, yufka, gozleme, serpme, kahvaltilik, omlet, yumurta, haslanmis yumurta, peynir, tulum peyniri, beyaz peynir, kasar, kasar peyniri, lor, lor peyniri, otlu peynir, van otlu peynir, zeytin, bal, kaymak, recel, tereyag, kruvasan, croissant, brioche, boyoz, gevrek, tahin, pekmez, tahin pekmez, sahanda sucuk, sahanda yumurta, yumurtali ekmek, yogurt, granola, yulaf, musli, yulaf lapasi, kahvalti tabagi, koy kahvaltisi, serpme kahvalti, borek cesitleri, corek, coregi, corekler, corekotlu, corek otlu, kandil coregi, paskalya coregi, tahinli corek, hashasli corek, susamli corek, fume, hindi fume, bohca borek, talas boregi, patatesli borek, ispanakli borek, peynirli borek, kiymali borek, firin, firinci, pogacaci, simitci`,
  ],

  // Drinks.
  [
    'cafe',
    `serbet, salep, sahlep, boza, ayran, limonata, meyve suyu, portakal suyu, nar suyu, havuc suyu, elma suyu, taze sikma, taze sikma portakal suyu, taze sikma nar suyu, taze sikma meyve suyu, taze sikma elma suyu, taze sikma havuc suyu, taze sikma limonata, sikma portakal suyu, taze portakal suyu, smoothie, milkshake, sicak cikolata, cay, kahve, nescafe, cortado, flat white, macchiato, ice tea, icetea, soguk cay, bitki cayi, adacayi, ada cayi, ihlamur, papatya cayi, nane limon, gazoz, maden suyu, kefir, sutlu kahve, hot chocolate, turk cayi, cay ocagi, demleme kahve, nitro kahve, dalgona, limonlu soda, soguk kahve, buzlu kahve, sut, sicak sut, soguk sut, balli sut, kakaolu sut, menengic, dibek, kola, cola, coca cola, pepsi, soda`,
  ],

  // Street food and fast food.
  [
    'fast',
    `misir, kestane, sogan halkasi, kumpir, nugget, nuggets, haslama misir, haslanmis misir, kavrulmus misir, sokak yemegi, islak hamburger, islak burger, cips, patates cipsi, calzone, cheeseburger, cheese burger, corn dog, tavuk nugget, fried chicken, kizarmis tavuk, citir tavuk, ekmek arasi, tavuk burger, tavuk wrap`,
  ],

  // Meyhane food.
  [
    'meyhane',
    `tarator, gavurdagi, tarama, acuka, girit ezmesi, sarimsakli yogurt, sarap, mezeler, soguk meze, sicak meze, meze tabagi, raki sofrasi, deniz mezesi, ahtapot meze, ara sicak, ara sicaklar, soguk mezeler, sicak mezeler`,
  ],

  // World cuisines.
  [
    'world',
    `gyro, souvlaki, tzatziki, hummus, tabbouleh, schnitzel, sinitzel, cordon bleu, kibbe, ceviche, empanada, crepe, pierogi, fettucine, fettucine alfredo, fettuccine alfredo, alfredo, arabiata, arrabbiata, bolognese`,
  ],
];

const entries: [string, FoodCategory][] = [];
for (const [cat, words] of GROUPS) {
  for (const w of words.split(',')) {
    const word = w.replace(/\s+/g, ' ').trim();
    if (word) entries.push([word, cat]);
  }
}

/** Folded word or phrase -> its category (the first group that lists it). */
export const FOOD_LEXICON: ReadonlyMap<string, FoodCategory> = new Map(
  [...entries].reverse().map(([w, c]) => [w, c] as [string, FoodCategory]),
);

/**
 * Words that describe a dish but are not a dish themselves ("cevizli baklava",
 * "kiremitte köfte", "ev yapımı lahmacun"). Next to a dish word they make one dish
 * phrase; alone they stay what they were (a place name, a quarter, a word).
 */
const MODIFIER_LIST = `cevizli, visneli, cilekli, muzlu, elmali, portakalli, mandalinali, seftalili, kayisili, incirli, kirazli, bademli, kakaolu, kremali, tahinli, pekmezli, kavrulmus, fistikli, peynirli, kiymali, etli, tavuklu, sebzeli, kasarli, sucuklu, pastirmali, kavurmali, yumurtali, patatesli, ispanakli, mantarli, firin, firinda, kiremitte, kiremit, tavada, tava, izgara, haslama, haslanmis, kizarmis, porsiyon, yarim, tam, duble, buyuk, kucuk, ev yapimi, koy, koylu, ciftlik, armut, ayva, kabak, elma, cilek, visne, kayisi, incir, muz, seftali, uzum, karpuz, kavun, nar, portakal, limon, mandalina, nane, tarcin, vanilya, findik, badem, hindistan cevizi, cikolatali, karamelli, kaymakli, sade, acili, aci, tatli, sicak, soguk, taze, kuru, yagli, yagsiz, tencerede, comlekte, kulde, kozde, mangalda, ocakta, sacta, sac, tandirda, tandir, tepsi, kagit, ince, kalin, yumusak, sulu, anne, nine, geleneksel, klasik, ozel, karisik, karma, mevsim, gunluk, organik, vegan, vejetaryen, light, diyet, limonlu, sarimsakli, soganli, domatesli, biberli, havuclu, kabakli, sirkeli, sutlu, yogurtlu, tereyagli, zeytinyagli, baharatli, sakizli, gulu, antep, maras, urfa, adana, yas, tel, burma, ic, kandil, pirinc, dana, kuzu, tavuk, pilic, hindi, sebze, domates, patates, havuc, ispanak, mantar, bezelye, barbunya, fasulye, nohut, bulgur, mercimek, yesil, kirmizi, beyaz, siyah, sari, kara, glutensiz, sekersiz, ev usulu, usulu, tarzi, kebapli, kofteli, salatali, ayranli, soslu, tursulu, balli, bademli, antep fistikli, susamli, hashasli, corekotlu, nutellali, tam bugday, bugday, eksi mayali, eksi, mayali, cavdar, tas, kepekli, lotuslu, dondurmali`;

export const MODIFIERS: ReadonlySet<string> = new Set(
  MODIFIER_LIST.split(',')
    .map((w) => w.replace(/\s+/g, ' ').trim())
    .filter(Boolean),
);

/**
 * Words that only describe a loaf before "ekmek" ("çavdar ekmeği", "taş fırın ekmek"): the phrase
 * is bread from a bakery. A dish word there ("sucuk ekmek", "tavuk ekmek") keeps its dish.
 */
export const BREAD_MODIFIER_WORDS: ReadonlySet<string> = new Set([
  'tam',
  'bugday',
  'eksi',
  'mayali',
  'cavdar',
  'koy',
  'tas',
  'firin',
  'kepekli',
  'misir',
  'sac',
  'sicak',
  'taze',
  'glutensiz',
  'tahilli',
]);

/** Dish modifiers written with -lı/-li/-lu/-lü ("peynirli") and the noun they come from ("peynir"). */
const MODIFIER_BASES: ReadonlySet<string> = new Set(
  [...MODIFIERS].filter((m) => /l[iu]$/.test(m) && m.length >= 6).map((m) => m.slice(0, -2)),
);

/** "salep sıcak", "kahve soğuk": how it is served, said after the drink. */
const TRAILING_TEMPERATURE: ReadonlySet<string> = new Set(['sicak', 'soguk']);

/**
 * True for a word that only describes the dish before it: "su böreği peynirli", "kumru
 * sucuklu", "pişi peynir", "menemen soğanlı". Only the -lı/-li/-lu forms of the modifier
 * list and their base nouns count, so a second dish ("kebap tavuk") is not read as one.
 */
export function isTrailingModifier(folded: string): boolean {
  return (
    (MODIFIERS.has(folded) && /l[iu]$/.test(folded)) ||
    MODIFIER_BASES.has(folded) ||
    TRAILING_TEMPERATURE.has(folded)
  );
}

/**
 * Words that say how a dish is served or sized, not what it is: said right before a dish
 * ("taze meyve suyu", "sade kahve") they belong to the dish phrase and are not a place.
 */
export const LEADING_GENERIC: ReadonlySet<string> = new Set([
  'taze',
  'sade',
  'sicak',
  'soguk',
  'porsiyon',
  'yarim',
  'duble',
  'mevsim',
]);

/** Number words, folded. */
const NUMBER_WORDS = 'bir iki uc dort bes alti yedi sekiz dokuz on yirmi otuz kirk elli yuz'.split(
  ' ',
);

/**
 * Words that say how much, how big or how it is ordered, not what the dish is ("baklava kilo",
 * "dondurma kase", "çay bardak", "şekerli kahve", "iskender yarım", "somon tabağı"). Folded;
 * some entries are phrases. They are dropped before a dish is looked up and never matched
 * against place names ("Kilogram", "Yarım Ekmek", "Usta Tabağı" are no answer to them).
 */
export const ORDER_WORDS: ReadonlySet<string> = new Set([
  'yarim',
  'ceyrek',
  'tam',
  'bucuk',
  'bir bucuk',
  'duble',
  'porsiyon',
  'porsiyonluk',
  'kilo',
  'kg',
  'gram',
  'gr',
  'yarim kilo',
  'kase',
  'kasesi',
  'kulah',
  'bardak',
  'fincan',
  'tabak',
  'tabagi',
  'tabaklik',
  'sise',
  'kutu',
  'dilim',
  'adet',
  'tane',
  'menu',
  'buyuk',
  'kucuk',
  'orta',
  'xl',
  'sekerli',
  'sekersiz',
  'orta sekerli',
  'az sekerli',
  'sade',
  'paket',
  'gel al',
  'eve servis',
  'yarim ekmek',
  'ceyrek ekmek',
  // Number words, and what a promotion says ("2 al 1 öde", "1 alana 1 bedava").
  ...NUMBER_WORDS,
  ...'al ode kampanya indirim bedava hediye alana'.split(' '),
]);

/** What a number takes for "of this many" ("6 lı", "8'li", "10 luk"), folded. */
const NUMBER_SUFFIXES: ReadonlySet<string> = new Set(['li', 'lu', 'lik', 'luk']);

/** How a dish is served ("pilav üstü döner"): the dish is the other word. Only dropped next to a dish. */
const SERVING_STYLES: ReadonlySet<string> = new Set(['pilav ustu']);

/** The single words of ORDER_WORDS: never a word to match in a place name. */
export const ORDER_SINGLE_WORDS: ReadonlySet<string> = new Set(
  [...ORDER_WORDS].filter((w) => !w.includes(' ')),
);

/** How many words from `i` on are an order or serving phrase (numbers too), 0 when none. */
export function orderSpan(ws: readonly string[], i: number): number {
  const w = ws[i] ?? '';
  // "6 lı", "8'li", "6lı": a count of pieces, not a word to search.
  if ((/^\d+$/.test(w) || NUMBER_WORDS.includes(w)) && NUMBER_SUFFIXES.has(ws[i + 1] ?? ''))
    return 2;
  if (/^\d+(?:li|lu|lik|luk)$/.test(w)) return 1;
  for (const len of [3, 2, 1]) {
    if (i + len > ws.length) continue;
    const phrase = ws.slice(i, i + len).join(' ');
    if (ORDER_WORDS.has(phrase) || SERVING_STYLES.has(phrase)) return len;
  }
  return /^\d+$/.test(ws[i] ?? '') ? 1 : 0;
}

/**
 * Cities and regions whose name styles a dish ("piyaz antalya", "iskender bursa"): said after
 * the dish they are a style, not a place to look in. An İzmir district is never one of them.
 */
export const CITY_STYLES: ReadonlySet<string> = new Set([
  'antalya',
  'adana',
  'urfa',
  'sanliurfa',
  'bursa',
  'kayseri',
  'trabzon',
  'antep',
  'gaziantep',
  'siirt',
  'konya',
  'maras',
  'kahramanmaras',
  'mersin',
  'hatay',
  'antakya',
  'tokat',
  'erzurum',
  'diyarbakir',
  'ankara',
  'istanbul',
  'samsun',
  'rize',
  'sivas',
  'malatya',
  'mardin',
  'edirne',
  'eskisehir',
  'afyon',
  'giresun',
  'kars',
]);

/** The generic meal words: "sebze yemeği" names a category, not a dish. */
export const MEAL_WORDS: readonly string[] = ['yemek', 'yemegi', 'yemekleri', 'yemekler'];

/**
 * Words of a dish phrase that are never matched against place names: the generic meal
 * words ("sebze yemeği") and the ones that only say how the dish is served.
 */
export const GENERIC_NAME_WORDS: ReadonlySet<string> = new Set([
  ...MEAL_WORDS,
  'ev',
  'cesit',
  'cesitleri',
  'menu',
  ...LEADING_GENERIC,
]);

/**
 * Spellings that are one dish written another way, for the ones no generic joined /
 * split rule can find: "çibörek" is çiğ börek. `key` is the folded token.
 */
const SPELLING_ALIASES = [
  { key: 'ciborek', folded: 'cig borek', written: 'çiğ börek' },
  ...foreignNames(),
];

/**
 * Common dish names of other languages and their Turkish dish: a guest who writes "Frikadellen",
 * "meatballs", "gyros" or "San Sebastian" asks for köfte, döner or a cheesecake. Folded keys, the
 * singular and plural spellings apart where the plural is no regular tail; a key with a space is a
 * phrase. The dish on the right is a dish of the app's own dictionary (dishes.ts).
 */
function foreignNames(): { key: string; folded: string; written: string }[] {
  const to = (folded: string, written: string, ...keys: string[]) =>
    keys.map((key) => ({ key, folded, written }));
  // Only names the dictionary does not know yet: a name that already has a dish of its own
  // (spaghetti, shawarma, dumpling, kibbeh ...) keeps it.
  return [
    // Desserts
    ...to('cheesecake', 'cheesecake', 'san sebastian cheesecake', 'sansebastian'),
    ...to('krep', 'krep', 'pancakes', 'crepes', 'blini', 'blinis'),
    ...to('baklava', 'baklava', 'baklawa'),
    ...to('kunefe', 'künefe', 'knafeh', 'kunafa', 'kanafeh', 'kunafeh'),
    ...to('dondurma', 'dondurma', 'icecream', 'ice cream'),
    ...to('lokum', 'lokum', 'turkish delight'),
    ...to('profiterol', 'profiterol', 'profiterole', 'profiteroles'),
    ...to('sutlac', 'sütlaç', 'rice pudding'),
    // Meat, kebab and fast food
    ...to('kofte', 'köfte', 'frikadelle', 'frikadellen', 'kofta', 'meatball', 'meatballs'),
    ...to('kofte', 'köfte', 'cevapi', 'cevapcici', 'polpette', 'albondigas'),
    ...to('doner', 'döner', 'gyros', 'shawerma', 'schawarma', 'doner kebab'),
    ...to('sis kebap', 'şiş kebap', 'shish', 'shish kebab'),
    ...to('sosisli', 'sosisli', 'bratwurst', 'currywurst', 'wurst', 'sausage', 'sausages'),
    ...to('patates kizartmasi', 'patates kızartması', 'fries', 'french fries', 'frites', 'pommes'),
    ...to('icli kofte', 'içli köfte', 'kubbeh'),
    ...to('lahmacun', 'lahmacun', 'lahmajun', 'lahmacoun', 'turkish pizza'),
    // Dough and stuffed dishes
    ...to('simit', 'simit', 'pretzel', 'pretzels', 'brezel'),
    ...to('manti', 'mantı', 'dumplings', 'khinkali'),
    ...to('borek', 'börek', 'burek', 'burekas', 'bourekas'),
    ...to('lazanya', 'lazanya', 'lasagne'),
    ...to('dolma', 'dolma', 'dolmades', 'dolmas'),
    ...to('humus', 'humus', 'houmous'),
  ];
}

/** What may follow an aliased word: the compound ending ("çiböreği"), plural or seller. */
const ALIAS_TAILS = ['i', 'in', 'e', 'ler', 'leri', 'lar', 'ci', 'cu'];

/** The dish a folded token is another spelling of ("ciborek", "ciboregi"), folded and as written, or null. */
export function respellAlias(token: string): { folded: string; written: string } | null {
  for (const a of SPELLING_ALIASES) {
    if (token === a.key) return a;
    const tail = (stem: string) => (token.startsWith(stem) ? token.slice(stem.length) : '');
    const plain = tail(a.key);
    if (ALIAS_TAILS.includes(plain)) {
      return { folded: a.folded + plain, written: a.written + plain };
    }
    // The final k softens before a vowel: "ciborek" -> "ciboregi".
    const soft = tail(`${a.key.slice(0, -1)}g`);
    if (a.key.endsWith('k') && ALIAS_TAILS.includes(soft)) {
      return {
        folded: `${a.folded.slice(0, -1)}g${soft}`,
        written: `${a.written.slice(0, -1)}ğ${soft}`,
      };
    }
  }
  return null;
}
