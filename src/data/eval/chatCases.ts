import type { FoodCategory } from '../restaurants';

export type ChatCase = {
  text: string;
  group:
    | 'basic'
    | 'dish'
    | 'slang_typo'
    | 'negation'
    | 'parking'
    | 'near_me'
    | 'vague'
    | 'offtopic'
    | 'greeting_abuse'
    | 'followup';
  expect: Partial<{
    kind: 'greeting' | 'abuse' | 'offtopic' | 'search' | 'empty';
    cat: FoodCategory | null;
    district: string | null;
    requireParking: boolean;
    nearMe: boolean;
    food: boolean;
  }>;
  /** What a good answer must avoid, e.g. the negated category. */
  notCat?: FoodCategory;
  /** True when we accept that rules alone cannot get this right (AI needed). */
  aiExpected?: boolean;
};

/**
 * Expected values are what a correct understanding is, not what parseQuery returns today.
 * Neighbourhoods (Alsancak, Bostanlı, Kordon) are not districts, so district is null for them.
 */
export const CHAT_CASES: ChatCase[] = [
  // basic (10)
  {
    text: 'bornovada köfteci',
    group: 'basic',
    expect: { kind: 'search', cat: 'meat', district: 'Bornova' },
  },
  {
    text: 'alsancak kahvaltı',
    group: 'basic',
    expect: { kind: 'search', cat: 'breakfast', district: null },
  },
  {
    text: 'karşıyakada balık',
    group: 'basic',
    expect: { kind: 'search', cat: 'fish', district: 'Karşıyaka' },
  },
  {
    text: 'konakta çorba',
    group: 'basic',
    expect: { kind: 'search', cat: 'soup', district: 'Konak' },
  },
  {
    text: 'bucada pide',
    group: 'basic',
    expect: { kind: 'search', cat: 'fast', district: 'Buca' },
  },
  {
    text: 'çiğlide kebap',
    group: 'basic',
    expect: { kind: 'search', cat: 'meat', district: 'Çiğli' },
  },
  {
    text: 'kordonda kafe',
    group: 'basic',
    expect: { kind: 'search', cat: 'cafe', district: null },
  },
  {
    text: 'urlada meyhane',
    group: 'basic',
    expect: { kind: 'search', cat: 'meyhane', district: 'Urla' },
  },
  {
    text: 'balçovada tatlı',
    group: 'basic',
    expect: { kind: 'search', cat: 'dessert', district: 'Balçova' },
  },
  {
    text: 'çeşmede balık restoranı',
    group: 'basic',
    expect: { kind: 'search', cat: 'fish', district: 'Çeşme' },
  },

  // slang_typo (8)
  {
    text: 'karşıyakada balık yiyecem',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'fish', district: 'Karşıyaka' },
  },
  {
    text: 'bostanlida kahvalti',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'breakfast', district: null },
  },
  {
    text: 'burnovada corba',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'soup', district: 'Bornova' },
  },
  {
    text: 'bornavada kofteci',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'meat', district: 'Bornova' },
  },
  {
    text: 'alsancakta kebapçı abi var mı',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'meat', district: null },
  },
  {
    text: 'gaziemirde lahmcun',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'fast', district: 'Gaziemir' },
  },
  {
    text: 'narlıdere de döner',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'fast', district: 'Narlıdere' },
  },
  {
    text: 'çeşmde tatlıcı lazım',
    group: 'slang_typo',
    expect: { kind: 'search', cat: 'dessert', district: 'Çeşme' },
  },

  // negation (5)
  {
    text: 'alsancakta et yemek istiyorum ama kebap olmasın',
    group: 'negation',
    expect: { kind: 'search', cat: 'meat', district: null },
    aiExpected: true,
  },
  {
    text: 'bornovada balık olmasın bi şeyler yiyelim',
    group: 'negation',
    expect: { kind: 'search', district: 'Bornova', food: true },
    notCat: 'fish',
    aiExpected: true,
  },
  {
    text: 'karşıyakada kahvaltı istemiyorum çorba olsun',
    group: 'negation',
    expect: { kind: 'search', cat: 'soup', district: 'Karşıyaka' },
    notCat: 'breakfast',
  },
  {
    text: 'köfte değil de balık yiyelim konakta',
    group: 'negation',
    expect: { kind: 'search', cat: 'fish', district: 'Konak' },
    notCat: 'meat',
    aiExpected: true,
  },
  {
    text: 'tatlı istemem bucada bir şeyler',
    group: 'negation',
    expect: { kind: 'search', district: 'Buca', food: true },
    notCat: 'dessert',
    aiExpected: true,
  },

  // parking (6)
  {
    text: 'urlada kahvaltıcı otoparkı olsun şart',
    group: 'parking',
    expect: { kind: 'search', cat: 'breakfast', district: 'Urla', requireParking: true },
  },
  {
    text: 'otoparklı balıkçı çeşme',
    group: 'parking',
    expect: { kind: 'search', cat: 'fish', district: 'Çeşme', requireParking: true },
  },
  {
    text: 'alsancakta arabayla gideceğim park yeri olan kebapçı',
    group: 'parking',
    expect: { kind: 'search', cat: 'meat', requireParking: true },
  },
  {
    text: 'bornovada otoparkı olan köfteci',
    group: 'parking',
    expect: { kind: 'search', cat: 'meat', district: 'Bornova', requireParking: true },
  },
  {
    text: 'arabayla geleceğim karşıyakada otoparklı kahvaltı',
    group: 'parking',
    expect: { kind: 'search', cat: 'breakfast', district: 'Karşıyaka', requireParking: true },
  },
  {
    text: 'konakta otopark nerede',
    group: 'parking',
    expect: { kind: 'search', cat: null, district: 'Konak', requireParking: false, food: false },
  },

  // near_me (5)
  {
    text: 'yakınımda pideci',
    group: 'near_me',
    expect: { kind: 'search', cat: 'fast', nearMe: true },
  },
  {
    text: 'buralarda açık çorbacı var mı',
    group: 'near_me',
    expect: { kind: 'search', cat: 'soup', nearMe: true },
  },
  {
    text: 'yakınımdaki kahvaltıcı',
    group: 'near_me',
    expect: { kind: 'search', cat: 'breakfast', nearMe: true },
  },
  {
    text: 'etrafta balık yiyebileceğim bir yer',
    group: 'near_me',
    expect: { kind: 'search', cat: 'fish', nearMe: true },
  },
  {
    text: 'bana en yakın kafe',
    group: 'near_me',
    expect: { kind: 'search', cat: 'cafe', nearMe: true },
  },

  // vague (6): rules likely fail, AI expected
  {
    text: 'akşam romantik bir yer',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },
  {
    text: 'çocukla gidilecek bir mekan',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },
  {
    text: 'deniz kenarında oturup bir şeyler içelim',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },
  {
    text: 'canım bir şey çekiyor ama ne bilmiyorum',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },
  {
    text: 'arkadaşlarla kalabalık gidiyoruz ucuz bir yer olsun',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },
  {
    text: 'sürpriz yap bana bir şey öner',
    group: 'vague',
    expect: { kind: 'search', food: true },
    aiExpected: true,
  },

  // dish (6)
  {
    text: 'lahmacun yemek istiyorum',
    group: 'dish',
    expect: { kind: 'search', cat: 'fast', food: true, nearMe: false },
  },
  {
    text: 'canım iskender çekti',
    group: 'dish',
    expect: { kind: 'search', cat: 'meat', food: true },
  },
  {
    text: 'kumpir nerede yenir',
    group: 'dish',
    expect: { kind: 'search', cat: 'fast', food: true },
  },
  {
    text: 'bana en yakın tavuk pilavcı bul',
    group: 'dish',
    expect: { kind: 'search', cat: 'lokanta', food: true, nearMe: true },
  },
  {
    text: 'mantı yiyecek yer',
    group: 'dish',
    expect: { kind: 'search', cat: 'lokanta', food: true },
  },
  {
    text: 'boyoz gevrek',
    group: 'dish',
    expect: { kind: 'search', cat: 'breakfast', food: true },
  },

  // offtopic (4)
  { text: 'dün maç kaç kaç bitti', group: 'offtopic', expect: { kind: 'offtopic' } },
  { text: 'hava nasıl', group: 'offtopic', expect: { kind: 'offtopic' } },
  { text: 'dolar kaç oldu bugün', group: 'offtopic', expect: { kind: 'offtopic' } },
  { text: 'bana bir fıkra anlat', group: 'offtopic', expect: { kind: 'offtopic' } },

  // greeting_abuse (3)
  { text: 'selam nasılsın', group: 'greeting_abuse', expect: { kind: 'greeting' } },
  { text: 'salak mısın', group: 'greeting_abuse', expect: { kind: 'abuse' } },
  { text: 'günaydın naber', group: 'greeting_abuse', expect: { kind: 'greeting' } },

  // followup (3): evaluated without context, so AI (with history) is expected
  {
    text: "bir de buca'da bak",
    group: 'followup',
    expect: { kind: 'search', district: 'Buca' },
    aiExpected: true,
  },
  {
    text: 'daha yakını var mı',
    group: 'followup',
    expect: { kind: 'search', nearMe: true },
    aiExpected: true,
  },
  {
    text: 'otoparkı ücretsiz olsun',
    group: 'followup',
    expect: { kind: 'search', requireParking: true },
    aiExpected: true,
  },
];
