// Words and ways of writing for the mega conversation eval (megaCases.ts): the style transforms
// (slang, no Turkish letters, ALL CAPS, typos, voice-to-text, a long ramble), the same five intents
// in other languages, and the fillers around an ask. Pure and seeded: the same Rng gives the same text.
import { MAX_MESSAGE_CHARS } from '@/lib/ai/protocol';
import { asciiFold, type Rng } from './aiBigCases';
import { low, typo } from './convoCases';

/** The five things people ask first; every language and style says them all. */
export const INTENTS = ['dish', 'foodNear', 'parkNear', 'parkDist', 'both'] as const;
export type Intent = (typeof INTENTS)[number];

/** Words of a message with a letter in them. */
const wordsOf = (s: string): string[] => s.split(/\s+/).filter((w) => /\p{L}/u.test(w));
export const wordCount = (s: string): number => wordsOf(s).length;

/** ALL CAPS; a third of the time as a phone without a Turkish keyboard types it (ı and i both become I). */
export function caps(r: Rng, text: string): string {
  return r.chance(0.3) ? asciiFold(text).toUpperCase() : text.toLocaleUpperCase('tr');
}

/**
 * `n` typos in a message: a letter dropped, doubled or swapped in `n` different words of 5+ letters
 * (never the first two letters). Fewer when the message has fewer such words.
 */
export function typos(r: Rng, text: string, n: number): string {
  const words = text.split(' ');
  const at = words.map((w, k) => ({ w, k })).filter(({ w }) => /^\p{L}{5,}$/u.test(w));
  const picked = r.shuffle(at).slice(0, n);
  for (const { w, k } of picked) words[k] = typo(r, w);
  return words.join(' ');
}

