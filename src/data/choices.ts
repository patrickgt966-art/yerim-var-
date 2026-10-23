import { KIND_IDS, type KindId, type Wish } from '../lib/ai/protocol';
import {
  categoryOf,
  hasWordForm,
  matchesCategory,
  type FoodCategory,
  type Restaurant,
} from './restaurants';
import { fold } from './search';

/**
 * "Broad ask -> choices", one table. A broad ask (a goal such as "kaslıyım", "fit", "hızlı bir şey",
 * or a broad category such as "tatlı", "et") has several kinds of places that answer it. Each entry
 * lists those kinds (members); the chat asks which one (kind 'ask') or shows the broad category and
 * offers the members as narrowing chips (a plain category). No menu or price data is behind any of
 * this: a member is only a kind of place that usually fits, found by category, cuisine or diet tag,
 * or a keyword in the name. Words are folded (see search.ts).
 */
export type Member = {
  id: string;
  /** Chip label (tr / en). The reason on a card is this label in lower case plus the entry's reason. */
  tr: string;
  en: string;
  /** Category rules (name keywords, cuisine tags, kind), see restaurants.ts. */
  cat?: FoodCategory;
  /** Folded name words; a word of 3 letters or fewer must be the whole name word (see hasWordForm). */
  names?: string[];
  /** A name that carries one of these folded parts is not this member ("Kilo Kontrol Merkezi"). */
  notNames?: string[];
  cuisines?: string[];
  diets?: string[];
  kinds?: string[];
  /** Folded words a typed answer may use for this member ("balik", "izgara"). */
  words: string[];
};

export type ChoiceEntry = {
  id: string;
  /** The wishes that make this ask (a wish is a goal / mood the user said without naming a category). */
  wishes?: Wish[];
  /** The broad category this entry belongs to: narrowing chips after it, or the ask for a vague wording. */
  cat?: FoodCategory;
  /** The wish alone says it is food (a goal): no food word is needed. */
  goal?: boolean;
  /** With `cat`: ask first only when the wording is vague ("tatlı bir şey", "canım tatlı çekti"). */
  askWhenVague?: boolean;
  /** With a category or dish named, the members of the entry still come first ("fit balık"). */
  reorder?: boolean;
  /** Short reason after the member label on a card ("balık · yüksek protein"). */
  reason: { tr: string; en: string };
  /** The honest sentence (with the members shown) is written: there is no menu / price data. */
  note?: boolean;
  members: Member[];
};

const GRILL_NAMES = ['izgara', 'grill', 'mangal', 'ocakbasi'];

/** Kinds that only the table entries use: another kind of the catalog has their label, so the router is not offered them. */
export type TableKindId = 'meatgrill' | 'fitbowl';

/**
 * The catalog of kinds of place, one definition per id (the entries below reference ids). The
 * router picks from `KindId`s (protocol.ts KIND_NAMES) for a goal or situation the table has no
 * entry for; the table entries use the same definitions. A kind is only found by category, cuisine,
 * diet tag or a keyword in the name: no menu data is behind it. Where two entries meant different
 * things by one word (the "Izgara" of the protein entry is the whole meat category, the one of the
 * healthy entry is places named so), they are two ids.
 */
