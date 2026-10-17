// Hard cases for the live AI eval (scripts/ai-eval.ts): messages written the way people really
// write (slang, filler, typos, a request split over two messages) and pick choices that need
// judgment. Each one checks only what a right answer must have, so a different but sensible
// reading still passes.
import type { FoodCategory } from '../restaurants';
import type { AiCityId, ChatTurn, PickCandidate } from '@/lib/ai/protocol';

export type UnderstandCase = {
  name: string;
  city?: AiCityId;
  history?: ChatTurn[];
  text: string;
  expect: {
    /** One of these kinds. */
    kind?: ('search' | 'chat' | 'unknown')[];
    /** District name as the city spells it, or null for none. */
    district?: string | null;
    food?: boolean;
    nearMe?: boolean;
    requireParking?: boolean;
    /** No place / business name: filler or an address word is not one. */
    noPlace?: boolean;
    /** The category, when given, is one of these. */
    catIn?: (FoodCategory | null)[];
    /** The category is none of these. */
    catNot?: FoodCategory[];
    notCat?: FoodCategory;
    /** The dish contains one of these (folded). */
    dishHas?: string[];
    /** The model's own reading (meaning) keeps the earlier request: contains one of these. */
    meaningHas?: string[];
  };
};

const vegAsk: ChatTurn[] = [
  { role: 'user', text: 'Yo hocam ben vejeteryenim kardo ona göre' },
  { role: 'bot', text: 'Hangi semtte vejetaryen yemek istersiniz?' },
];
const VEG = ['vejet', 'vegan', 'etsiz', 'sebze'];

export const UNDERSTAND_CASES: UnderstandCase[] = [
  {
    name: 'filler around a district answer keeps the diet',
    history: vegAsk,
    text: 'Hmmmmmm buca bro',
    expect: { kind: ['search'], district: 'Buca', food: true, noPlace: true, meaningHas: VEG },
  },
  {
    name: 'an address word is not a place',
    history: vegAsk,
    text: 'Bornova hacı',
    expect: { kind: ['search'], district: 'Bornova', food: true, noPlace: true, meaningHas: VEG },
  },
  {
    name: 'near me as an answer keeps the diet',
    history: vegAsk,
    text: 'yakınımda bro',
    expect: { kind: ['search'], nearMe: true, food: true, meaningHas: VEG },
  },
  {
    name: 'a diet in slang is a food request, not one category',
    text: 'Babo bilmiyorsan söylim ben bir vejeteryenim agaa',
    expect: { kind: ['search'], food: true, catNot: ['meat', 'fish'] },
  },
  {
    name: 'a diet in a long greeting',
    text: 'Esenlikler hocaefendi ben vejeteryenim birader ona göre bir şey ayarla',
    expect: { kind: ['search'], food: true, catNot: ['meat', 'fish'] },
  },
  {
    name: 'a goal is food, never dessert or coffee',
    text: 'kas yapmam lazım protein lazım bana',
    expect: { kind: ['search'], food: true, catNot: ['dessert', 'cafe'] },
  },
  {
    name: 'a mood is food',
    text: 'üşüdüm ya sıcak bir şeyler içsem',
    expect: { kind: ['search'], food: true },
  },
  {
    name: 'a ruled-out category',
    text: "Karşıyaka'da bir şeyler yiyelim ama kebap olmasın",
    expect: { kind: ['search'], district: 'Karşıyaka', notCat: 'meat', catNot: ['meat'] },
  },
  {
    name: 'a ruled-out category in slang',
    text: 'tatlı moatlı istemem doyurucu bi şey olsun',
    expect: { kind: ['search'], food: true, notCat: 'dessert', catNot: ['dessert'] },
  },
  {
    name: 'a dish with filler',
    text: "hacı abi Alsancak'ta lahmacun var mı ya",
    expect: { kind: ['search'], food: true, dishHas: ['lahmacun'] },
  },
  {
    name: 'parking only',
    text: 'Konak tarafında park yeri arıyorum',
    expect: { kind: ['search'], district: 'Konak', food: false },
  },
  {
    name: 'food with parking required',
    text: 'otoparkı olan bi balıkçı lazım Alsancak civarı',
    expect: { kind: ['search'], catIn: ['fish'], requireParking: true },
  },
  {
    name: 'same request elsewhere',
    history: [
      { role: 'user', text: "Bornova'da kahvaltı" },
      { role: 'bot', text: 'Bornova civarında 40 kahvaltı yeri var.' },
    ],
    text: "bir de Buca'da bak",
    expect: { kind: ['search'], district: 'Buca', catIn: ['breakfast'] },
  },
  {
    name: 'off topic stays chat',
    text: 'dünkü galatasaray maçı kaç bitti',
    expect: { kind: ['chat'] },
  },
  {
    name: 'gibberish is not guessed',
    text: 'asdkj qwpoe zxmn',
    expect: { kind: ['unknown', 'chat'] },
  },
  {
    name: 'another city: its own districts',
    city: 'ankara',
    text: "Çankaya'da vejetaryen bir şeyler",
    expect: { kind: ['search'], district: 'Çankaya', food: true, catNot: ['meat', 'fish'] },
  },
  {
    name: 'another city: answer to a district question',
    city: 'antalya',
    history: vegAsk,
    text: 'muratpaşa olsun abi',
    expect: { kind: ['search'], district: 'Muratpaşa', food: true, meaningHas: VEG },
  },
];

