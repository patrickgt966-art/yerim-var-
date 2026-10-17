// The big live AI eval (scripts/ai-eval-big.ts): ~590 cases generated from templates with a
// seeded PRNG, so every run asks the same questions. Messages are written the way people type:
// lowercase, suffixed districts, no Turkish letters, slang and filler. Each case checks only what
// a right answer must have (same scoring as aiCases.ts), so a different sensible reading passes.
import type { FoodCategory } from '../restaurants';
import { VEG, place, type PickCase, type UnderstandCase } from './aiCases';
import type { AiCityId, ChatTurn, PickCandidate } from '@/lib/ai/protocol';

export type BigUnderstandCase = UnderstandCase & { group: string };
export type BigPickCase = PickCase & { group: string; city?: AiCityId };

export const BIG_SEED = 20261017;

export const BIG_GROUPS = [
  'dish_district',
  'near_me',
  'negation',
  'parking',
  'vague_diet_goal_mood',
  'english',
  'multi_turn',
  'chat_gibberish',
  'pick',
] as const;

/** Small, fast, seeded PRNG: same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = {
  int: (n: number) => number;
  pick: <T>(a: readonly T[]) => T;
  chance: (p: number) => boolean;
  shuffle: <T>(a: readonly T[]) => T[];
};

function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (n: number) => Math.floor(next() * n);
  return {
    int,
    pick: <T>(a: readonly T[]) => a[int(a.length)] as T,
    chance: (p: number) => next() < p,
    shuffle: <T>(a: readonly T[]) => {
      const out = [...a];
      for (let k = out.length - 1; k > 0; k--) {
        const j = int(k + 1);
        [out[k], out[j]] = [out[j] as T, out[k] as T];
      }
      return out;
    },
  };
}

const VOWELS = 'aıoueiöü';
const BACK_VOWELS = 'aıou';
const VOICELESS = 'çfhkpsşt';

/**
 * The locative ("in X") with vowel and consonant harmony: bornova -> bornovada, kadıköy ->
 * kadıköyde, etimesgut -> etimesgutta. Lowercase, or "Kadıköy'de" with the apostrophe.
 */
export function locative(name: string, apostrophe = false): string {
  const low = name.toLocaleLowerCase('tr');
  let vowel = 'e';
  for (let k = low.length - 1; k >= 0; k--) {
    const ch = low.charAt(k);
    if (VOWELS.includes(ch)) {
      vowel = ch;
      break;
    }
  }
  const last = low.charAt(low.length - 1);
  const suffix = (VOICELESS.includes(last) ? 't' : 'd') + (BACK_VOWELS.includes(vowel) ? 'a' : 'e');
  return apostrophe ? `${name}'${suffix}` : `${low}${suffix}`;
}

/** Turkish letters to ASCII, as on a phone without a Turkish keyboard. */
export function asciiFold(s: string): string {
  const map: Record<string, string> = {
    ı: 'i',
    İ: 'I',
    ş: 's',
    Ş: 'S',
    ğ: 'g',
    Ğ: 'G',
    ü: 'u',
    Ü: 'U',
    ö: 'o',
    Ö: 'O',
    ç: 'c',
    Ç: 'C',
  };
  return s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => map[ch] ?? ch);
}

/** Well-known districts per city, spelled as data/cities.ts spells them. */
const CITY_DISTRICTS: Record<string, readonly string[]> = {
  izmir: ['Bornova', 'Karşıyaka', 'Konak', 'Buca', 'Bayraklı', 'Çiğli', 'Urla', 'Çeşme'],
  istanbul: ['Kadıköy', 'Beşiktaş', 'Şişli', 'Üsküdar', 'Fatih', 'Beyoğlu', 'Bakırköy', 'Ataşehir'],
  ankara: ['Çankaya', 'Keçiören', 'Yenimahalle', 'Etimesgut', 'Mamak', 'Sincan', 'Gölbaşı'],
  bursa: ['Nilüfer', 'Osmangazi', 'Yıldırım', 'Mudanya', 'Gemlik', 'İnegöl', 'Kestel'],
  antalya: ['Muratpaşa', 'Konyaaltı', 'Kepez', 'Alanya', 'Manavgat', 'Kemer', 'Kaş'],
};
const CITY_IDS: readonly AiCityId[] = ['izmir', 'istanbul', 'ankara', 'bursa', 'antalya'];

type Dish = { x: string; cats: FoodCategory[]; has: string[] };