export const KINDS: Record<KindId | TableKindId, Member> = {
  grill: {
    id: 'grill',
    tr: 'Izgara',
    en: 'Grill',
    names: GRILL_NAMES,
    cuisines: ['grill', 'barbecue'],
    words: ['izgara'],
  },
  meatgrill: {
    id: 'meatgrill',
    tr: 'Izgara',
    en: 'Grill',
    cat: 'meat',
    words: ['izgara', 'kebap', 'kofte', 'et', 'mangal'],
  },
  fish: { id: 'fish', tr: 'Balık', en: 'Fish', cat: 'fish', words: ['balik'] },
  chicken: {
    id: 'chicken',
    tr: 'Tavuk',
    en: 'Chicken',
    names: ['tavuk', 'chicken', 'pilic'],
    cuisines: ['chicken'],
    words: ['tavuk', 'pilic'],
  },
  steak: {
    id: 'steak',
    tr: 'Steak',
    en: 'Steak',
    names: ['steak', 'biftek', 'antrikot', 'bonfile'],
    cuisines: ['steak_house'],
    words: ['steak', 'biftek'],
  },
  bowl: {
    id: 'bowl',
    tr: 'Bowl',
    en: 'Bowl',
    names: ['bowl', 'poke', 'fit', 'healthy', 'saglikli', 'diyet'],
    notNames: ['kilo', 'kulup', 'merkezi', 'spor'],
    cuisines: ['poke', 'healthy', 'juice'],
    words: ['bowl', 'poke', 'fit'],
  },
  fitbowl: {
    id: 'fitbowl',
    tr: 'Bowl',
    en: 'Bowl',
    names: ['bowl', 'protein', 'proteinli', 'fit', 'fitness'],
    notNames: ['kilo', 'kulup', 'merkezi', 'spor'],
    words: ['bowl', 'fit'],
  },
  salad: {
    id: 'salad',
    tr: 'Salata',
    en: 'Salad',
    names: ['salata', 'salad'],
    cuisines: ['salad'],
    words: ['salata', 'salad'],
  },
  vegan: {
    id: 'vegan',
    tr: 'Vegan',
    en: 'Vegan',
    names: ['vegan', 'vejetaryen', 'vejeteryan', 'vegetarian'],
    cuisines: ['vegan', 'vegetarian'],
    diets: ['vegan', 'vegetarian'],
    words: ['vegan', 'vejetaryen', 'vejeteryan'],
  },
  soup: { id: 'soup', tr: 'Çorba', en: 'Soup', cat: 'soup', words: ['corba'] },
  zeytinyagli: {
    id: 'zeytinyagli',
    tr: 'Zeytinyağlı',
    en: 'Home-style',
    cat: 'lokanta',
    names: ['zeytinyagli'],
    words: ['zeytinyagli', 'lokanta'],
  },
  lokanta: {
    id: 'lokanta',
    tr: 'Esnaf lokantası',
    en: 'Local eatery',
    cat: 'lokanta',
    words: ['lokanta', 'esnaf'],
  },
  doner: {
    id: 'doner',
    tr: 'Döner',
    en: 'Doner',
    names: ['doner', 'durum', 'tantuni'],
    cuisines: ['doner', 'döner'],
    words: ['doner', 'durum'],
  },
  pide: {
    id: 'pide',
    tr: 'Pide / Lahmacun',
    en: 'Pide / Lahmacun',
    names: ['pide', 'pideci', 'lahmacun', 'lahmacuncu'],
    cuisines: ['pide', 'lahmacun'],
    words: ['pide', 'lahmacun'],
  },
  burger: {
    id: 'burger',
    tr: 'Burger',
    en: 'Burger',
    names: ['burger', 'hamburger'],
    cuisines: ['burger'],
    words: ['burger', 'hamburger'],
  },
  tost: {
    id: 'tost',
    tr: 'Tost / Sandviç',
    en: 'Toast / Sandwich',
    names: ['tost', 'sandvic', 'sandwich', 'kumru'],
    cuisines: ['sandwich', 'tost', 'kumru'],
    words: ['tost', 'sandvic', 'sandwich'],
  },
  baklava: {
    id: 'baklava',
    tr: 'Baklava',
    en: 'Baklava',
    names: ['baklava', 'baklavaci'],
    words: ['baklava'],
  },
  kunefe: {
    id: 'kunefe',
    tr: 'Künefe',
    en: 'Künefe',
    names: ['kunefe', 'kunefeci'],
    words: ['kunefe'],
  },
  icecream: {
    id: 'icecream',
    tr: 'Dondurma',
    en: 'Ice cream',
    names: ['dondurma', 'dondurmaci', 'gelato'],
    cuisines: ['ice_cream'],
    kinds: ['ice_cream'],
    words: ['dondurma', 'gelato'],
  },
  pastry: {
    id: 'pastry',
    tr: 'Pasta / Pastane',
    en: 'Cake / Pastry',
    names: ['pastane', 'pastanesi', 'patisserie', 'pasta evi', 'pasta salonu', 'cake'],
    cuisines: ['cake', 'pastry'],
    kinds: ['pastry'],
    words: ['pasta', 'pastane', 'cake'],
  },
  pudding: {
    id: 'pudding',
    tr: 'Sütlaç / Muhallebi',
    en: 'Pudding',
    names: ['sutlac', 'muhallebi', 'muhallebici', 'kazandibi', 'tatlici', 'tatli'],
    cuisines: ['dessert'],
    words: ['sutlac', 'muhallebi'],
  },
  kebab: {
    id: 'kebab',
    tr: 'Kebap',
    en: 'Kebab',
    names: ['kebap', 'kebab', 'kebapci', 'sis', 'adana', 'urfa', 'ocakbasi'],
    cuisines: ['kebab'],
    words: ['kebap', 'kebab'],
  },
  kofte: {
    id: 'kofte',
    tr: 'Köfte',
    en: 'Meatballs',
    names: ['kofte', 'kofteci'],
    cuisines: ['meatball', 'köfte', 'kofte'],
    words: ['kofte'],
  },
  liver: { id: 'liver', tr: 'Ciğer', en: 'Liver', names: ['ciger', 'cigerci'], words: ['ciger'] },
  italian: {
    id: 'italian',
    tr: 'Pizza / İtalyan',
    en: 'Pizza / Italian',
    names: ['pizza', 'pizzeria', 'italyan', 'pasta evi'],
    cuisines: ['pizza', 'italian', 'pasta'],
    words: ['pizza', 'italyan'],
  },
  asian: {
    id: 'asian',
    tr: 'Sushi / Asya',
    en: 'Sushi / Asian',
    names: ['sushi', 'noodle', 'ramen', 'wok'],
    cuisines: ['sushi', 'asian', 'japanese', 'chinese', 'korean', 'noodles', 'thai', 'vietnamese'],
    words: ['sushi', 'asya', 'cin', 'cin mutfagi'],
  },
  mexican: {
    id: 'mexican',
    tr: 'Meksika',
    en: 'Mexican',
    names: ['taco', 'burrito', 'meksika'],
    cuisines: ['mexican'],
    words: ['meksika', 'taco'],
  },
  med: {
    id: 'med',
    tr: 'Akdeniz',
    en: 'Mediterranean',
    cuisines: ['mediterranean', 'greek', 'french', 'international'],
    words: ['akdeniz', 'yunan'],
  },
  serpme: {
    id: 'serpme',
    tr: 'Serpme kahvaltı',
    en: 'Full breakfast',
    names: ['serpme', 'kahvalti', 'kahvaltici'],
    cuisines: ['breakfast'],
    words: ['serpme'],
  },
  borek: {
    id: 'borek',
    tr: 'Börek / Poğaça',
    en: 'Börek / Pastries',
    names: ['borek', 'borekci', 'pogaca', 'acma'],
    words: ['borek', 'pogaca'],
  },
  simit: {
    id: 'simit',
    tr: 'Simit / Gevrek',
    en: 'Simit / Bagel',
    names: ['simit', 'gevrek', 'boyoz'],
    cuisines: ['bagel'],
    words: ['simit', 'gevrek'],
  },
  omelet: {
    id: 'omelet',
    tr: 'Menemen / Omlet',
    en: 'Eggs',
    names: ['menemen', 'omlet', 'yumurta'],
    words: ['menemen', 'omlet'],
  },
  // Kinds the table has no entry for; found by name or tag in at least two cities (choices.test.ts).
  cigkofte: {
    id: 'cigkofte',
    tr: 'Çiğ köfte',
    en: 'Çiğ köfte',
    names: ['cigkofte', 'cig kofte', 'cigkofteci'],
    cuisines: ['çiğköfte', 'çiğ_köfte', 'cig_kofte'],
    words: ['cigkofte', 'cig kofte'],
  },
  kokorec: {
    id: 'kokorec',
    tr: 'Kokoreç',
    en: 'Kokoreç',
    names: ['kokorec', 'kokorecci'],
    cuisines: ['kokoreç'],
    words: ['kokorec'],
  },
  manti: {
    id: 'manti',
    tr: 'Mantı',
    en: 'Mantı',
    names: ['manti', 'mantici'],
    cuisines: ['mantı', 'tepsi_mantısı'],
    words: ['manti'],
  },
  pilav: {
    id: 'pilav',
    tr: 'Pilav',
    en: 'Rice dishes',
    names: ['pilav', 'pilavci'],
    cuisines: ['pilav', 'türkistan_pilavı'],
    words: ['pilav'],
  },
  evyemegi: {
    id: 'evyemegi',
    tr: 'Ev yemekleri',
    en: 'Home cooking',
    names: ['ev yemek', 'ev yemegi', 'ev mutfagi', 'ev lezzetleri', 'ev yapimi'],
    cuisines: ['ev_yemekleri', 'home_cooking'],
    words: ['ev yemegi', 'ev yemekleri', 'ev yemek'],
  },
  meyhane: {
    id: 'meyhane',
    tr: 'Meyhane',
    en: 'Meyhane',
    cat: 'meyhane',
    words: ['meyhane', 'raki', 'meze'],
  },
  cafe: {
    id: 'cafe',
    tr: 'Kafe / Kahve',
    en: 'Café / Coffee',
    cat: 'cafe',
    words: ['cafe', 'kafe', 'kahve'],
  },
  islak: {
    id: 'islak',
    tr: 'Islak burger',
    en: 'Wet burger',
    names: ['islak'],
    words: ['islak'],
  },
  ocakbasi: {
    id: 'ocakbasi',
    tr: 'Ocakbaşı',
    en: 'Ocakbaşı',
    names: ['ocakbasi'],
    words: ['ocakbasi'],
  },
  waffle: {
    id: 'waffle',
    tr: 'Waffle / Krep',
    en: 'Waffle / Crêpe',
    names: ['waffle', 'krep', 'crepe'],
    cuisines: ['waffle', 'crepe'],
    words: ['waffle', 'krep', 'crepe'],
  },
  wings: {
    id: 'wings',
    tr: 'Kanat',
    en: 'Wings',
    names: ['kanat', 'wings'],
    cuisines: ['wings'],
    words: ['kanat', 'wings'],
  },
};

