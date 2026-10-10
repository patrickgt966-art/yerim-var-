import { dishStem, hasWordStart, type FoodCategory } from '@/data/restaurants';
import { fold } from '@/data/search';

/**
 * A dish and the places that very likely serve it. All words are folded (see
 * `fold`). `serves` words match at a word start of the folded restaurant name;
 * `cuisines` are OSM / Overture cuisine tags. Both are only a hint that the
 * place serves the dish, never a fact about its menu, so the UI words it as
 * "büyük ihtimalle".
 */
export type DishProfile = {
  /** The dish as a category word (so parseQuery reads it as food). */
  dish: string;
  cat: FoodCategory;
  /** Folded name keywords that strongly imply the dish. */
  serves: string[];
  /** Cuisine tags that imply the dish. */
  cuisines?: string[];
  /** Short Turkish type label for the card reason, e.g. 'pide-kebap salonu'. */
  label: string;
};

function d(
  dish: string,
  cat: FoodCategory,
  label: string,
  serves: string[],
  cuisines?: string[],
): DishProfile {
  return cuisines ? { dish, cat, label, serves, cuisines } : { dish, cat, label, serves };
}

const KEBAP = ['kebap', 'kebab', 'kebapci', 'ocakbasi', 'mangal'];
const PIDE = ['pide', 'pideci', 'lahmacun'];
const DONER = ['doner', 'donerci', 'durum'];
const FISH = ['balik', 'balikci', 'deniz urunleri'];
const FISH_TAGS = ['seafood', 'fish'];
const SOUP = ['corba', 'corbaci'];
const OFFAL = ['iskembe', 'kelle', 'paca', 'sakatat'];
const HOME = ['ev yemek', 'esnaf lokanta', 'ev mutfagi', 'lokanta'];
const HOME_TAGS = ['homestyle'];
const KAHVALTI = ['kahvalti', 'kahvalti salonu'];
const SWEET = ['tatlici', 'pastane'];
const COFFEE = ['kahve', 'coffee', 'kahvecisi', 'roastery', 'espresso'];
const COFFEE_TAGS = ['coffee_shop', 'coffee'];
const KOFTE = ['kofte', 'kofteci'];

