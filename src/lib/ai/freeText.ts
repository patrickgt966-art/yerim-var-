// The only places the model may write its own words. Everything else it sends is a code or an
// index. A text that fails here is dropped and the app's template is used instead.
import { activeCity, CITIES } from '../../data/cities';
import { fold } from './protocol';

/** Z1 = tone (pick / plan / understand), Z2 = clarify question, Z3 = note about a dish. */
export type FreeTextZone = 'tone' | 'clarify' | 'dishNote' | 'offtopic' | 'chat';

/** 'offtopic' is the chit-chat redirect of /understand: tone rules, a little more room. */
const MAX_CHARS: Record<FreeTextZone, number> = {
  tone: 90,
  clarify: 80,
  dishNote: 140,
  offtopic: 120,
  chat: 140,
};
const MAX_SENTENCES = 2;

/**
 * Folded words that make a sentence a claim about a place, a price, a time or a quality.
 * Matched at the start of a word ("yakin" also catches "yakında"); entries with a space match
 * the phrase, and an entry ending in a space matches a whole word (also at the end of the
 * text). Park words are only banned outside the clarify question. Claim words whose folded
 * form is also another everyday word are in BANNED_TURKISH_WORDS instead.
 */
export const BANNED_WORDS = [
  'ucretsiz',
  'ucuz',
  'pahali',
  'fiyat',
  'indirim',
  'kampanya',
  'butce',
  'ekonomik',
  'hesapli',
  'sarj',
  'soket',
  'elektrik',
  'lira',
  'tl',
  'kapali',
  'saat',
  'bos',
  'dolu',
  'yer var',
  'dakika',
  'dk',
  'metre',
  'km',
  'mesafe',
  'yuru',
  'yakin',
  'uzak',
  'en iyi',
  'en lezzetli',
  'lezzetli',
  'meshur',
  'puan',
  'yildiz',
  'yorum',
  'menu',
  'garanti',
  'kesin',
  'guvenli',
  'guvenlik',
  'kamerali',
  'bekci',
  'yuksekl',
  'rezervasyon',
  // The same claims in English (the app also answers in English).
  'free',
  'cheap',
  'expensive',
  'price',
  'pricey',
  'budget',
  'affordable',
  'economical',
  'charg',
  'electric',
  'discount',
  'deal',
  'cost',
  'open',
  'closed',
  'hour',
  'minute',
  'min ',
  'meter',
  'metre',
  'mile',
  'spaces',
  'spots',
  'vacan',
  'nearby',
  'near ',
  'close by',
  'walk',
  'steps away',
  'corner',
  'distance',
  'far ',
  'best',
  'tastiest',
  'delicious',
  'famous',
  'popular',
  'rating',
  'rated',
  'stars',
  'review',
  'guarantee',
  'safe',
  'security',
  'camera',
  'reservation',
  'booking',
];
/**
 * Claim words whose folded form is another everyday word: "açık" (open) and "acık-" (to get
 * hungry: "acıktın") both fold to "acik", "ünlü" (famous) and "unlu" (made with flour) to "unlu".
 * A text with Turkish letters is checked against these as written (word start, Turkish lower
 * case); a text without any may have lost its accents, so it is checked folded. "acik" is listed
 * too: it is no word as written, so it is "açık" with its accents lost; "unlu" is a word.
 */
export const BANNED_TURKISH_WORDS = ['açık', 'acik', 'ünlü'];
/**
 * Harmless phrases that contain a banned word, blanked out before the banned-word check:
 * "Uzak Doğu" is a cuisine, not a distance, and "feel free" is no price. Folded; each matches
 * at the start of a word and takes any ending ("uzak doğunun", "far eastern").
 */