/** The members of an entry, by catalog id. */
const kinds = (...ids: (KindId | TableKindId)[]): Member[] => ids.map((id) => KINDS[id]);

export const CHOICES: ChoiceEntry[] = [
  {
    id: 'protein',
    goal: true,
    wishes: ['protein'],
    reorder: true,
    note: true,
    reason: { tr: 'yüksek protein', en: 'high protein' },
    members: kinds('meatgrill', 'fish', 'chicken', 'steak', 'fitbowl'),
  },
  {
    id: 'healthy',
    goal: true,
    wishes: ['healthy'],
    reorder: true,
    note: true,
    reason: { tr: 'hafif', en: 'light' },
    members: kinds('salad', 'bowl', 'vegan', 'fish', 'grill', 'soup', 'zeytinyagli'),
  },
  {
    id: 'quick',
    wishes: ['quick', 'cheap'],
    note: true,
    reason: { tr: 'genelde hızlı', en: 'usually quick' },
    members: kinds('doner', 'pide', 'burger', 'tost', 'soup', 'lokanta'),
  },
  {
    // "doyurucu", "kilo almak": filling food. No wish of the older entries fits, so it has its own.
    id: 'hearty',
    goal: true,
    wishes: ['hearty'],
    reorder: true,
    note: true,
    reason: { tr: 'doyurucu', en: 'filling' },
    members: kinds('kebab', 'doner', 'pide', 'lokanta', 'burger', 'manti'),
  },
  {
    id: 'sweet',
    cat: 'dessert',
    askWhenVague: true,
    reason: { tr: 'tatlı', en: 'sweet' },
    members: kinds('baklava', 'kunefe', 'icecream', 'pastry', 'pudding'),
  },
  {
    id: 'meat',
    cat: 'meat',
    reason: { tr: 'et', en: 'meat' },
    members: kinds('kebab', 'kofte', 'steak', 'chicken', 'liver'),
  },
  {
    id: 'world',
    cat: 'world',
    reason: { tr: 'dünya mutfağı', en: 'world cuisine' },
    members: kinds('italian', 'asian', 'mexican', 'med'),
  },
  {
    id: 'breakfast',
    cat: 'breakfast',
    reason: { tr: 'kahvaltı', en: 'breakfast' },
    members: kinds('serpme', 'borek', 'simit', 'omelet'),
  },
];

