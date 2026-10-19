import type { Wish } from '../lib/ai/protocol';
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

export const CHOICES: ChoiceEntry[] = [
  {
    id: 'protein',
    goal: true,
    wishes: ['protein'],
    reorder: true,
    note: true,
    reason: { tr: 'yüksek protein', en: 'high protein' },
    members: [
      {
        id: 'grill',
        tr: 'Izgara',
        en: 'Grill',
        cat: 'meat',
        words: ['izgara', 'kebap', 'kofte', 'et', 'mangal'],
      },
      { id: 'fish', tr: 'Balık', en: 'Fish', cat: 'fish', words: ['balik'] },
      {
        id: 'chicken',
        tr: 'Tavuk',
        en: 'Chicken',
        names: ['tavuk', 'chicken', 'pilic'],
        cuisines: ['chicken'],
        words: ['tavuk', 'pilic'],
      },
      {
        id: 'steak',
        tr: 'Steak',
        en: 'Steak',
        names: ['steak', 'biftek', 'antrikot', 'bonfile'],
        cuisines: ['steak_house'],
        words: ['steak', 'biftek'],
      },
      {
        id: 'bowl',
        tr: 'Bowl',
        en: 'Bowl',
        names: ['bowl', 'protein', 'proteinli', 'fit', 'fitness'],
        notNames: ['kilo', 'kulup', 'merkezi', 'spor'],
        words: ['bowl', 'fit'],
      },
    ],
  },
  {
    id: 'healthy',
    goal: true,
    wishes: ['healthy'],
    reorder: true,
    note: true,
    reason: { tr: 'hafif', en: 'light' },
    members: [
      {
        id: 'salad',
        tr: 'Salata',
        en: 'Salad',
        names: ['salata', 'salad'],
        cuisines: ['salad'],
        words: ['salata', 'salad'],
      },
      {
        id: 'bowl',
        tr: 'Bowl',
        en: 'Bowl',
        names: ['bowl', 'poke', 'fit', 'healthy', 'saglikli', 'diyet'],
        notNames: ['kilo', 'kulup', 'merkezi', 'spor'],
        cuisines: ['poke', 'healthy', 'juice'],
        words: ['bowl', 'poke', 'fit'],
      },
      {
        id: 'vegan',
        tr: 'Vegan',
        en: 'Vegan',
        names: ['vegan', 'vejetaryen', 'vejeteryan', 'vegetarian'],
        cuisines: ['vegan', 'vegetarian'],
        diets: ['vegan', 'vegetarian'],
        words: ['vegan', 'vejetaryen', 'vejeteryan'],
      },
      { id: 'fish', tr: 'Balık', en: 'Fish', cat: 'fish', words: ['balik'] },
      {
        id: 'grill',
        tr: 'Izgara',
        en: 'Grill',
        names: GRILL_NAMES,
        cuisines: ['grill', 'barbecue'],
        words: ['izgara'],
      },
      { id: 'soup', tr: 'Çorba', en: 'Soup', cat: 'soup', words: ['corba'] },
      {
        id: 'lokanta',
        tr: 'Zeytinyağlı',
        en: 'Home-style',
        cat: 'lokanta',
        names: ['zeytinyagli'],
        words: ['zeytinyagli', 'lokanta'],
      },
    ],
  },
  {
    id: 'quick',
    wishes: ['quick', 'cheap'],
    note: true,
    reason: { tr: 'genelde hızlı', en: 'usually quick' },
    members: [
      {
        id: 'doner',
        tr: 'Döner',
        en: 'Doner',
        names: ['doner', 'durum', 'tantuni'],
        cuisines: ['doner', 'döner'],
        words: ['doner', 'durum'],
      },
      {
        id: 'pide',
        tr: 'Pide / Lahmacun',
        en: 'Pide / Lahmacun',
        names: ['pide', 'pideci', 'lahmacun', 'lahmacuncu'],
        cuisines: ['pide', 'lahmacun'],
        words: ['pide', 'lahmacun'],
      },
      {
        id: 'burger',
        tr: 'Burger',
        en: 'Burger',
        names: ['burger', 'hamburger'],
        cuisines: ['burger'],
        words: ['burger', 'hamburger'],
      },
      {
        id: 'tost',
        tr: 'Tost / Sandviç',
        en: 'Toast / Sandwich',
        names: ['tost', 'sandvic', 'sandwich', 'kumru'],
        cuisines: ['sandwich', 'tost', 'kumru'],
        words: ['tost', 'sandvic', 'sandwich'],
      },
      { id: 'soup', tr: 'Çorba', en: 'Soup', cat: 'soup', words: ['corba'] },
      {
        id: 'lokanta',
        tr: 'Esnaf lokantası',
        en: 'Local eatery',
        cat: 'lokanta',
        words: ['lokanta', 'esnaf'],
      },
    ],
  },
  {
    id: 'sweet',
    cat: 'dessert',
    askWhenVague: true,
    reason: { tr: 'tatlı', en: 'sweet' },
    members: [
      {
        id: 'baklava',
        tr: 'Baklava',
        en: 'Baklava',
        names: ['baklava', 'baklavaci'],
        words: ['baklava'],
      },
      {
        id: 'kunefe',
        tr: 'Künefe',
        en: 'Künefe',
        names: ['kunefe', 'kunefeci'],
        words: ['kunefe'],
      },
      {
        id: 'icecream',
        tr: 'Dondurma',
        en: 'Ice cream',
        names: ['dondurma', 'dondurmaci', 'gelato'],
        cuisines: ['ice_cream'],
        kinds: ['ice_cream'],
        words: ['dondurma', 'gelato'],
      },
      {
        id: 'pastry',
        tr: 'Pasta / Pastane',
        en: 'Cake / Pastry',
        names: ['pastane', 'pastanesi', 'patisserie', 'pasta evi', 'pasta salonu', 'cake'],
        cuisines: ['cake', 'pastry'],
        kinds: ['pastry'],
        words: ['pasta', 'pastane', 'cake'],
      },
      {
        id: 'pudding',
        tr: 'Sütlaç / Muhallebi',
        en: 'Pudding',
        names: ['sutlac', 'muhallebi', 'muhallebici', 'kazandibi', 'tatlici', 'tatli'],
        cuisines: ['dessert'],
        words: ['sutlac', 'muhallebi'],
      },
    ],
  },
  {
    id: 'meat',
    cat: 'meat',
    reason: { tr: 'et', en: 'meat' },
    members: [
      {
        id: 'kebab',
        tr: 'Kebap',
        en: 'Kebab',
        names: ['kebap', 'kebab', 'kebapci', 'sis', 'adana', 'urfa', 'ocakbasi'],
        cuisines: ['kebab'],
        words: ['kebap', 'kebab'],
      },
      {
        id: 'kofte',
        tr: 'Köfte',
        en: 'Meatballs',
        names: ['kofte', 'kofteci'],
        cuisines: ['meatball', 'köfte', 'kofte'],
        words: ['kofte'],
      },
      {
        id: 'steak',
        tr: 'Steak',
        en: 'Steak',
        names: ['steak', 'biftek', 'antrikot', 'bonfile'],
        cuisines: ['steak_house'],
        words: ['steak', 'biftek'],
      },
      {
        id: 'chicken',
        tr: 'Tavuk',
        en: 'Chicken',
        names: ['tavuk', 'chicken', 'pilic'],
        cuisines: ['chicken'],
        words: ['tavuk', 'pilic'],
      },
      { id: 'liver', tr: 'Ciğer', en: 'Liver', names: ['ciger', 'cigerci'], words: ['ciger'] },
    ],
  },
  {
    id: 'world',
    cat: 'world',
    reason: { tr: 'dünya mutfağı', en: 'world cuisine' },
    members: [
      {
        id: 'italian',
        tr: 'Pizza / İtalyan',
        en: 'Pizza / Italian',
        names: ['pizza', 'pizzeria', 'italyan', 'pasta evi'],
        cuisines: ['pizza', 'italian', 'pasta'],
        words: ['pizza', 'italyan'],
      },
      {
        id: 'asian',
        tr: 'Sushi / Asya',
        en: 'Sushi / Asian',
        names: ['sushi', 'noodle', 'ramen', 'wok'],
        cuisines: [
          'sushi',
          'asian',
          'japanese',
          'chinese',
          'korean',
          'noodles',
          'thai',
          'vietnamese',
        ],
        words: ['sushi', 'asya', 'cin', 'cin mutfagi'],
      },
      {
        id: 'mexican',
        tr: 'Meksika',
        en: 'Mexican',
        names: ['taco', 'burrito', 'meksika'],
        cuisines: ['mexican'],
        words: ['meksika', 'taco'],
      },
      {
        id: 'med',
        tr: 'Akdeniz',
        en: 'Mediterranean',
        cuisines: ['mediterranean', 'greek', 'french', 'international'],
        words: ['akdeniz', 'yunan'],
      },
    ],
  },
  {
    id: 'breakfast',
    cat: 'breakfast',
    reason: { tr: 'kahvaltı', en: 'breakfast' },
    members: [
      {
        id: 'serpme',
        tr: 'Serpme kahvaltı',
        en: 'Full breakfast',
        names: ['serpme', 'kahvalti', 'kahvaltici'],
        cuisines: ['breakfast'],
        words: ['serpme'],
      },
      {
        id: 'borek',
        tr: 'Börek / Poğaça',
        en: 'Börek / Pastries',
        names: ['borek', 'borekci', 'pogaca', 'acma'],
        words: ['borek', 'pogaca'],
      },
      {
        id: 'simit',
        tr: 'Simit / Gevrek',
        en: 'Simit / Bagel',
        names: ['simit', 'gevrek', 'boyoz'],
        cuisines: ['bagel'],
        words: ['simit', 'gevrek'],
      },
      {
        id: 'omelet',
        tr: 'Menemen / Omlet',
        en: 'Eggs',
        names: ['menemen', 'omlet', 'yumurta'],
        words: ['menemen', 'omlet'],
      },
    ],
  },
];

/** What a typed answer to the question means: everything, or one member ("hepsi", "balık"). */
export const ALL_WORDS = ['hepsi', 'hepsini', 'tumu', 'tumunu', 'farketmez', 'herhangi', 'her sey'];

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