const DISHES: readonly Dish[] = [
  { x: 'lahmacun', cats: ['fast'], has: ['lahmacun'] },
  { x: 'pide', cats: ['fast'], has: ['pide'] },
  { x: 'döner', cats: ['fast', 'meat'], has: ['doner'] },
  { x: 'köfte', cats: ['meat', 'fast', 'lokanta'], has: ['kofte'] },
  { x: 'kebap', cats: ['meat'], has: ['kebap', 'kebab'] },
  { x: 'iskender', cats: ['meat', 'lokanta'], has: ['iskender'] },
  { x: 'balık', cats: ['fish', 'meyhane'], has: ['balik'] },
  { x: 'midye', cats: ['fish', 'fast'], has: ['midye'] },
  { x: 'mercimek çorbası', cats: ['soup', 'lokanta'], has: ['corba', 'mercimek'] },
  { x: 'işkembe', cats: ['soup'], has: ['iskembe'] },
  { x: 'serpme kahvaltı', cats: ['breakfast'], has: ['kahvalti'] },
  { x: 'menemen', cats: ['breakfast', 'lokanta'], has: ['menemen'] },
  { x: 'mantı', cats: ['lokanta', 'world'], has: ['manti'] },
  { x: 'tavuk pilav', cats: ['lokanta', 'fast'], has: ['pilav', 'tavuk'] },
  { x: 'kuru fasulye', cats: ['lokanta'], has: ['fasulye'] },
  { x: 'baklava', cats: ['dessert'], has: ['baklava'] },
  { x: 'künefe', cats: ['dessert'], has: ['kunefe'] },
  { x: 'sushi', cats: ['world'], has: ['sushi', 'susi'] },
  { x: 'pizza', cats: ['fast', 'world'], has: ['pizza'] },
  { x: 'hamburger', cats: ['fast'], has: ['burger'] },
  { x: 'kumpir', cats: ['fast'], has: ['kumpir'] },
  { x: 'tost', cats: ['fast', 'cafe', 'breakfast'], has: ['tost'] },
  { x: 'kokoreç', cats: ['fast'], has: ['kokorec'] },
  { x: 'çiğ köfte', cats: ['fast'], has: ['kofte'] },
  { x: 'etli ekmek', cats: ['fast', 'meat'], has: ['etli'] },
  { x: 'cağ kebabı', cats: ['meat'], has: ['cag', 'kebap', 'kebab'] },
  { x: 'filtre kahve', cats: ['cafe'], has: ['kahve'] },
  { x: 'börek', cats: ['breakfast', 'fast', 'cafe', 'lokanta'], has: ['borek'] },
];
const dishByX = (x: string) => DISHES.find((d) => d.x === x) as Dish;
/** The app works from the dish, so no category is fine too. */
const catsOf = (d: Dish): (FoodCategory | null)[] => [...d.cats, null];

/** English names; the model writes the dish in Turkish (or keeps the word). */
const EN_DISHES: readonly { en: string; d: Dish; has?: string[] }[] = [
  { en: 'kebab', d: dishByX('kebap') },
  { en: 'pizza', d: dishByX('pizza') },
  { en: 'sushi', d: dishByX('sushi') },
  { en: 'burgers', d: dishByX('hamburger') },
  { en: 'lahmacun', d: dishByX('lahmacun') },
  { en: 'baklava', d: dishByX('baklava') },
  { en: 'doner', d: dishByX('döner') },
  { en: 'meatballs', d: dishByX('köfte') },
  { en: 'fish', d: dishByX('balık') },
  { en: 'lentil soup', d: dishByX('mercimek çorbası') },
];

const PREFIXES = [
  'hocam',
  'kanka',
  'abi',
  'bro',
  'aga',
  'reis',
  'valla',
  'ya',
  'abicim',
  'kardeşim',
];
const SUFFIXES = ['ya', 'valla', '😋', '🙏', '🔥', 'bro', 'kanka', '?', '??', 'acil', 'yaa'];
/** Spoken and lazy spellings, each applied sometimes. */
const SLANG: readonly [RegExp, string][] = [
  [/\bnerede\b/g, 'nerde'],
  [/bir şey/g, 'bişey'],
  [/\bbir\b/g, 'bi'],
  [/var mı/g, 'varmı'],
  [/istiyorum/g, 'istiyom'],
  [/yiyelim/g, 'yiyek'],
  [/lazım/g, 'lazim'],
  [/gideyim/g, 'gidiyim'],
  [/yiyebileceğim/g, 'yiyebilcem'],
  [/acaba/g, 'acep'],
];

/** Makes a clean template message look typed: slang, filler, no Turkish letters, sometimes. */
function mess(r: Rng, text: string, opts: { wrap?: boolean } = {}): string {
  let s = text;
  for (const [re, to] of SLANG) if (r.chance(0.4)) s = s.replace(re, to);
  if (opts.wrap !== false) {
    if (r.chance(0.35)) s = `${r.pick(PREFIXES)} ${s}`;
    if (r.chance(0.35)) s = `${s} ${r.pick(SUFFIXES)}`;
  }
  if (r.chance(0.25)) s = asciiFold(s);
  if (r.chance(0.1)) s = s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
  return s.replace(/\s+/g, ' ').trim();
}