/** What a typed answer to the question means: everything, or one member ("hepsi", "balık"). */
export const ALL_WORDS = ['hepsi', 'hepsini', 'tumu', 'tumunu', 'farketmez', 'herhangi', 'her sey'];

/** Words that may stand around an "all" word ("hepsini göster", "hepsi olur", "herhangi biri"). */
const ALL_FILLER = ['goster', 'olur', 'biri', 'bir', 'tamam', 'ya', 'peki', 'lutfen', 'hocam'];

/** "hepsi", "tümü", "farketmez", "herhangi biri": the whole text says "all of them" (folded). */
export function isAllAnswer(folded: string): boolean {
  const tokens = folded.split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;
  const padded = ` ${folded} `;
  if (!(ALL_WORDS.some((w) => padded.includes(` ${w} `)) || padded.includes(' fark etmez '))) {
    return false;
  }
  const said = new Set(ALL_WORDS.flatMap((w) => w.split(' ')).concat('fark', 'etmez', ALL_FILLER));
  return tokens.every((t) => said.has(t));
}

/** True when `r` is a kind of place `m` describes. Places that are no meal place never are. */
export function inMember(r: Restaurant, m: Member): boolean {
  if (categoryOf(r) === null) return false;
  if (m.cat && matchesCategory(r, m.cat)) return true;
  if (m.cuisines?.some((c) => r.cuisines.includes(c))) return true;
  if (m.diets?.some((d) => r.diets.includes(d))) return true;
  if (m.kinds?.includes(r.kind)) return true;
  if (!m.names) return false;
  const name = fold(r.name);
  if (m.notNames?.some((k) => name.includes(k))) return false;
  return m.names.some((k) => hasWordForm(name, k));
}