const HARMLESS_PHRASES = [
  'uzak dogu',
  'uzakdogu',
  'far east',
  'near east',
  'feel free',
  'gluten free',
  'sugar free',
  'dairy free',
  'lactose free',
  'meat free',
  'alcohol free',
  'safe travels',
  'safe trip',
  'safe journey',
  'drive safe',
  'stay safe',
  'all the best',
  'best wishes',
  'kesinlikle',
];
/** "X mutfağında önemli bir yeri var": a place in a cuisine, not a place (dish note only). */
const DISH_NOTE_HARMLESS_PHRASES = ['onemli bir yer', 'ozel bir yer', 'ayri bir yer'];
/**
 * Dishes named after a district ("menemen", "İnegöl köftesi"), folded: not a mention of the
 * district, unless a case ending follows the name ("Menemen'de" folds to "menemen de").
 */
const DISTRICT_DISHES = ['menemen', 'inegol kofte', 'kemalpasa tatli', 'tire kofte'];
const CASE_ENDINGS = new Set([
  'de',
  'da',
  'te',
  'ta',
  'den',
  'dan',
  'ten',
  'tan',
  'deki',
  'daki',
  'teki',
  'taki',
  'e',
  'a',
  'ye',
  'ya',
  'i',
  'u',
  'yi',
  'yu',
  'in',
  'un',
  'nin',
  'nun',
]);
/** Banned in the tone and the dish note; the clarify question and the chat reply may talk about parking. */
export const BANNED_PARK_WORDS = ['otopark', 'park', 'car park', 'parking', 'garage'];
/** Claims about how a place feels: banned in the tone and the dish note. */
export const BANNED_AMBIANCE_WORDS = [
  'sakin',
  'romantik',
  'manzara',
  'cocuk dostu',
  'quiet',
  'romantic',
  'view',
  'kid friendly',
  'kid-friendly',
  'cozy',
];
/** A dish note is about the food, never about "here". */
export const BANNED_DISH_NOTE_WORDS = [
  'burada',
  'bu restoran',
  'mekan',
  'here',
  'this restaurant',
  'this place',
];
/** Whole words (not word starts: "yerel" is fine) that make a dish note about a place. */
const DISH_NOTE_PLACE_TOKENS = /^yer(i|ler|leri|de|lerde|e|in)?$/;

/** The 81 provinces of Türkiye (dishes and cuisines are named after them: "Erzurum cağ kebabı"). */
// prettier-ignore
const PROVINCES = [
  'Adana', 'Adıyaman', 'Afyon', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara',
  'Antalya', 'Antep', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt',
  'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Maraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri',
  'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'İzmit', 'Konya', 'Kütahya',
  'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu',
  'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Urfa',
  'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat',
  'Zonguldak',
];

