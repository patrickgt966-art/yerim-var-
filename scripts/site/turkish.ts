// Turkish text helpers for the static SEO pages (scripts/build-site.ts): URL slugs and the
// locative ending ("Alsancak'ta"). Pure functions, no app imports.

/** Lower case, Turkish letters folded to ASCII, words joined with "-": "Kadıköy" -> "kadikoy". */
export function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const BACK = 'aıou';
const FRONT = 'eiöü';
const VOWELS = BACK + FRONT;
/** A word ending in one of these takes "t" (Alsancak'ta), any other consonant "d" (Bornova'da). */
const VOICELESS = 'çfhkpsşt';

/**
 * Place names that end in a possessive ("-ı/-i/-u/-ü": Konyaaltı = the foot of Konya...) take the
 * pronominal "n": Konyaaltı'nda, Kaleiçi'nde. The ending cannot be told from the spelling, so they
 * are listed (folded). Names that merely end in a vowel (Bostanlı, Çıralı) take the plain ending.
 */
const POSSESSIVE_NAMES = new Set([
  'beyoglu',
  'kaleici',
  'konyaalti',
  'kemeralti',
  'inciralti',
  'camdibi',
  'sahilevleri',
  'setbasi',
  'sogutozu',
  'manavkuyu',
  'eminonu',
]);

/** The name with its locative ending: "Alsancak'ta", "Kadıköy'de", "Bostanlı'da", "Ümitköy'de". */
export function locative(name: string): string {
  const lower = name.toLocaleLowerCase('tr');
  let lastVowel = '';
  for (const ch of lower) if (VOWELS.includes(ch)) lastVowel = ch;
  const back = lastVowel === '' ? false : BACK.includes(lastVowel);
  const last = lower.slice(-1);
  if (POSSESSIVE_NAMES.has(slugify(name))) return `${name}'n${back ? 'da' : 'de'}`;
  const endsInVowel = VOWELS.includes(last);
  const d = !endsInVowel && VOICELESS.includes(last) ? 't' : 'd';
  return `${name}'${d}${back ? 'a' : 'e'}`;
}
