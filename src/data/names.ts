/**
 * Display-name cleaner for place names loaded from bundled data (OSM, Overture,
 * İzelman): repairs mojibake, drops ad text and emoji, fixes casing and a
 * fixed table of ASCII-spelled Turkish words. Search matching uses `fold`, so
 * cleaning never affects what a query finds.
 */

// Windows-1252 characters for bytes 0x80..0x9F.
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

function fixMojibake(s: string): string {
  if (!/Ã|Ä|Å|â€/.test(s)) return s;
  if (typeof TextDecoder === 'undefined') return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0xff) {
      bytes[i] = code;
      continue;
    }
    const k = CP1252.indexOf(s.charAt(i));
    if (k < 0) return s;
    bytes[i] = 0x80 + k;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

const TR_WORDS: Record<string, string> = {
  kemeralti: 'kemeraltı',
  karsiyaka: 'karşıyaka',
  cesme: 'çeşme',
  alacati: 'alaçatı',
  bostanli: 'bostanlı',
  balcova: 'balçova',
  narlidere: 'narlıdere',
  cigli: 'çiğli',
  guzelbahce: 'güzelbahçe',
  bayrakli: 'bayraklı',
  izmir: 'izmir',
  karabaglar: 'karabağlar',
  torbali: 'torbalı',
  odemis: 'ödemiş',
  kemalpasa: 'kemalpaşa',
  aliaga: 'aliağa',
  foca: 'foça',
  kinik: 'kınık',
  beydag: 'beydağ',
  bayindir: 'bayındır',
  selcuk: 'selçuk',
  goztepe: 'göztepe',
  sirinyer: 'şirinyer',
  uckuyular: 'üçkuyular',
  gumuldur: 'gümüldür',
  ozdere: 'özdere',
  mavisehir: 'mavişehir',
  balik: 'balık',
  balikci: 'balıkçı',
  kofte: 'köfte',
  kofteci: 'köfteci',
  pilavci: 'pilavcı',
  corba: 'çorba',
  corbaci: 'çorbacı',
  iskembe: 'işkembe',
  ocakbasi: 'ocakbaşı',
  kahvalti: 'kahvaltı',
  borek: 'börek',
  borekci: 'börekçi',
  doner: 'döner',
  donerci: 'dönerci',
  tatlici: 'tatlıcı',
  sutlu: 'sütlü',
  cay: 'çay',
  bahcesi: 'bahçesi',
  ustanin: 'ustanın',
  duragi: 'durağı',
  sofrasi: 'sofrası',
  mutfagi: 'mutfağı',
  carsi: 'çarşı',
};

const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;
const VOWEL = /[aeıioöuüAEIİOÖUÜ]/;

const lower = (s: string) => s.toLocaleLowerCase('tr');
const upper = (s: string) => s.toLocaleUpperCase('tr');
const capitalize = (s: string, ascii = false) =>
  s.replace(/\p{L}/u, (c) => (ascii ? c.toUpperCase() : upper(c)));

/** `ascii`: an all-caps name typed without Turkish letters, so its I is a plain i. */
function titleCase(name: string, allCaps: boolean, ascii: boolean): string {
  return name
    .split(' ')
    .map((token, i) =>
      token
        .split('-')
        .map((part) => {
          if (/\d/.test(part)) return part;
          const letters = part.replace(/[^\p{L}]/gu, '');
          if (allCaps && letters.length <= 3 && letters.length > 0 && !VOWEL.test(letters)) {
            return part;
          }
          const l = ascii ? part.toLowerCase() : lower(part);
          if (i > 0 && (l === 've' || l === 'ile')) return l;
          return capitalize(l, ascii);
        })
        .join('-'),
    )
    .join(' ');
}

function fixCasing(s: string): string {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 4) return s;
  const isUpper = upper(s) === s;
  const isLower = lower(s) === s;
  if (!isUpper && !isLower) return s;
  return titleCase(s, isUpper, isUpper && !TURKISH_LETTER.test(s));
}

function turkishWord(word: string): string {
  if (TURKISH_LETTER.test(word)) return word;
  const target = TR_WORDS[word.toLowerCase()];
  if (!target) return word;
  const isUpper = word.length > 1 && word === word.toUpperCase();
  const isLower = word === word.toLowerCase();
  const isTitle =
    word.charAt(0) === word.charAt(0).toUpperCase() &&
    word.slice(1) === word.slice(1).toLowerCase();
  if (target === 'izmir') return isUpper ? 'İZMİR' : 'İzmir';
  if (isUpper) return upper(target);
  if (isLower) return target;
  if (isTitle) return capitalize(target);
  return word;
}

function fixTurkishLetters(s: string): string {
  return s.replace(/[\p{L}\p{N}]+/gu, turkishWord);
}

/** Districts and areas that are written before a redundant "İzmir" ("Bergama izmir"). */
const AREAS = new Set([
  'kemeralti',
  'karsiyaka',
  'cesme',
  'alacati',
  'bostanli',
  'balcova',
  'narlidere',
  'cigli',
  'guzelbahce',
  'bayrakli',
  'karabaglar',
  'torbali',
  'odemis',
  'kemalpasa',
  'aliaga',
  'foca',
  'kinik',
  'beydag',
  'bayindir',
  'selcuk',
  'goztepe',
  'sirinyer',
  'mavisehir',
  'alsancak',
  'bornova',
  'buca',
  'konak',
  'urla',
  'menderes',
  'bergama',
  'tire',
  'dikili',
  'menemen',
  'seferihisar',
  'karaburun',
  'kiraz',
  'gaziemir',
  'inciralti',
  'hatay',
  'guzelyali',
]);

const asciiFold = (w: string) =>
  w
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[ch] ?? ch);

/**
 * Drops a trailing "İzmir" only where it is clearly an address tail: after a
 * comma or dash ("Pişiricisi, Bostanlı-İzmir") or after a district ("Bergama
 * izmir"). "Sarraf İzmir" or "Look Mey Izmir" keep it: it is part of the brand.
 */
function stripCitySuffix(s: string): string {
  const m = /^(.*?)([,\s-]+)(İzmir|Izmir|IZMIR|izmir)\s*$/u.exec(s);
  if (!m || m[1]!.trim() === '') return s;
  const before = m[1]!;
  const lastWord = before.split(/[\s,-]+/).pop() ?? '';
  return /[,-]/.test(m[2]!) || AREAS.has(asciiFold(lastWord)) ? before : s;
}

export function cleanName(raw: string): string {
  let s = fixMojibake(raw);

  if (s.includes('|')) s = s.split('|').find((p) => p.trim() !== '') ?? '';

  s = s.replace(/\p{Extended_Pictographic}|[♀♂︀-️]/gu, '');
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*(\{[^{}]*\}|\[[^[\]]*\])\s*$/, '');
  } while (s !== prev);
  s = s.replace(/_/g, ' ');

  s = stripCitySuffix(s);

  s = s
    .replace(/\s+/g, ' ')
    .trim()
    // A trailing "." belongs to the name ("Coffee & Co."); only stray separators go.
    .replace(/^[-,.]+|[-,]+$/g, '')
    .trim();

  return fixTurkishLetters(fixCasing(s));
}