export const DISHES: DishProfile[] = [
  // fast: pide, lahmacun, döner, burger and friends
  d(
    'lahmacun',
    'fast',
    'pide-kebap salonu',
    [...PIDE, ...KEBAP],
    ['kebab', 'turkish_pizza', 'pide', 'lahmacun', 'pide_lahmacun'],
  ),
  d(
    'pide',
    'fast',
    'pide salonu',
    [...PIDE, 'kebap', 'kebab', 'kebapci'],
    ['pide', 'lahmacun', 'pide_lahmacun', 'turkish_pizza'],
  ),
  d('kiymali pide', 'fast', 'pide salonu', PIDE, ['pide', 'pide_lahmacun', 'turkish_pizza']),
  d('kusbasili pide', 'fast', 'pide salonu', PIDE, ['pide', 'pide_lahmacun', 'turkish_pizza']),
  d('etli pide', 'fast', 'pide salonu', PIDE, ['pide', 'pide_lahmacun', 'turkish_pizza']),
  d('kasarli pide', 'fast', 'pide salonu', PIDE, ['pide', 'pide_lahmacun', 'turkish_pizza']),
  d('etli ekmek', 'fast', 'pide salonu', ['etli ekmek', ...PIDE], ['pide', 'pide_lahmacun']),
  d('doner', 'fast', 'dönerci', DONER, ['doner', 'kebab']),
  d('tavuk doner', 'fast', 'dönerci', DONER, ['doner', 'chicken']),
  d('durum', 'fast', 'dürümcü', DONER, ['doner', 'kebab']),
  d('cig kofte', 'fast', 'çiğ köfteci', ['cig kofte', 'cigkofte'], ['cigkofte', 'cig kofte']),
  d('cigkofte', 'fast', 'çiğ köfteci', ['cig kofte', 'cigkofte'], ['cigkofte', 'cig kofte']),
  d('hamburger', 'fast', 'hamburgerci', ['burger', 'hamburger'], ['burger']),
  d('burger', 'fast', 'burgerci', ['burger', 'hamburger'], ['burger']),
  d('pizza', 'fast', 'pizzacı', ['pizza', 'pizzeria'], ['pizza']),
  d('tost', 'fast', 'tostçu', ['tost', 'tostcu', 'sandvic', 'sandwich'], ['tost', 'sandwich']),
  d('kumpir', 'fast', 'kumpirci', ['kumpir', 'patates'], ['kumpir', 'patates']),
  d('patso', 'fast', 'patsocu', ['patso'], ['fries']),
  d('sandvic', 'fast', 'sandviççi', ['sandvic', 'sandwich', 'subway', 'tost'], ['sandwich']),
  d('sosisli', 'fast', 'sosisli satıcısı', ['sosisli', 'hot dog', 'hotdog'], ['hotdog']),

  // meat: kebap kinds, köfte, ciğer, steak
  d('kebap', 'meat', 'kebapçı', KEBAP, ['kebab', 'barbecue', 'grill']),
  d('kebab', 'meat', 'kebapçı', KEBAP, ['kebab', 'barbecue', 'grill']),
  d('adana', 'meat', 'kebapçı', ['adana', ...KEBAP], ['kebab', 'barbecue']),
  d('adana kebap', 'meat', 'kebapçı', ['adana', ...KEBAP], ['kebab', 'barbecue']),
  d('urfa', 'meat', 'kebapçı', ['urfa', ...KEBAP], ['kebab', 'barbecue']),
  d('urfa kebap', 'meat', 'kebapçı', ['urfa', ...KEBAP], ['kebab', 'barbecue']),
  d('sis kebap', 'meat', 'kebapçı', KEBAP, ['kebab', 'barbecue']),
  d('iskender', 'meat', 'kebapçı', ['iskender', 'doner', 'donerci', ...KEBAP], ['kebab', 'doner']),
  d('beyti', 'meat', 'kebapçı', ['beyti', ...KEBAP], ['kebab']),
  d('ali nazik', 'meat', 'kebapçı', ['ali nazik', ...KEBAP], ['kebab']),
  d('testi kebap', 'meat', 'kebapçı', ['testi', ...KEBAP], ['kebab']),
  d('testi kebabi', 'meat', 'kebapçı', ['testi', ...KEBAP], ['kebab']),
  d('patlican kebabi', 'meat', 'kebapçı', KEBAP, ['kebab']),
  d('kagit kebabi', 'meat', 'kebapçı', KEBAP, ['kebab']),
  d('cop sis', 'meat', 'kebapçı', KEBAP, ['kebab']),
  d(
    'kanat',
    'meat',
    'mangal-ızgara',
    ['kanat', 'mangal', 'izgara', 'ocakbasi'],
    ['barbecue', 'grill'],
  ),
  d(
    'pirzola',
    'meat',
    'ızgara-ocakbaşı',
    ['pirzola', 'izgara', 'mangal', 'ocakbasi'],
    ['barbecue', 'grill', 'steak_house'],
  ),
  d(
    'izgara',
    'meat',
    'ızgara-ocakbaşı',
    ['izgara', 'mangal', 'ocakbasi', 'kebap'],
    ['barbecue', 'grill'],
  ),
  d('mangal', 'meat', 'mangal-ocakbaşı', ['mangal', 'ocakbasi', 'izgara'], ['barbecue', 'grill']),
  d('ocakbasi', 'meat', 'ocakbaşı', ['ocakbasi', 'mangal', 'kebap', 'kebapci'], ['barbecue']),
  d('kuzu', 'meat', 'ocakbaşı-kebapçı', ['kuzu', 'ocakbasi', 'tandir', ...KEBAP], ['barbecue']),
  d('kuzu tandir', 'meat', 'tandır-kebap salonu', ['tandir', 'kuzu', ...KEBAP], ['barbecue']),
  d('tandir', 'meat', 'tandır-kebap salonu', ['tandir', 'kuzu', ...KEBAP], ['barbecue']),
  d('kavurma', 'meat', 'et lokantası', ['kavurma', 'et lokantasi', 'kasap', 'ocakbasi']),
  d('sac kavurma', 'meat', 'et lokantası', ['sac kavurma', 'kavurma', 'et lokantasi', ...KEBAP]),
  d('et kavurma', 'meat', 'et lokantası', ['kavurma', 'et lokantasi', 'kasap', 'ocakbasi']),
  d('kusbasi', 'meat', 'et lokantası-kebapçı', ['et lokantasi', 'sac kavurma', 'izgara', ...KEBAP]),
  d('sis', 'meat', 'kebapçı-ocakbaşı', KEBAP, ['kebab', 'barbecue', 'grill']),
  d('kuzu sis', 'meat', 'kebapçı-ocakbaşı', ['kuzu', ...KEBAP], ['kebab', 'barbecue', 'grill']),
  d('tavuk sis', 'meat', 'kebapçı-ocakbaşı', KEBAP, ['kebab', 'barbecue', 'grill']),
  d('ciger sis', 'meat', 'ciğerci-ocakbaşı', ['ciger', 'cigerci', ...KEBAP], ['kebab', 'barbecue']),
  d(
    'kaburga',
    'meat',
    'ızgara-ocakbaşı',
    ['izgara', 'et lokantasi', 'ocakbasi', 'mangal'],
    ['barbecue', 'grill'],
  ),
  d('izgara kofte', 'meat', 'köfteci', ['izgara', ...KOFTE, 'mangal'], ['meatball', 'grill']),
  d(
    'sucuk izgara',
    'meat',
    'ızgara-ocakbaşı',
    ['izgara', 'mangal', 'ocakbasi', 'kebap'],
    ['grill'],
  ),
  d(
    'karisik izgara',
    'meat',
    'ızgara-ocakbaşı',
    ['izgara', 'mangal', 'ocakbasi', 'kebap'],
    ['barbecue', 'grill'],
  ),
  d('cokertme', 'meat', 'kebapçı', ['cokertme', ...KEBAP], ['kebab']),
  d('orman kebabi', 'meat', 'kebapçı', ['et lokantasi', ...KEBAP], ['kebab']),
  d('kebap cesitleri', 'meat', 'kebapçı', KEBAP, ['kebab', 'barbecue', 'grill']),
  d('kofte', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('izmir kofte', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('kasap kofte', 'meat', 'köfteci', ['kofte', 'kofteci', 'kasap'], ['meatball']),
  d('akcaabat kofte', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('inegol kofte', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('kofte ekmek', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('kuru kofte', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('piyaz', 'meat', 'köfteci', KOFTE, ['meatball']),
  d('ciger', 'meat', 'ciğerci', ['ciger', 'cigerci', 'ocakbasi', 'kebap']),
  d('tava ciger', 'meat', 'ciğerci', ['ciger', 'cigerci', 'ocakbasi']),
  d('arnavut ciger', 'meat', 'ciğerci', ['ciger', 'cigerci', 'ocakbasi']),
  d('arnavut cigeri', 'meat', 'ciğerci', ['ciger', 'cigerci', 'ocakbasi']),
  d('kokorec', 'meat', 'kokoreççi', ['kokorec', 'kokorecci'], ['kokorec']),
  d('tantuni', 'meat', 'tantunici', ['tantuni', 'doner', 'donerci']),
  d('sakatat', 'meat', 'sakatatçı', ['sakatat', 'kokorec', 'ciger', 'iskembe']),
  d('steak', 'meat', 'steakhouse', ['steak', 'steakhouse', 'bonfile', 'kasap'], ['steak_house']),
  d('biftek', 'meat', 'steakhouse', ['biftek', 'steak', 'steakhouse', 'kasap'], ['steak_house']),
  d(
    'antrikot',
    'meat',
    'steakhouse',
    ['antrikot', 'steak', 'steakhouse', 'kasap'],
    ['steak_house'],
  ),
  d('bonfile', 'meat', 'steakhouse', ['bonfile', 'steak', 'steakhouse', 'kasap'], ['steak_house']),

  // soup and offal
  d('mercimek', 'soup', 'çorbacı', SOUP, ['soup']),
  d('mercimek corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('ezogelin', 'soup', 'çorbacı', SOUP, ['soup']),
  d('ezogelin corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('domates corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('tarhana', 'soup', 'çorbacı', SOUP, ['soup']),
  d('tarhana corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('tavuk corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('yayla corba', 'soup', 'çorbacı', SOUP, ['soup']),
  d('beyran', 'soup', 'çorbacı-kebapçı', ['beyran', ...SOUP, ...KEBAP], ['soup']),
  d('iskembe', 'soup', 'işkembeci', OFFAL, ['soup']),
  d('iskembe corba', 'soup', 'işkembeci', OFFAL, ['soup']),
  d('kelle', 'soup', 'kelle-paçacı', OFFAL, ['soup']),
  d('kelle paca', 'soup', 'kelle-paçacı', OFFAL, ['soup']),
  d('paca', 'soup', 'paçacı', OFFAL, ['soup']),
  d('sogus', 'soup', 'kelle-paçacı', OFFAL, ['soup']),

  // lokanta: home food
  d('manti', 'lokanta', 'ev yemekleri lokantası', ['manti', 'mantici', ...HOME]),
  d('kuru fasulye', 'lokanta', 'ev yemekleri lokantası', ['fasulye', ...HOME], HOME_TAGS),
  d('taze fasulye', 'lokanta', 'ev yemekleri lokantası', ['fasulye', ...HOME], HOME_TAGS),
  d('nohut', 'lokanta', 'ev yemekleri lokantası', ['nohut', ...HOME], HOME_TAGS),
  d('etli nohut', 'lokanta', 'ev yemekleri lokantası', ['nohut', ...HOME], HOME_TAGS),
  d('barbunya', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('pilav', 'lokanta', 'pilavcı-lokanta', ['pilav', 'pilavci', ...HOME], HOME_TAGS),
  d('tavuk pilav', 'lokanta', 'pilavcı', ['pilav', 'pilavci', 'tavuk pilav']),
  d('nohutlu pilav', 'lokanta', 'pilavcı', ['pilav', 'pilavci', 'nohutlu']),
  d('pilav ustu', 'lokanta', 'pilavcı', ['pilav', 'pilavci']),
  d('ev yemegi', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('ev yemekleri', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('esnaf lokantasi', 'lokanta', 'esnaf lokantası', HOME, HOME_TAGS),
  d('dolma', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('sarma', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('karniyarik', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('imam bayildi', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('guvec', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('tas kebabi', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('mucver', 'lokanta', 'ev yemekleri lokantası', HOME, HOME_TAGS),
  d('kuzu incik', 'meat', 'tandır-kebap salonu', ['incik', 'tandir', 'ocakbasi', ...KEBAP]),

  // fish
  d('cipura', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('levrek', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('hamsi', 'fish', 'balık restoranı', [...FISH, 'karadeniz'], FISH_TAGS),
  d('kalamar', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('karides', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('ahtapot', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('midye', 'fish', 'midyeci', ['midye', 'midyeci', ...FISH], FISH_TAGS),
  d('midye dolma', 'fish', 'midyeci', ['midye', 'midyeci'], FISH_TAGS),
  d('lufer', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('barbun', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('istavrit', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('sardalya', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('uskumru', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('palamut', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('somon', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('alabalik', 'fish', 'balık restoranı', FISH, FISH_TAGS),
  d('balik ekmek', 'fish', 'balık ekmekçi', ['balik ekmek', 'balikci', 'balik'], FISH_TAGS),

  // meyhane
  d('meze', 'meyhane', 'meyhane', ['meyhane', 'meze', 'taverna'], ['meyhane', 'meze']),
  d('raki', 'meyhane', 'meyhane', ['meyhane', 'taverna', 'raki'], ['meyhane']),
  d('raki balik', 'meyhane', 'meyhane', ['meyhane', 'balik', 'taverna'], ['meyhane']),
  d('bira', 'meyhane', 'pub-birahane', ['pub', 'birahane', 'bira', 'biergarten', 'brewery']),

  // breakfast
  d(
    'menemen',
    'breakfast',
    'kahvaltı salonu',
    ['menemen', 'menemenci', ...KAHVALTI],
    ['breakfast'],
  ),
  d('gozleme', 'breakfast', 'gözlemeci', ['gozleme', 'gozlemeci', 'koy kahvalti', 'serpme']),
  d('boyoz', 'breakfast', 'boyoz-gevrek', ['boyoz', 'boyozcu', 'gevrek', 'simit'], ['bagel']),
  d('gevrek', 'breakfast', 'boyoz-gevrek', ['gevrek', 'boyoz', 'boyozcu', 'simit'], ['bagel']),
  d('simit', 'breakfast', 'simitçi-fırın', ['simit', 'simitci', 'gevrek', 'boyoz'], ['bagel']),
  d('kumru', 'breakfast', 'kumrucu', ['kumru', 'kumrucu'], ['kumru']),
  d('borek', 'breakfast', 'börekçi', ['borek', 'boreg', 'borekci', 'pogaca']),
  d('su boregi', 'breakfast', 'börekçi', ['borek', 'boreg', 'borekci']),
  d('kol boregi', 'breakfast', 'börekçi', ['borek', 'boreg', 'borekci']),
  d('sigara boregi', 'breakfast', 'börekçi', ['borek', 'boreg', 'borekci']),
  d('pogaca', 'breakfast', 'poğaçacı-fırın', ['pogaca', 'borek', 'boreg', 'firin']),
  d('acma', 'breakfast', 'poğaçacı-fırın', ['acma', 'pogaca', 'borek', 'firin']),
  d('katmer', 'breakfast', 'katmerci', ['katmer', 'katmerci']),
  d('kuymak', 'breakfast', 'kahvaltı salonu', ['kuymak', 'karadeniz', ...KAHVALTI], ['breakfast']),
  d('sucuklu yumurta', 'breakfast', 'kahvaltı salonu', [...KAHVALTI, 'menemenci'], ['breakfast']),
  d('omlet', 'breakfast', 'kahvaltı salonu', [...KAHVALTI, 'menemenci'], ['breakfast']),
  d('serpme kahvalti', 'breakfast', 'kahvaltı salonu', [...KAHVALTI, 'serpme'], ['breakfast']),

  // dessert
  d('baklava', 'dessert', 'baklavacı-tatlıcı', ['baklava', 'baklavaci', ...SWEET]),
  d('kunefe', 'dessert', 'künefeci-tatlıcı', ['kunefe', 'kunefeci', 'tatlici']),
  d('sutlac', 'dessert', 'muhallebici-tatlıcı', ['sutlac', 'muhallebi', 'muhallebici', 'tatlici']),
  d('kazandibi', 'dessert', 'muhallebici-tatlıcı', ['muhallebi', 'muhallebici', 'tatlici']),
  d(
    'dondurma',
    'dessert',
    'dondurmacı',
    ['dondurma', 'dondurmaci', 'gelato', 'maras'],
    ['ice_cream'],
  ),
  d('profiterol', 'dessert', 'pastane-tatlıcı', ['profiterol', ...SWEET], ['dessert', 'cake']),
  d('waffle', 'dessert', 'waffle-krep', ['waffle', 'krep', 'kreperi'], ['waffle', 'pancake']),
  d('krep', 'dessert', 'waffle-krep', ['krep', 'kreperi', 'waffle'], ['pancake', 'waffle']),
  d('tiramisu', 'dessert', 'pastane-tatlıcı', SWEET, ['cake', 'pastry']),
  d('cheesecake', 'dessert', 'pastane-tatlıcı', ['cheesecake', ...SWEET], ['cake']),
  d('san sebastian', 'dessert', 'pastane-tatlıcı', SWEET, ['cake', 'pastry']),
  d('trilece', 'dessert', 'pastane-tatlıcı', SWEET, ['cake', 'pastry']),
  d('lokma', 'dessert', 'lokmacı-tatlıcı', ['lokma', 'lokmaci', 'tatlici'], ['izmir_lokma']),
  d('tulumba', 'dessert', 'tatlıcı', ['tulumba', 'tatlici', 'lokma']),
  d('revani', 'dessert', 'pastane-tatlıcı', SWEET),
  d('sekerpare', 'dessert', 'pastane-tatlıcı', SWEET),
  d('kadayif', 'dessert', 'tatlıcı', ['kadayif', 'tatlici', 'baklava']),
  d('supangle', 'dessert', 'muhallebici-tatlıcı', ['muhallebi', 'muhallebici', 'tatlici']),
  d('donut', 'dessert', 'donut dükkanı', ['donut', 'dunkin'], ['donut']),
  d('macaron', 'dessert', 'pastane', ['macaron', 'pastane', 'patisserie'], ['pastry', 'cake']),

  // cafe
  d('filtre kahve', 'cafe', 'kahveci', COFFEE, COFFEE_TAGS),
  d('turk kahvesi', 'cafe', 'kahveci', [...COFFEE, 'kahvehane'], [...COFFEE_TAGS, 'turk_kahvesi']),
  d('espresso', 'cafe', 'kahveci', COFFEE, COFFEE_TAGS),
  d('latte', 'cafe', 'kahveci', COFFEE, COFFEE_TAGS),
  d('cay', 'cafe', 'çay bahçesi-kahvehane', ['cay', 'kahvehane'], ['tea']),
  d('cay bahcesi', 'cafe', 'çay bahçesi', ['cay', 'kahvehane'], ['tea']),
  d('bubble tea', 'cafe', 'bubble tea dükkanı', ['bubble', 'boba'], ['bubble_tea']),
];

/** Levenshtein distance at most one (insert, delete, substitute or swap neighbours). */
function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** Endings that turn a dish into the seller or a plural ("lahmacuncu", "mantıcı", "köfteler"), longest first. */
const SELLER_SUFFIXES = ['lari', 'leri', 'lar', 'ler', 'ci', 'cu', 'si', 'su'];

const BY_DISH = new Map(DISHES.map((p) => [p.dish, p]));

/** The folded text and the forms it takes with the last word's ending removed. */
function candidates(f: string): string[] {
  const out = [f, dishStem(f)];
  const parts = f.split(' ');
  const last = parts.pop() ?? '';
  for (const suf of SELLER_SUFFIXES) {
    if (last.endsWith(suf) && last.length - suf.length >= 3) {
      out.push([...parts, last.slice(0, last.length - suf.length)].join(' '));
    }
  }
  return out;
}

/**
 * The profile of a folded dish ("lahmacuncu", "tavuk pilavci", "lahmcun"), or null.
 * Tries the exact dish, the stem without its seller/plural ending, then one typo
 * (only for words of 5 or more characters).
 */
export function dishProfile(dishFolded: string): DishProfile | null {
  const f = fold(dishFolded.trim());
  if (!f) return null;
  const forms = candidates(f);
  for (const c of forms) {
    const hit = BY_DISH.get(c);
    if (hit) return hit;
  }
  for (const c of forms) {
    if (c.length < 5) continue;
    const hit = DISHES.find((p) => p.dish.length >= 5 && withinOne(c, p.dish));
    if (hit) return hit;
  }
  return null;
}

const normCuisine = (c: string) => fold(c.replace(/_/g, ' '));

/** True when the folded name starts a `serves` word, or a cuisine tag implies the dish. */
export function likelyServes(p: DishProfile, foldedName: string, cuisines: string[]): boolean {
  if (p.serves.some((kw) => hasWordStart(foldedName, kw))) return true;
  if (!p.cuisines || p.cuisines.length === 0) return false;
  const want = p.cuisines.map(normCuisine);
  return cuisines.some((c) => want.includes(normCuisine(c)));
}

/** Folded words that name a kind of place, not a dish (never a dish stem or a `serves` word). */
export const GENERIC_DISH_STEMS = new Set([
  'et',
  'balik',
  'kahvalti',
  'corba',
  'lokanta',
  'kafe',
  'meyhane',
  'tatli',
  'restoran',
  'cafe',
  'kahve',
  'coffee',
  'balikci',
  'fast food',
  'hizli yemek',
  'ev yemegi',
  'esnaf lokantasi',
  'kahvalti salonu',
  'bar',
  'pub',
  'meat',
  'grill',
  'fish',
  'soup',
  'seafood',
  'breakfast',
  'brunch',
  'dessert',
  'pastane',
  'kahvehane',
  'cay bahcesi',
  'deniz urunleri',
  'yemek',
  'mutfak',
]);