const VOICE_PRE = [
  'ya şimdi',
  'şey ya',
  'hocam şimdi',
  'yani ben',
  'bi saniye ya',
  'ya dinle',
  'işte şimdi ben',
  'ya bak şimdi',
];
const VOICE_POST = [
  'bi bakar mısın',
  'olur mu acaba',
  'ne dersin ya',
  'yani öyle işte',
  'bilemedim ya',
  'sen ne diyorsun',
  'bi yardım et',
  'hemen lazım yani',
];
/** What a dictated message looks like: no punctuation, one breath, fillers at both ends. */
export function voice(r: Rng, core: string): string {
  const clean = low(core)
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${r.pick(VOICE_PRE)} ${clean} ${r.pick(VOICE_POST)}`;
}

/** Short fragments of a rambling message (most words are 2-4 letters: the chat input holds 200 characters). */
const RAMBLE = [
  'ya ben şimdi bi',
  'işte sabahtan beri',
  'ne bileyim hani',
  'çok da önemli değil ama',
  'bi de biri dedi ki',
  'tam bilmiyorum yani',
  'neyse ya',
  'bi baktım saat olmuş',
  'yok yani şey',
  'ha bi de',
  'her neyse işte',
  'aslında ben',
  'hem de çok',
  'bak şimdi',
  'öyle bi hal var',
  'ya sonra',
  'ay bilmem ki',
  'de hani',
  'zaten bu ara',
  'ama işte ne diyim',
  'bi şey daha',
  'yav kafam karıştı',
  'o da bi şey',
  'ben de öyle',
  'ee tamam',
  'bu iş böyle',
  'hep aynı şey',
  'bi de şu var',
  'ya hadi',
  'iyi de yani',
];
/**
 * A rambling message with the ask in the middle: about 40 words in the 200 characters the chat
 * accepts. `minWords` is what it reaches at the least (fewer only when the ask itself is long).
 */
export function ramble(r: Rng, ask: string, minWords = 34): string {
  const askWords = wordCount(ask);
  for (let attempt = 0; attempt < 60; attempt++) {
    const frags = r.shuffle(RAMBLE);
    const before: string[] = [];
    const after: string[] = [];
    let words = askWords;
    let chars = ask.length;
    for (const frag of frags) {
      if (words >= minWords + 4) break;
      if (chars + frag.length + 1 > MAX_MESSAGE_CHARS - 6) continue;
      (before.length <= after.length ? before : after).push(frag);
      words += wordCount(frag);
      chars += frag.length + 1;
    }
    if (words >= minWords && before.length >= 2 && after.length >= 2) {
      return [...before, ask, ...after].join(' ');
    }
  }
  return ask;
}

/** The dishes of the languages: how a visitor names them. */
export const DISH_LANG: Record<string, { en: string; de: string; ar: string }> = {
  kebap: { en: 'kebab', de: 'Kebab', ar: 'كباب' },
  pizza: { en: 'pizza', de: 'Pizza', ar: 'بيتزا' },
  hamburger: { en: 'burgers', de: 'Burger', ar: 'برجر' },
  balık: { en: 'fish', de: 'Fisch', ar: 'سمك' },
  köfte: { en: 'meatballs', de: 'Frikadellen', ar: 'كفتة' },
  döner: { en: 'doner', de: 'Döner', ar: 'دونر' },
  lahmacun: { en: 'lahmacun', de: 'Lahmacun', ar: 'لحم بعجين' },
  baklava: { en: 'baklava', de: 'Baklava', ar: 'بقلاوة' },
  'mercimek çorbası': { en: 'lentil soup', de: 'Linsensuppe', ar: 'شوربة عدس' },
  'serpme kahvaltı': { en: 'breakfast', de: 'Frühstück', ar: 'فطور' },
};

/** {D} the district, {X} the dish in that language. */
export const LANG_TEMPLATES: Record<'en' | 'de' | 'ar', Record<Intent, string[]>> = {
  en: {
    dish: [
      'where can I eat {X} in {D}',
      'best {X} in {D}?',
      '{X} near {D} please',
      'i want {X} in {D}, any ideas?',
      'hungry in {D}, looking for {X}',
      'can you find me a place for {X} around {D}',
    ],
    foodNear: [
      'where can I eat {X} near me',
      '{X} nearby please',
      'i am hungry, any {X} around here?',
      'closest place for {X}?',
    ],
    parkNear: [
      'where can I park my car',
      'any car park around here?',
      'parking near me please',
      'i need a parking spot nearby',
    ],
    parkDist: [
      'car park in {D}',
      'where can I park in {D}?',
      'parking near {D} please',
      'i need to leave my car in {D}',
    ],
    both: [
      '{X} in {D} with a car park',
      'i want {X} in {D} and i need parking',
      'restaurant for {X} around {D} with parking please',
      'looking for {X} in {D}, i am coming by car',
    ],
  },
  de: {
    dish: [
      'Wo kann ich in {D} {X} essen?',
      'Ich suche {X} in {D}',
      'Hunger! {X} in {D} bitte',
      'Gibt es in {D} ein gutes Lokal für {X}?',
    ],
    foodNear: [
      'Wo gibt es {X} in meiner Nähe?',
      '{X} in der Nähe bitte',
      'Ich habe Hunger, {X} hier irgendwo?',
      'Wo ist das nächste Lokal für {X}?',
    ],
    parkNear: [
      'Wo kann ich hier parken?',
      'Parkplatz in der Nähe?',
      'Ich brauche einen Parkplatz in meiner Nähe',
      'Gibt es hier irgendwo ein Parkhaus?',
    ],
    parkDist: [
      'Parkplatz in {D}',
      'Wo kann ich in {D} mein Auto abstellen?',
      'Ich suche ein Parkhaus in {D}',
      'Gibt es einen Parkplatz in {D}?',
    ],
    both: [
      '{X} in {D} mit Parkplatz',
      'Ich möchte in {D} {X} essen und brauche einen Parkplatz',
      'Restaurant für {X} in {D}, wir kommen mit dem Auto',
    ],
  },
  ar: {
    dish: [
      'أين أجد {X} في {D}؟',
      'أريد أن آكل {X} في {D}',
      'أبحث عن مطعم {X} في {D}',
      'جائع، أين {X} في {D}؟',
    ],
    foodNear: [
      'أين يوجد {X} بالقرب مني؟',
      'أريد {X} قريب مني',
      'أنا جائع، أبحث عن {X} هنا',
      'أقرب مطعم {X} من فضلك',
    ],
    parkNear: [
      'أين يوجد موقف سيارات قريب؟',
      'أبحث عن موقف لسيارتي بالقرب مني',
      'أين أوقف سيارتي هنا؟',
      'أحتاج موقف سيارات قريب',
    ],
    parkDist: [
      'موقف سيارات في {D}',
      'أين أوقف سيارتي في {D}؟',
      'أبحث عن موقف سيارات في {D}',
      'هل يوجد موقف سيارات في {D}؟',
    ],
    both: [
      'أريد {X} في {D} مع موقف سيارات',
      'مطعم {X} في {D} يحتوي على موقف سيارات',
      'سأذهب بالسيارة إلى {D} وأريد {X} مع موقف',
    ],
  },
};

/** {L} the district as a place ("bornovada"), {D} bare, {LA} with the apostrophe, {X} the dish, {E} its emoji. */
export const STYLE_TEMPLATES: Record<
  'slang' | 'mixed' | 'abbrev' | 'emoji',
  Record<Intent, string[]>
> = {
  slang: {
    dish: [
      'aga {D} tarafında {X} patlatsak',
      'abi {D} civarı {X} varmı lan',
      'lan {X} çekti {L} nerde',
      'reis {L} {X} yiycez nerde',
      'kanka {D} {X} yerleri sallasana',
      '{L} bi {X} bakıyom abi',
    ],
    foodNear: [
      'abi yakında {X} varmı',
      'lan buralarda {X} yok mu',
      'reis yakın {X} sal',
      'kanka {X} çekti yakında ne var',
    ],
    parkNear: [
      'abi yakında park yeri yok mu',
      'lan arabayı nereye çekicem buralarda',
      'reis yakın otopark sal',
      'kanka park yeri bulamıyom yakında',
    ],
    parkDist: [
      'abi {L} araba nereye çekilir',
      'lan {D} otopark var mı yoksa',
      'reis {D} park yeri sal',
      'kanka {L} arabayı koyacak yer',
    ],
    both: [
      'abi {L} {X} yiycez otoparklı yer sal',
      'lan {D} {X} ama park yeri olsun',
      'reis {D} otoparklı {X}',
    ],
  },
  mixed: {
    dish: [
      '{L} best {X} place var mı',
      'bro {L} {X} spot lazım',
      '{D} tarafında good {X} yeri var mı',
      'need {X} {L} asap',
      '{L} nice bir {X} yeri öner',
    ],
    foodNear: [
      'yakınımda good {X} var mı',
      'near me bir {X} lazım',
      'buralarda {X} spot var mı',
      'need {X} yakınlarda',
    ],
    parkNear: [
      'near me bi otopark var mı',
      'yakınımda parking spot lazım',
      'buralarda park yeri var mı please',
      'need otopark asap yakında',
    ],
    parkDist: [
      '{D} civarı parking var mı',
      '{D} otopark please',
      'need park yeri {L}',
      '{D} tarafında parking spot',
    ],
    both: [
      '{D} {X} yiyeceğiz ama parking lazım',
      'need {X} with otopark {L}',
      '{L} {X} yiyeceğiz otoparklı olsun',
      '{D} otoparklı {X} spot',
    ],
  },
  abbrev: {
    dish: [
      'slm {L} bi {X} yeri var mı',
      'nbr {D} {X} nrde',
      '{L} bi {X} lazm',
      'mrb {D} {X} yk bi yer var mı',
    ],
    foodNear: [
      'slm yk bi {X} var mı',
      'yk bi {X} lazım',
      'nbr yk {X} nrde',
      'slm yk {X} yeri var mı',
    ],
    parkNear: [
      'slm yk otopark var mı',
      'yk bi park yeri lazım',
      'nbr yk otopark nrde',
      'slm yk bi otopark',
    ],
    parkDist: [
      'slm {D} otopark var mı',
      '{L} bi park yeri',
      'nbr {D} otopark nrde',
      '{D} otopark vrm',
    ],
    both: [
      'slm {D} bi {X} yeri otoparklı olsun',
      '{L} otoparklı {X} var mı',
      'nbr {D} {X} yiyek otopark lazım',
    ],
  },
  emoji: {
    dish: ['{E} {D}', '{D} {E}', '{E}{E} {D}', '{D}{E}', '{E} {D} 😋'],
    foodNear: ['{E}', '{E}{E}', '{E} 📍', '📍{E}', '{E}?'],
    parkNear: ['🅿️', '🚗🅿️', '🅿️📍', '🅿️?', '📍🅿️'],
    parkDist: ['🅿️ {D}', '🚗 {D}', '{D} 🅿️', '🅿️{D}', '🚗🅿️ {D}'],
    both: ['{E}🅿️ {D}', '{D} {E} 🅿️', '🚗{E} {D}', '{E} + 🅿️ {D}'],
  },
};

/** The plain way to say each intent in Turkish (the base of typo, caps, ascii, voice, rambling). */
export const PLAIN_TEMPLATES: Record<Intent, string[]> = {
  dish: [
    '{L} {X} nerede yenir',
    '{L} iyi bir {X} yeri var mı',
    '{D} {X}',
    '{L} {X} yiyecek yer lazım',
    'canım {X} çekti {L} nereye gideyim',
    '{L} {X} önerin var mı',
  ],
  foodNear: [
    '{X} yakınımda',
    'buralarda {X} var mı',
    'en yakın {X} nerede',
    'yakında bir {X} lazım',
  ],
  parkNear: [
    'yakınımda otopark var mı',
    'en yakın otopark nerede',
    'arabamı bırakacak bir yer arıyorum',
    'buralarda park yeri lazım',
  ],
  parkDist: [
    '{L} otopark',
    '{D} park yeri',
    '{L} arabamı nereye bırakabilirim',
    '{D} civarında otopark arıyorum',
  ],
  both: [
    '{L} {X} yiyeceğiz otoparkı olan bir yer lazım',
    '{D} otoparklı {X} yeri',
    '{D} {X} yiyelim ama otoparkı olsun',
    'otoparklı {X} {D}',
  ],
};
