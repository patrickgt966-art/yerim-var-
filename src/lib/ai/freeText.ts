// The only places the model may write its own words. Everything else it sends is a code or an
// index. A text that fails here is dropped and the app's template is used instead.
import { fold } from './protocol';

/** Z1 = tone (pick / plan / understand), Z2 = clarify question, Z3 = note about a dish. */
export type FreeTextZone = 'tone' | 'clarify' | 'dishNote' | 'offtopic';

/** 'offtopic' is the chit-chat redirect of /understand: tone rules, a little more room. */
const MAX_CHARS: Record<FreeTextZone, number> = {
  tone: 90,
  clarify: 80,
  dishNote: 140,
  offtopic: 120,
};
const MAX_SENTENCES = 2;

/**
 * Folded words that make a sentence a claim about a place, a price, a time or a quality.
 * Matched at the start of a word ("acik" also catches "açıkça"); entries with a space match
 * the phrase. Park words are only banned outside the clarify question.
 */
export const BANNED_WORDS = [
  'ucretsiz',
  'ucuz',
  'pahali',
  'fiyat',
  'indirim',
  'kampanya',
  'lira',
  'tl',
  'acik',
  'kapali',
  'saat',
  'bos',
  'dolu',
  'yer var',
  'dakika',
  'dk',
  'metre',
  'km',
  'yakin',
  'uzak',
  'en iyi',
  'en lezzetli',
  'lezzetli',
  'meshur',
  'unlu',
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
];
/** Banned in the tone and the dish note; the clarify question may ask about parking. */
export const BANNED_PARK_WORDS = ['otopark', 'park'];
/** Claims about how a place feels: banned in the tone and the dish note. */
export const BANNED_AMBIANCE_WORDS = ['sakin', 'romantik', 'manzara', 'cocuk dostu'];
/** A dish note is about the food, never about "here". */
export const BANNED_DISH_NOTE_WORDS = ['burada', 'bu restoran', 'mekan'];
/** Whole words (not word starts: "yerel" is fine) that make a dish note about a place. */
const DISH_NOTE_PLACE_TOKENS = /^yer(i|ler|leri|de|lerde|e|in)?$/;

/** Capitalised words allowed in the middle of a clarify question / dish note (regions, cities, cuisines). */
const KNOWN_CAPITALISED = [
  'İzmir',
  'İstanbul',
  'Ankara',
  'Bursa',
  'Adana',
  'Antep',
  'Gaziantep',
  'Urfa',
  'Hatay',
  'Mersin',
  'Konya',
  'Trabzon',
  'Girit',
  'Orta',
  'Doğu',
  'Ortadoğu',
  'Akdeniz',
  'Ege',
  'Karadeniz',
  'Anadolu',
  'Balkan',
  'Kafkas',
  'Türk',
  'Türkiye',
  'Arap',
  'Fransız',
  'İtalyan',
  'Yunan',
  'Çin',
  'Japon',
  'Hint',
  'Kore',
  'Rus',
  'Asya',
  'Avrupa',
  'Meksika',
  'Amerika',
].map((w) => fold(w));

export type FreeTextContext = {
  /** Names the text must not repeat: result cards, plan places, restaurants and car parks nearby. */
  names?: string[];
  /** İzmir district names: fine in the clarify question, never elsewhere. */
  districts?: string[];
};

const EMOJI = /\p{Extended_Pictographic}/gu;
const URL_LIKE =
  /https?:|:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|tr|io|app|me|co|info|biz)\b|\b[a-z0-9-]+\/[a-z0-9]/i;

function hasWord(padded: string, word: string): boolean {
  return padded.includes(` ${word}`);
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
  if (/\d/.test(text)) return null;
  if (/[@#]/.test(text) || URL_LIKE.test(text)) return null;
  if ((text.match(EMOJI) ?? []).length > 1) return null;
  const sentences = text.split(/[.!?…]+/).filter((s) => s.trim() !== '');
  if (sentences.length === 0 || sentences.length > MAX_SENTENCES) return null;

  const padded = ` ${fold(text)}`;
  const banned = [
    ...BANNED_WORDS,
    ...(zone === 'clarify' ? [] : [...BANNED_PARK_WORDS, ...BANNED_AMBIANCE_WORDS]),
    ...(zone === 'dishNote' ? BANNED_DISH_NOTE_WORDS : []),
  ];
  if (banned.some((w) => hasWord(padded, w))) return null;
  if (
    zone === 'dishNote' &&
    padded
      .trim()
      .split(' ')
      .some((w) => DISH_NOTE_PLACE_TOKENS.test(w))
  ) {
    return null;
  }

  // Capitalised words: only at the start of a sentence, or a known region / city (not in the tone).
  const words = text.split(/\s+/);
  const firstSingles = new Set<string>();
  let atStart = true;
  for (const word of words) {
    const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    const stem = bare.split(/['’]/)[0] ?? bare;
    const startsUpper = stem !== '' && stem.charAt(0) !== stem.charAt(0).toLocaleLowerCase('tr');
    if (atStart && stem !== '') firstSingles.add(fold(stem));
    if (startsUpper && !atStart) {
      const f = fold(stem);
      const known =
        zone !== 'tone' &&
        zone !== 'offtopic' &&
        (KNOWN_CAPITALISED.includes(f) ||
          (zone === 'clarify' && (ctx.districts ?? []).some((d) => fold(d) === f)));
      if (!known) return null;
    }
    // A sentence ends at . ! ? … or at an emoji that closes it ("Selam 😄 Ama …").
    atStart = /[.!?…]["')]*$/.test(word) || /^\p{Extended_Pictographic}+$/u.test(word);
  }

  // Names from our data. A multi-word name is matched anywhere; a one-word name only as the
  // first word of a sentence (any other capitalised word was rejected above).
  const spaced = `${padded} `;
  for (const name of ctx.names ?? []) {
    const n = fold(name);
    if (n.length < 4) continue;
    if (n.includes(' ') ? spaced.includes(` ${n} `) : firstSingles.has(n)) return null;
  }
  if (zone !== 'clarify') {
    for (const d of ctx.districts ?? []) {
      const n = fold(d);
      if (n && spaced.includes(` ${n} `)) return null;
    }
  }
  return text;
}