/** The district as a place in a sentence: "bornovada", "Bornova'da", "bornova tarafında". */
function where(r: Rng, d: string): string {
  const x = r.int(20);
  if (x < 12) return locative(d);
  if (x < 15) return locative(d, true);
  if (x < 17) return `${d.toLocaleLowerCase('tr')} tarafında`;
  if (x < 19) return `${d.toLocaleLowerCase('tr')} civarında`;
  return d.toLocaleLowerCase('tr');
}

/** Fills {L} (district as a place), {D} (bare district), {X} (dish), {N} (other word). */
function fill(r: Rng, t: string, v: { d?: string; x?: string; n?: string }): string {
  let s = t;
  if (v.d !== undefined) {
    const d = v.d;
    s = s.replace('{L}', () => where(r, d)).replace('{D}', d.toLocaleLowerCase('tr'));
  }
  if (v.x !== undefined) s = s.replace('{X}', v.x);
  if (v.n !== undefined) s = s.replace('{N}', v.n);
  return s;
}

const districtsOf = (city: AiCityId) => CITY_DISTRICTS[city] ?? [];

/** Every generated case, from one seed. Same seed, same cases (names included). */
export function buildBigCases(seed: number = BIG_SEED): {
  understand: BigUnderstandCase[];
  pick: BigPickCase[];
} {
  const r = makeRng(seed);
  const understand: BigUnderstandCase[] = [];
  const names = new Set<string>();
  const texts = new Set<string>();

  const uniqueName = (base: string) => {
    let name = base;
    for (let k = 2; names.has(name); k++) name = `${base} #${k}`;
    names.add(name);
    return name;
  };
  /** Builds the text until it is new (with the same history), then adds the case. */
  const add = (
    group: string,
    city: AiCityId,
    make: () => string,
    expect: UnderstandCase['expect'],
    history?: ChatTurn[],
  ) => {
    let text = make();
    const key = (t: string) => `${city}|${history?.map((h) => h.text).join('|') ?? ''}|${t}`;
    for (let k = 0; k < 20 && texts.has(key(text)); k++) text = make();
    texts.add(key(text));
    const short = text.length > 48 ? `${text.slice(0, 45)}...` : text;
    understand.push({
      group,
      name: uniqueName(`${group}: [${city}] ${short}`),
      city,
      ...(history ? { history } : {}),
      text,
      expect,
    });
  };

  // dish_district: a dish in a district, every city, ~40 each.
  const DISH_TEMPLATES = [
    '{L} {X} nerede yenir',
    '{L} iyi bir {X} yeri var mı',
    '{L} {X} yiyecek yer lazım',
    '{X} {D}',
    '{D} {X}',
    'canım {X} çekti {L} nereye gideyim',
    'bu akşam {L} {X} yiyelim diyoruz nereye gitsek',
    '{L} {X} önerin var mı',
    '{X} yemek istiyorum {D} civarı',
    'arkadaşlarla {L} buluşacağız {X} yiyelim dedik bir yer söyle',
    'iş çıkışı {L} kaldım acıktım da {X} yiyebileceğim düzgün bir yer var mı',
    '{L} en güzel {X} hangi mekanda',
    '{X} için {D} nasıl, bir yer önerir misin',
    'öğlen arası {L} {X} yemek istiyorum',
    '{L} {X} var mı acaba',
    'sabahtan beri aç geziyorum {L} {X} yiyeyim bari',
  ];
  for (const [ci, city] of CITY_IDS.entries()) {
    // İzmir has a district called Menemen: the dish would be an unfair riddle there.
    const dishes = r.shuffle(DISHES.filter((d) => !(city === 'izmir' && d.x === 'menemen')));
    for (let k = 0; k < 40; k++) {
      const dish = dishes[k % dishes.length] as Dish;
      const d = r.pick(districtsOf(city));
      const t = DISH_TEMPLATES[(k + ci * 3) % DISH_TEMPLATES.length] as string;
      add('dish_district', city, () => mess(r, fill(r, t, { d, x: dish.x })), {
        kind: ['search'],
        district: d,
        food: true,
        noPlace: true,
        catIn: catsOf(dish),
        dishHas: dish.has,
      });
    }
  }

  // near_me: around the user, no district.
  const NEAR_TR = [
    'yakınımda {X} var mı',
    'buralarda {X} yiyebileceğim bir yer var mı',
    'en yakın {X} nerede',
    'etrafta {X} yapan bir yer',
    'bana en yakın {X} yeri',
    '{X} yakınımda',
    'şu an bulunduğum yere en yakın {X}',
  ];
  const NEAR_EN = [
    '{X} near me',
    'any good {X} near me?',
    'where is the closest {X} place',
    'hungry, {X} around here?',
  ];
  for (let k = 0; k < 40; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const en = k % 4 === 3;
    const e = en ? r.pick(EN_DISHES) : { en: '', d: r.pick(DISHES) };
    const t = en ? r.pick(NEAR_EN) : r.pick(NEAR_TR);
    const x = en ? e.en : e.d.x;
    add('near_me', city, () => (en ? fill(r, t, { x }) : mess(r, fill(r, t, { x }))), {
      kind: ['search'],
      nearMe: true,
      district: null,
      food: true,
      dishHas: e.d.has,
    });
  }

  // negation: a ruled-out category keeps the district.
  const NEGS: readonly { n: string; cat: FoodCategory; eat: boolean }[] = [
    { n: 'tatlı', cat: 'dessert', eat: true },
    { n: 'balık', cat: 'fish', eat: true },
    { n: 'kebap', cat: 'meat', eat: true },
    { n: 'hamburger', cat: 'fast', eat: true },
    { n: 'fast food', cat: 'fast', eat: true },
    { n: 'kafe', cat: 'cafe', eat: false },
    { n: 'çorba', cat: 'soup', eat: true },
  ];
  const NEG_TEMPLATES: readonly { t: string; eat?: boolean }[] = [
    { t: '{L} bir şeyler yiyelim ama {N} olmasın' },
    { t: '{L} acıktık, {N} istemiyorum başka bir şey' },
    { t: '{N} hariç {L} ne yenir' },
    { t: '{L} yemek yiyeceğiz, {N} yemem ama', eat: true },
    { t: '{L} akşam yemeği için yer lazım, {N} olmasın lütfen' },
    { t: '{N} dışında bir yemek olsun {L}' },
  ];
  for (let k = 0; k < 50; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const neg = NEGS[k % NEGS.length] as (typeof NEGS)[number];
    const d = r.pick(districtsOf(city));
    const ts = NEG_TEMPLATES.filter((t) => !t.eat || neg.eat);
    add('negation', city, () => mess(r, fill(r, r.pick(ts).t, { d, n: neg.n })), {
      kind: ['search'],
      district: d,
      food: true,
      notCat: neg.cat,
      catNot: [neg.cat],
    });
  }

  // parking: only a car park, or a food place that must have one.
  const PARK_ONLY = [
    '{L} otopark',
    '{L} park yeri var mı',
    'arabayı {L} nereye bırakırım',
    '{L} ücretsiz otopark',
    '{L} kapalı otopark lazım',
    '{D} otopark nerede',
    '{L} park edecek yer bulamıyorum yardım',
    '{L} iki saatliğine park edebileceğim bir yer',
  ];
  const PARK_FOOD = [
    '{L} {X} yiyelim otoparkı olsun',
    '{L} park yeri olan bir {X} yeri',
    '{L} otoparkı olan {X} restoranı',
    'arabayla geliyoruz {L} {X} yiyecek yer, otoparkı olsun ama',
    '{L} {X} yiyeceğiz ama park sorunu olmasın, otoparkı olan bir yer',
    '{L} otoparkı ücretsiz olan bir {X} yeri',
  ];
  const PARK_DISHES = [
    'lahmacun',
    'pide',
    'döner',
    'köfte',
    'kebap',
    'iskender',
    'balık',
    'mantı',
    'pizza',
    'hamburger',
    'serpme kahvaltı',
    'künefe',
    'sushi',
    'tavuk pilav',
  ];
  for (let k = 0; k < 60; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const d = r.pick(districtsOf(city));
    if (k % 2 === 0) {
      add('parking', city, () => mess(r, fill(r, r.pick(PARK_ONLY), { d })), {
        kind: ['search'],
        district: d,
        food: false,
        requireParking: false,
      });
    } else {
      const x = r.pick(PARK_DISHES);
      add('parking', city, () => mess(r, fill(r, r.pick(PARK_FOOD), { d, x })), {
        kind: ['search'],
        district: d,
        food: true,
        requireParking: true,
      });
    }
  }

  // vague_diet_goal_mood: no dish, a diet, goal, mood or company; with or without a district.
  const VAGUE: readonly { key: string; v: string[]; extra: UnderstandCase['expect'] }[] = [
    {
      key: 'vegetarian',
      v: [
        'ben vejetaryenim ne yiyebilirim',
        'vejetaryen bir şeyler arıyorum',
        'et yemiyorum vejetaryen bir yer söyle',
        'vejeteryen menüsü olan bir yer',
      ],
      extra: { catNot: ['meat', 'fish'] },
    },
    {
      key: 'vegan',
      v: [
        'veganım bana uygun bir yer lazım',
        'vegan yemek nerede bulurum',
        'hayvansal ürün yemiyorum vegan bir yer',
      ],
      extra: { catNot: ['meat', 'fish'] },
    },
    {
      key: 'gluten',
      v: [
        'çölyak hastasıyım glutensiz yemek',
        'glutensiz bir şeyler yiyebileceğim yer',
        'gluten yiyemiyorum ne önerirsin',
      ],
      extra: {},
    },
    {
      key: 'protein',
      v: [
        'kas yapıyorum protein lazım',
        'spordan çıktım proteinli bir şeyler yemem lazım',
        'bulk dönemindeyim bol proteinli yemek',
      ],
      extra: { catNot: ['dessert', 'cafe'] },
    },
    {
      key: 'light',
      v: [
        'hafif bir şey yemek istiyorum',
        'ağır olmayan hafif bir şeyler',
        'midem kaldırmıyor hafif bir yemek',
      ],
      extra: {},
    },
    {
      key: 'diet',
      v: [
        'diyetteyim ne yiyebilirim',
        'kalori saydığım için sağlıklı bir şey',
        'diyetimi bozmayacak bir yer',
      ],
      extra: { catNot: ['dessert'] },
    },
    {
      key: 'cold',
      v: [
        'üşüdüm sıcak bir şey içmek istiyorum',
        'hava çok soğuk içimi ısıtacak bir şey',
        'donuyorum sıcak bir şeyler lazım',
      ],
      extra: {},
    },
    {
      key: 'hungry',
      v: ['acıktım', 'çok acıktım ne yesem', 'karnım zil çalıyor bir şeyler yiyelim'],
      extra: {},
    },
    {
      key: 'kids',
      v: [
        'çocuklarla gidilecek bir yer',
        'iki çocukla yemek yiyebileceğimiz bir yer',
        'çocuk dostu bir mekan arıyorum',
      ],
      extra: { catNot: ['meyhane'] },
    },
    {
      key: 'romantic',
      v: [
        'sevgiliyle romantik bir akşam yemeği',
        'yıldönümümüz var güzel bir akşam yemeği yeri',
        'kız arkadaşımı yemeğe götüreceğim şık bir yer',
      ],
      extra: {},
    },
    {
      key: 'crowd',
      v: [
        'kalabalık bir grubuz ucuz bir yer lazım',
        'on beş kişiyiz uygun fiyatlı bir yer',
        'arkadaşlarla kalabalık gideceğiz hesaplı bir mekan',
      ],
      extra: {},
    },
    {
      key: 'student',
      v: [
        'öğrenci bütçesine uygun yemek',
        'öğrenciyim ucuz doyurucu bir şey',
        'cebimde az para var karnımı doyuracak bir yer',
      ],
      extra: {},
    },
  ];
  for (let k = 0; k < 60; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const p = VAGUE[k % VAGUE.length] as (typeof VAGUE)[number];
    const withD = r.chance(0.6);
    const d = r.pick(districtsOf(city));
    const make = () => {
      const v = r.pick(p.v);
      if (!withD) return mess(r, v);
      const forms = [`{L} ${v}`, `${v} {D} civarı`, `${v}, {L} olsun`];
      return mess(r, fill(r, r.pick(forms), { d }));
    };
    add('vague_diet_goal_mood', city, make, {
      kind: ['search'],
      food: true,
      district: withD ? d : null,
      ...p.extra,
    });
  }

  // english: the same asks in English, with the city set.
  for (let k = 0; k < 40; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const d = r.pick(districtsOf(city));
    const form = k % 4;
    if (form === 0) {
      const e = r.pick(EN_DISHES);
      const ts = [
        `where can I eat ${e.en} in ${d}`,
        `best ${e.en} in ${d}?`,
        `looking for ${e.en} around ${d} tonight`,
        `${e.en} in ${d} please`,
      ];
      add('english', city, () => r.pick(ts), {
        kind: ['search'],
        district: d,
        food: true,
        catIn: catsOf(e.d),
        dishHas: e.d.has,
      });
    } else if (form === 1) {
      const ts = [
        `I'm vegetarian, something in ${d}`,
        `vegetarian food in ${d}?`,
        `we don't eat meat, any place in ${d}`,
        `vegan options in ${d} please`,
      ];
      add('english', city, () => r.pick(ts), {
        kind: ['search'],
        district: d,
        food: true,
        catNot: ['meat', 'fish'],
      });
    } else if (form === 2) {
      const ts = [
        `parking in ${d}`,
        `where can I park in ${d}`,
        `free parking ${d}`,
        `need a car park near ${d} center`,
      ];
      add('english', city, () => r.pick(ts), {
        kind: ['search'],
        district: d,
        food: false,
        requireParking: false,
      });
    } else {
      const ts = [
        'cheap breakfast near me',
        'breakfast place near me',
        'good breakfast around here?',
        'where can I get breakfast nearby',
      ];
      add('english', city, () => r.pick(ts), {
        kind: ['search'],
        nearMe: true,
        district: null,
        food: true,
        catIn: ['breakfast'],
      });
    }
  }

  // multi_turn: a request split over two messages.
  const MT_DISHES = DISHES.filter((d) => d.x !== 'filtre kahve' && d.x !== 'menemen');
  for (let k = 0; k < 60; k++) {
    const city = CITY_IDS[k % CITY_IDS.length] as AiCityId;
    const ds = districtsOf(city);
    const d = r.pick(ds);
    const dish = r.pick(MT_DISHES);
    const low = d.toLocaleLowerCase('tr');
    const part = Math.floor(k / 15);
    if (part === 0) {
      // (a) the district answers "which district?"
      const history: ChatTurn[] = [
        { role: 'user', text: `${dish.x} yemek istiyorum` },
        { role: 'bot', text: 'Hangi semtte?' },
      ];
      const ts = [`${low} bro`, `${locative(d)} olsun`, `${low} kanka`, `hmm ${low}`, `${low}`];
      add(
        'multi_turn',
        city,
        () => mess(r, r.pick(ts), { wrap: false }),
        {
          kind: ['search'],
          district: d,
          food: true,
          noPlace: true,
          dishHas: dish.has,
        },
        history,
      );
    } else if (part === 1 || part === 2) {
      const history: ChatTurn[] = [
        { role: 'user', text: `${locative(d)} ${dish.x}` },
        { role: 'bot', text: `${d} için 5 yer buldum.` },
      ];
      if (part === 1) {
        // (b) the same request in another district
        const d2 = r.pick(ds.filter((x) => x !== d));
        const ts = [
          `${locative(d2)} için de bak`,
          `bir de ${locative(d2)} bak`,
          `${d2.toLocaleLowerCase('tr')} nasıl peki`,
          `peki ${locative(d2)} var mı`,
        ];
        add(
          'multi_turn',
          city,
          () => mess(r, r.pick(ts), { wrap: false }),
          {
            kind: ['search'],
            district: d2,
            dishHas: dish.has,
          },
          history,
        );
      } else {
        // (c) closer to the user
        const ts = [
          'daha yakını var mı',
          'bana daha yakın olan',
          'en yakını hangisi',
          'daha yakın bi yer yok mu',
        ];
        add(
          'multi_turn',
          city,
          () => mess(r, r.pick(ts), { wrap: false }),
          {
            kind: ['search'],
            nearMe: true,
          },
          history,
        );
      }
    } else {
      // (d) the district answers after a diet
      const diet = r.pick([
        'vejetaryenim',
        'ben vejeteryenim',
        'vegan besleniyorum',
        'et yemiyorum vejetaryenim',
      ]);
      const history: ChatTurn[] = [
        { role: 'user', text: diet },
        { role: 'bot', text: 'Hangi semtte vejetaryen yemek istersiniz?' },
      ];
      const ts = [`hmm ${low} kanka`, `${low} olsun abi`, `${low} bro`, `${locative(d)} olsun`];
      add(
        'multi_turn',
        city,
        () => mess(r, r.pick(ts), { wrap: false }),
        {
          kind: ['search'],
          district: d,
          food: true,
          meaningHas: VEG,
        },
        history,
      );
    }
  }

  // chat_gibberish: talk, gibberish and mild abuse.
  const CHAT = [
    'selam',
    'merhaba nasılsın',
    'teşekkürler çok sağol',
    'eyvallah kanka',
    'sen kimsin',
    'dünkü maç kaç kaç bitti',
    'yarın hava nasıl olacak',
    'iyi geceler',
    'günaydın 🙏',
    'fenerbahçe bu sene şampiyon olur mu',
    'bana bir fıkra anlat',
    'hello how are you',
    'thanks a lot',
    'who made you',
    'dolar kaç tl oldu',
    'çok iyisin valla teşekkürler',
    'görüşürüz',
    'naber',
  ];
  const GIBBERISH = [
    'asdasd',
    'Oo',
    '...',
    'kdjfhg',
    '😂😂',
    'qwerty',
    'sdfsdf ghj',
    '???',
    'lkjlkj',
    'xcvb nm',
    'aaaaaa',
    'hjkl',
  ];
  const ABUSE = [
    'salak mısın',
    'çok aptalsın',
    'işe yaramıyorsun',
    'sen ne biçim botsun ya',
    'you are useless',
  ];
  for (const [k, text] of CHAT.entries()) {
    add('chat_gibberish', CITY_IDS[k % 5] as AiCityId, () => text, { kind: ['chat'] });
  }
  for (const [k, text] of GIBBERISH.entries()) {
    add('chat_gibberish', CITY_IDS[k % 5] as AiCityId, () => text, { kind: ['unknown', 'chat'] });
  }
  for (const [k, text] of ABUSE.entries()) {
    add('chat_gibberish', CITY_IDS[k % 5] as AiCityId, () => text, { kind: ['chat', 'unknown'] });
  }

  return { understand, pick: buildPicks(r) };
}