/**
 * The member a place counts as in a mixed list: a place found by name or tag is that member before
 * it is one found only by the broad category ("Fish & Steak House" is steak, not fish), so a mixed
 * list keeps its variety.
 */
export function memberOf(r: Restaurant, members: readonly Member[]): Member | null {
  const specific = members.find((m) => !m.cat && inMember(r, m));
  if (specific) return specific;
  const own = categoryOf(r);
  const byCat = members.filter((m) => m.cat && inMember(r, m));
  return byCat.find((m) => m.cat === own) ?? byCat[0] ?? null;
}

export function choiceById(id: string): ChoiceEntry | undefined {
  return CHOICES.find((e) => e.id === id);
}

/** The id of the entry built from the kinds the router picked (it is no row of CHOICES). */
export const AI_CHOICE_ID = 'ai';

/** The catalog kinds among `ids`, once each, in the router's order. */
export function kindsOf(ids: readonly string[] | undefined): Member[] {
  const known = (ids ?? []).filter((id): id is KindId => KIND_IDS.some((k) => k === id));
  return [...new Set(known)].map((id) => KINDS[id]);
}

/**
 * The entry of the kinds the router picked for a goal or situation the table does not know: the
 * same shape as a table entry, so asking, picking and the honest note work alike. It makes no
 * claim about a wish of its own (no reason after the label); the note names the picked kinds.
 */
export function aiEntry(members: Member[]): ChoiceEntry {
  return {
    id: AI_CHOICE_ID,
    // The note says "no menu data", so it also covers the diet wishes the router may have added.
    wishes: ['healthy', 'protein'],
    note: true,
    reason: { tr: '', en: '' },
    members,
  };
}

/** A table entry by id, or the router's entry for 'ai' (its kinds are kept in the chat context). */
export function entryById(id: string, aiKinds?: readonly string[]): ChoiceEntry | undefined {
  return id === AI_CHOICE_ID ? aiEntry(kindsOf(aiKinds)) : choiceById(id);
}

/** The entry a goal / mood wish asks about, or undefined when the wishes have no entry. */
export function askEntryFor(wishes: readonly Wish[]): ChoiceEntry | undefined {
  return CHOICES.find((e) => e.wishes?.some((w) => wishes.includes(w)));
}

/** The entry that narrows or asks about a broad category. */
export function entryForCat(cat: FoodCategory): ChoiceEntry | undefined {
  return CHOICES.find((e) => e.cat === cat);
}

/** "tatlı bir şey", "canım tatlı çekti": a mood, not a request for the category itself. */
export function isVague(folded: string): boolean {
  return /\bbir sey(ler)?\b|\bcek(ti|iyor|mis)\b|\bcanim\b|\bbisey\b/.test(folded);
}

/** The member a typed answer names (the first member whose word is in it), or null. */
export function memberForAnswer(entry: ChoiceEntry, folded: string): Member | 'all' | null {
  const tokens = folded.split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return null;
  const padded = ` ${folded} `;
  if (ALL_WORDS.some((w) => padded.includes(` ${w} `))) return 'all';
  return (
    entry.members.find((m) =>
      m.words.some((w) =>
        w.includes(' ')
          ? padded.includes(` ${w} `)
          : tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w))),
      ),
    ) ?? null
  );
}

/** Chip / sentence label of a member in the app language. */
export function memberLabel(m: Member, lang: string): string {
  return lang.startsWith('en') ? m.en : m.tr;
}

export function entryReason(e: ChoiceEntry, lang: string): string {
  return lang.startsWith('en') ? e.reason.en : e.reason.tr;
}