/** Regions, countries and cuisines, in Turkish and in English (langNote asks for English notes). */
// prettier-ignore
const REGIONS = [
  'Girit', 'Kıbrıs', 'Trakya', 'Rumeli', 'Osmanlı', 'Orta', 'Doğu', 'Uzak', 'Uzakdoğu', 'Ortadoğu',
  'Güneydoğu', 'Güney', 'Kuzey', 'Batı', 'Akdeniz', 'Ege', 'Karadeniz', 'Anadolu', 'Balkan',
  'Kafkas', 'Türk', 'Türkiye', 'Arap', 'Fransız', 'İtalyan', 'Yunan', 'Çin', 'Japon', 'Hint',
  'Kore', 'Rus', 'Asya', 'Avrupa', 'Meksika', 'Amerika', 'Lübnan', 'Suriye', 'İran', 'Fars',
  'Irak', 'Mısır', 'Fas', 'Tunus', 'Etiyopya', 'Gürcü', 'Ermeni', 'Azerbaycan', 'Azeri', 'Özbek',
  'Tatar', 'Kırım', 'Boşnak', 'Arnavut', 'Bulgar', 'Macar', 'Alman', 'İngiliz', 'İspanyol',
  'Portekiz', 'İskandinav', 'Tay', 'Tayland', 'Vietnam', 'Endonezya', 'Malezya', 'Hindistan',
  'Japonya', 'Latin', 'Peru', 'Brezilya', 'Arjantin', 'Karayip', 'Hawaii',
  'Turkish', 'Turkey', 'Ottoman', 'Anatolian', 'Anatolia', 'Aegean', 'Mediterranean', 'Black',
  'Sea', 'Middle', 'Near', 'Far', 'East', 'Eastern', 'Middle-Eastern', 'South', 'Southern',
  'Southeast', 'Southeastern', 'North', 'Northern', 'West', 'Western', 'Balkans', 'Caucasian',
  'Caucasus', 'Arab', 'Arabic', 'Arabian', 'Levantine', 'Levant', 'Lebanese', 'Syrian', 'Iraqi',
  'Persian', 'Iranian', 'Egyptian', 'Moroccan', 'Tunisian', 'Ethiopian', 'Georgian', 'Armenian',
  'Azerbaijani', 'Uzbek', 'Cypriot', 'Greek', 'Italian', 'French', 'Spanish', 'Portuguese',
  'German', 'British', 'English', 'Russian', 'Ukrainian', 'Polish', 'Hungarian', 'Bosnian',
  'Albanian', 'Bulgarian', 'Scandinavian', 'Asian', 'Asia', 'European', 'Europe', 'Chinese',
  'Cantonese', 'Sichuan', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Indian', 'Indonesian',
  'Malaysian', 'Filipino', 'Mexican', 'Tex-Mex', 'American', 'Brazilian', 'Peruvian',
  'Argentinian', 'Caribbean', 'Hawaiian', 'Neapolitan', 'Sicilian',
];

/** Capitalised words allowed in the middle of a clarify question / dish note (regions, cities, cuisines). */
const KNOWN_CAPITALISED = [
  // Every city of data/cities.ts, open or not.
  ...CITIES.map((c) => c.name),
  ...PROVINCES,
  // Districts known for a dish ("İnegöl köftesi"); still banned as a district of the active city.
  'İnegöl',
  'Kemalpaşa',
  'Menemen',
  'Tire',
  ...REGIONS,
  // The assistant's own name, used in the chat reply ("Ben Yerim", "Yerim Var asistanı").
  'Yerim',
  'Var',
].map((w) => fold(w));

export type FreeTextContext = {
  /** Names the text must not repeat: result cards, plan places, restaurants and car parks nearby. */
  names?: string[];
  /** District names (default: the active city's): fine in the clarify question, never elsewhere. */
  districts?: string[];
};

const EMOJI = /\p{Extended_Pictographic}/gu;
// A path ("site/page/x") is a link; one slash between two words ("ve/veya", "and/or") is not.
const URL_LIKE = /https?:|:\/\/|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,}|\b[a-z0-9-]+\/[a-z0-9-]+\//iu;
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/** `padded` is ` ${fold(text)} `: a word start, and a word end for an entry ending in a space. */
function hasWord(padded: string, word: string): boolean {
  return padded.includes(` ${word}`);
}

/** Matches a harmless phrase (and the rest of its last word) in a padded folded text. */
const phrasesRe = (phrases: readonly string[]) =>
  new RegExp(` (?:${phrases.join('|')})[a-z]*(?= )`, 'g');
const HARMLESS_RE = phrasesRe(HARMLESS_PHRASES);
const DISH_NOTE_HARMLESS_RE = phrasesRe([...HARMLESS_PHRASES, ...DISH_NOTE_HARMLESS_PHRASES]);
const DISTRICT_DISHES_RE = new RegExp(` (?:${DISTRICT_DISHES.join('|')})[a-z]*(?= ([a-z]*))`, 'g');

/** `padded` without the dishes named after a district, unless a case ending follows. */
function withoutDistrictDishes(padded: string): string {
  return padded.replace(DISTRICT_DISHES_RE, (m, next: string) =>
    CASE_ENDINGS.has(next) ? m : ' ',
  );
}