type Tag =
  | 'kebap'
  | 'izgara'
  | 'kasap'
  | 'dessert'
  | 'lokanta'
  | 'cafe'
  | 'fish'
  | 'breakfast'
  | 'fast'
  | 'vegan'
  | 'world'
  | 'soup'
  | 'meyhane'
  | 'pide';

const POOL: Record<Tag, { type: string; names: string[] }> = {
  kebap: {
    type: 'Et, restoran, Kebap',
    names: [
      'Kebapçı Halil',
      'Adana Ocakbaşı',
      'Köfteci Ramiz',
      'Urfa Sofrası',
      'Zübeyir Ocakbaşı',
      'Kebapçı Mahmut',
    ],
  },
  izgara: {
    type: 'Et, restoran, Izgara',
    names: ['Izgara Köfte Evi', 'Mangal Keyfi', 'Steakhouse Dana', 'Ocakbaşı Mangal'],
  },
  kasap: {
    type: 'Et, kasap, restoran',
    names: ['Kasap Fuat', 'Kasap Ali Et Lokantası', 'Etçi Mehmet'],
  },
  dessert: {
    type: 'Tatlı & Dondurma, pastane',
    names: [
      'Baklavacı Hüseyin',
      'Pastane Saray',
      'Künefeci Hasan',
      'Tatlıcı Safa',
      'Dondurmacı Ali Usta',
    ],
  },
  lokanta: {
    type: 'Lokanta, restoran, Ev yemekleri',
    names: [
      'Ev Yemekleri Lokantası',
      'Esnaf Lokantası Hünkar',
      'Anne Eli Lokanta',
      'Çınaraltı Lokantası',
    ],
  },
  cafe: {
    type: 'Kafe, Kahve',
    names: ['Kahve Diyarı', 'Kahve Sokağı', 'Kitap Kafe', 'Üçüncü Dalga Kahve'],
  },
  fish: {
    type: 'Balık, restoran',
    names: ['Balıkçı Kemal', 'Deniz Yıldızı Balık', 'Balık Pazarı Restoran', 'Levrek Balıkçısı'],
  },
  breakfast: {
    type: 'Kahvaltı, kahvaltı salonu',
    names: ['Kahvaltı Bahçesi', 'Serpme Kahvaltı Evi', 'Van Kahvaltı Salonu', 'Köy Kahvaltısı'],
  },
  fast: {
    type: 'Fast food, restoran, Burger',
    names: ['Burger House', 'Burger Lab', 'Hızlı Burger', 'Burgerci Can'],
  },
  vegan: {
    type: 'Vegan, restoran',
    names: ['Yeşil Vegan Mutfak', 'Vegan Sofra', 'Bitki Vegan Restoran'],
  },
  world: { type: 'Dünya mutfağı, Sushi', names: ['Sushi Co', 'Tokyo Sushi Bar', 'Wok Asia'] },
  soup: {
    type: 'Çorba, lokanta',
    names: ['Çorbacı Hacı Usta', 'Kelle Paça Çorba Salonu', 'Sıcak Çorba Evi'],
  },
  meyhane: {
    type: 'Meyhane, restoran, Rakı balık',
    names: ['Meyhane Asmalı', 'Rakı Balık Meyhanesi', 'Eski Meyhane'],
  },
  pide: {
    type: 'Fast food, restoran, Pide',
    names: ['Pideci Mehmet', 'Karadeniz Pide Salonu', 'Lahmacun Evi'],
  },
};