export type PickCase = {
  name: string;
  text: string;
  candidates: PickCandidate[];
  expect: {
    /** The pick is one of these indices. */
    pickIn?: number[];
    /** None of these is picked or listed as fitting. */
    notFit?: number[];
    noneFit?: boolean;
  };
};

const place = (
  i: number,
  name: string,
  type: string,
  walkMin = 4,
  parkingM: number | null = 120,
): PickCandidate => ({
  i,
  kind: 'restaurant',
  name,
  type,
  walkMin,
  openState: 'unknown',
  closesLate: false,
  parkingM,
  parkingFree: null,
  freeSpots: null,
  dishMatch: 'none',
  outdoor: null,
});

export const PICK_CASES: PickCase[] = [
  {
    name: 'vegetarian: a lokanta fits, a butcher does not',
    text: 'Bornova’da vejetaryen yemek istiyor ("vejetaryenim")',
    candidates: [
      place(0, 'Kasap Fuat', 'Et, restoran', 2),
      place(1, 'Tatlıcı Hasan', 'Tatlı & Dondurma, pastane', 3),
      place(2, 'Ev Yemekleri Lokantası', 'Lokanta, restoran, Ev yemekleri', 5),
      place(3, 'Köfteci Yusuf', 'Et, restoran, Kebap', 4),
      place(4, 'Ocakbaşı Mangal', 'Et, restoran, Izgara', 6),
    ],
    expect: { pickIn: [2], notFit: [0, 3, 4] },
  },
  {
    name: 'protein: never a pastry shop or coffee',
    text: 'kas yapmak için proteinli bir şey istiyor ("protein lazım")',
    candidates: [
      place(0, 'Pastane Saray', 'Tatlı & Dondurma, pastane', 1),
      place(1, 'Kahve Diyarı', 'Kafe, Kahve', 2),
      place(2, 'Tavuk Dünyası', 'Fast food, restoran, Tavuk', 5),
      place(3, 'Izgara Köfte Evi', 'Et, restoran, Izgara', 6),
      place(4, 'Waffle Durağı', 'Tatlı & Dondurma, kafe, Waffle', 2),
    ],
    expect: { pickIn: [2, 3], notFit: [0, 1, 4] },
  },
  {
    name: 'nothing nearby fits: the vegan place a little further',
    text: 'vejetaryen yemek istiyor ("vejetaryenim")',
    candidates: [
      place(0, 'Kasap Ali', 'Et, restoran', 2),
      place(1, 'Köfteci Ramiz', 'Et, restoran, Kebap', 3),
      place(2, 'Balıkçı Kemal', 'Balık, restoran, Balık', 4),
      place(3, 'Cafe Eli Coffeehouse and Vegan Food', 'Kafe, Vegan', 15),
    ],
    expect: { pickIn: [3], notFit: [0, 1] },
  },
  {
    name: 'diet labels are data: the place tagged gluten-free',
    text: 'çölyak hastası, glutensiz yemek istiyor',
    candidates: [
      place(0, 'Fırın Ekmek', 'Kahvaltı, fırın', 2),
      place(1, 'Yeşil Mutfak', 'Lokanta, Glutensiz seçenek var, restoran', 5),
      place(2, 'Pideci Mehmet', 'Fast food, restoran, Pide', 3),
    ],
    expect: { pickIn: [1], notFit: [0, 2] },
  },
  {
    name: 'a dessert wish picks dessert',
    text: 'tatlı bir şey istiyor',
    candidates: [
      place(0, 'Kebapçı Halil', 'Et, restoran, Kebap', 1),
      place(1, 'Baklavacı Güllüoğlu', 'Tatlı & Dondurma, pastane, Tatlı', 4),
      place(2, 'Balık Ekmek', 'Balık, fast food', 2),
    ],
    expect: { pickIn: [1], notFit: [0, 2] },
  },
  {
    name: 'nothing fits: say so',
    text: 'balık yemek istiyor ("balık")',
    candidates: [
      place(0, 'Kahve Sokağı', 'Kafe, Kahve', 2),
      place(1, 'Pastane Saray', 'Tatlı & Dondurma, pastane', 3),
      place(2, 'Burger House', 'Fast food, restoran, Burger', 4),
    ],
    expect: { noneFit: true },
  },
];