/** Turkish lower case with the accents kept, split into words like fold(). */
function lowerWords(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The text trimmed when it may be shown, otherwise null. Never throws, never edits the words.
 * See the rules in the product brief: length per zone, one or two sentences, no digits / URLs /
 * @ / #, at most one emoji, no banned claim words, no place names, no capitalised word in the
 * middle of a sentence (except the known regions and cities in the clarify question and dish note).
 */
export function validateFreeText(
  zone: FreeTextZone,
  raw: unknown,
  ctx: FreeTextContext = {},
): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '' || text.length > MAX_CHARS[zone]) return null;
  if (/[\r\n\t]/.test(text)) return null;
  if (/\p{N}/u.test(text)) return null;
  if (/[@#]/.test(text) || URL_LIKE.test(text)) return null;
  if ((text.match(EMOJI) ?? []).length > 1) return null;
  const sentences = text.split(/[.!?…]+/).filter((s) => s.trim() !== '');
  if (sentences.length === 0 || sentences.length > MAX_SENTENCES) return null;

  const districts = ctx.districts ?? activeCity().districts;
  const padded = ` ${fold(text)} `;
  // Accents are only trusted when the text has some: "acıktın" is not "açık", "kas" not "Kaş".
  const accented = TURKISH_LETTERS.test(text);
  const lower = ` ${lowerWords(text)} `;
  const claims = padded.replace(zone === 'dishNote' ? DISH_NOTE_HARMLESS_RE : HARMLESS_RE, ' ');
  const banned = [
    ...BANNED_WORDS,
    ...(zone === 'clarify'
      ? []
      : zone === 'chat'
        ? BANNED_AMBIANCE_WORDS
        : [...BANNED_PARK_WORDS, ...BANNED_AMBIANCE_WORDS]),
    ...(zone === 'dishNote' ? BANNED_DISH_NOTE_WORDS : []),
  ];
  if (banned.some((w) => hasWord(claims, w))) return null;
  if (
    BANNED_TURKISH_WORDS.some((w) =>
      accented ? lower.includes(` ${w}`) : hasWord(claims, fold(w)),
    )
  ) {
    return null;
  }
  if (
    zone === 'dishNote' &&
    claims
      .trim()
      .split(' ')
      .some((w) => DISH_NOTE_PLACE_TOKENS.test(w))
  ) {
    return null;
  }

  // Capitalised words: only at the start of a sentence, or a known region / city (not in the tone).
  const words = text.split(/\s+/);
  let atStart = true;
  for (const word of words) {
    const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    const stem = bare.split(/['’]/)[0] ?? bare;
    // English "I" ("I'm", "I'll") is capitalised wherever it stands.
    const startsUpper =
      stem !== '' && stem !== 'I' && stem.charAt(0) !== stem.charAt(0).toLocaleLowerCase('tr');
    if (startsUpper && !atStart) {
      const f = fold(stem);
      const known =
        zone !== 'tone' &&
        zone !== 'offtopic' &&
        (KNOWN_CAPITALISED.includes(f) ||
          (zone === 'clarify' && districts.some((d) => fold(d) === f)));
      if (!known) return null;
    }
    // A sentence ends at . ! ? … or at an emoji that closes it ("Selam 😄 Ama …").
    atStart = /[.!?…]["')]*$/.test(word) || /^\p{Extended_Pictographic}+$/u.test(word);
  }

  // Names from our data, including lowercase mentions in the middle of a sentence.
  for (const name of ctx.names ?? []) {
    const n = fold(name);
    if (n.length < 4) continue;
    if (padded.includes(` ${n} `)) return null;
  }
  if (zone !== 'clarify') {
    const spaced = withoutDistrictDishes(padded);
    for (const d of districts) {
      const n = fold(d);
      if (!n || !spaced.includes(` ${n} `)) continue;
      // Folding turns "Kaş" into "kas" (muscle): a text with accents must name it as written.
      if (accented && TURKISH_LETTERS.test(d) && !lower.includes(` ${lowerWords(d)} `)) continue;
      return null;
    }
  }
  return text;
}