type Scenario = {
  key: string;
  texts: string[];
  tags: Tag[];
  good?: Tag[];
  bad?: Tag[];
  noneFit?: boolean;
  count: number;
};

const SCENARIOS: readonly Scenario[] = [
  {
    key: 'vegetarian',
    texts: [
      'vejetaryenim, ne yiyebilirim?',
      'et yemiyorum bana uygun bir yer seç',
      'vejeteryen dostu bir yer olsun kanka',
      'ben ve eşim vejetaryeniz akşam yemeği',
    ],
    tags: ['kebap', 'kasap', 'vegan', 'lokanta', 'dessert', 'fish'],
    good: ['vegan', 'lokanta'],
    bad: ['kebap', 'kasap', 'fish'],
    count: 4,
  },
  {
    key: 'vegan',
    texts: [
      'veganım',
      'vegan bir şey yiyelim',
      'hayvansal hiçbir şey yemiyorum',
      'vegan menü lazım abi',
    ],
    tags: ['kebap', 'vegan', 'dessert', 'fish', 'meyhane'],
    good: ['vegan'],
    bad: ['kebap', 'fish'],
    count: 4,
  },
  {
    key: 'protein',
    texts: [
      'kas yapıyorum protein lazım',
      'spordan sonra proteinli bir şey',
      'bulk yapıyorum doyurucu et olsun',
      'protein ağırlıklı beslenmem lazım',
    ],
    tags: ['dessert', 'cafe', 'kebap', 'izgara', 'dessert'],
    good: ['kebap', 'izgara'],
    bad: ['dessert', 'cafe'],
    count: 4,
  },
  {
    key: 'dessert',
    texts: [
      'tatlı krizine girdim',
      'canım tatlı çekti',
      'baklava künefe bir şeyler',
      'yemekten sonra tatlı yiyelim',
    ],
    tags: ['kebap', 'dessert', 'fish', 'lokanta', 'fast'],
    good: ['dessert'],
    bad: ['kebap', 'fish'],
    count: 4,
  },
  {
    key: 'breakfast',
    texts: [
      'kahvaltı yapalım',
      'serpme kahvaltı istiyorum',
      'pazar kahvaltısı için yer',
      'güzel bir kahvaltı mekanı',
    ],
    tags: ['breakfast', 'meyhane', 'kebap', 'dessert', 'cafe'],
    good: ['breakfast', 'cafe'],
    bad: ['meyhane', 'kebap'],
    count: 4,
  },
  {
    key: 'fish',
    texts: [
      'balık yiyelim',
      'taze balık istiyorum',
      'deniz ürünleri canım çekti',
      'levrek çipura bir şeyler',
    ],
    tags: ['fish', 'kebap', 'dessert', 'cafe', 'pide'],
    good: ['fish'],
    bad: ['dessert', 'cafe'],
    count: 4,
  },
  {
    key: 'soup when cold',
    texts: [
      'üşüdüm sıcak bir çorba içsem',
      'çorba içmek istiyorum',
      'hastayım sıcak çorba lazım',
      'gece çorba içelim',
    ],
    tags: ['soup', 'dessert', 'cafe', 'kebap', 'lokanta'],
    good: ['soup', 'lokanta'],
    bad: ['dessert', 'cafe'],
    count: 4,
  },
  {
    key: 'coffee and work',
    texts: [
      'laptopla çalışabileceğim bir kahveci',
      'kahve içip ders çalışacağım',
      'sakin bir yerde kahve içip çalışmak istiyorum',
      'toplantı öncesi kahve',
    ],
    tags: ['cafe', 'kebap', 'meyhane', 'fish', 'fast'],
    good: ['cafe'],
    bad: ['kebap', 'meyhane', 'fish'],
    count: 4,
  },
  {
    key: 'kids',
    texts: [
      'çocuklarla gidilecek bir yer',
      'iki çocukla yemek yiyeceğiz',
      'çocuklu aileyiz yemek yiyelim',
      'beş yaşındaki oğlumla yemek',
    ],
    tags: ['meyhane', 'meyhane', 'fast', 'lokanta', 'pide'],
    good: ['fast', 'lokanta', 'pide'],
    bad: ['meyhane'],
    count: 4,
  },
  {
    key: 'nothing fits: sushi among kebab places',
    texts: ['sushi yemek istiyorum', 'canım suşi çekti', 'sushi bar arıyorum'],
    tags: ['kebap', 'kebap', 'izgara', 'kasap', 'pide'],
    noneFit: true,
    count: 3,
  },
  {
    key: 'nothing fits: fish among desserts and burgers',
    texts: ['balık yiyelim', 'taze balık istiyorum', 'akşam balık yiyeceğiz'],
    tags: ['dessert', 'cafe', 'kebap', 'pide', 'fast'],
    noneFit: true,
    count: 3,
  },
  {
    key: 'nothing fits: vegan among butchers',
    texts: ['veganım bana uygun bir yer', 'vegan yemek lazım', 'tamamen bitkisel besleniyorum'],
    tags: ['kebap', 'kebap', 'kasap', 'izgara', 'fish'],
    noneFit: true,
    count: 3,
  },
];

const PARKING_M: readonly (number | null)[] = [null, 60, 120, 250, 400];

function buildPicks(r: Rng): BigPickCase[] {
  const out: BigPickCase[] = [];
  for (const s of SCENARIOS) {
    for (let k = 0; k < s.count; k++) {
      const order = r.shuffle(s.tags);
      const used = new Set<string>();
      const candidates: PickCandidate[] = order.map((tag, i) => {
        const pool = POOL[tag];
        const name = r.pick(pool.names.filter((n) => !used.has(n)));
        used.add(name);
        return place(i, name, pool.type, 1 + r.int(12), r.pick(PARKING_M));
      });
      const at = (tags: Tag[] | undefined) =>
        order.flatMap((tag, i) => (tags?.includes(tag) ? [i] : []));
      const expect: PickCase['expect'] = s.noneFit
        ? { noneFit: true }
        : { pickIn: at(s.good), notFit: at(s.bad) };
      out.push({
        group: 'pick',
        name: `pick: ${s.key} #${k + 1}`,
        city: CITY_IDS[out.length % CITY_IDS.length] as AiCityId,
        text: s.texts[k % s.texts.length] as string,
        candidates,
        expect,
      });
    }
  }
  return out;
}

const BUILT = buildBigCases();
export const BIG_UNDERSTAND_CASES: BigUnderstandCase[] = BUILT.understand;
export const BIG_PICK_CASES: BigPickCase[] = BUILT.pick;
