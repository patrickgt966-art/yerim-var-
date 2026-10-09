import { categoryForQuery, type FoodCategory } from './restaurants';
import { fold, searchPlaces } from './search';

/** An official İzmir district with its centre. */
export type District = { name: string; lat: number; lng: number };

/** What a free-text query means: chit-chat, or a search with its parts split out. */
export type QueryIntent =
  | { kind: 'empty' }
  | { kind: 'greeting' }
  | { kind: 'abuse' }
  | {
      kind: 'search';
      /** Cleaned text (folded) for a name search. */
      text: string;
      cat: FoodCategory | null;
      /** The food word the user typed, as typed after folding, e.g. 'pirzola'. */
      dish: string | null;
      /** Official İzmir district when the place part is exactly one. */
      district: District | null;
      /** Place words left after cleaning (folded), or '' */
      placeQuery: string;
      requireParking: boolean;
      /** User asked for "good/best" - we have no ratings. */
      quality: boolean;
      /** Words we could not place: a candidate for a later AI step. */
      uncertain: boolean;
    };

/** The 30 districts of İzmir. */
export const IZMIR_DISTRICTS: District[] = [
  { name: 'Aliağa', lat: 38.7996, lng: 26.9707 },
  { name: 'Balçova', lat: 38.3889, lng: 27.05 },
  { name: 'Bayındır', lat: 38.2178, lng: 27.6478 },
  { name: 'Bayraklı', lat: 38.4622, lng: 27.1667 },
  { name: 'Bergama', lat: 39.1214, lng: 27.1799 },
  { name: 'Beydağ', lat: 38.0847, lng: 28.2108 },
  { name: 'Bornova', lat: 38.4697, lng: 27.2211 },
  { name: 'Buca', lat: 38.3886, lng: 27.175 },
  { name: 'Çeşme', lat: 38.3236, lng: 26.3031 },
  { name: 'Çiğli', lat: 38.495, lng: 27.07 },
  { name: 'Dikili', lat: 39.0717, lng: 26.8886 },
  { name: 'Foça', lat: 38.6703, lng: 26.7572 },
  { name: 'Gaziemir', lat: 38.3203, lng: 27.1311 },
  { name: 'Güzelbahçe', lat: 38.37, lng: 26.8911 },
  { name: 'Karabağlar', lat: 38.3758, lng: 27.13 },
  { name: 'Karaburun', lat: 38.6386, lng: 26.5122 },
  { name: 'Karşıyaka', lat: 38.4594, lng: 27.1153 },
  { name: 'Kemalpaşa', lat: 38.4269, lng: 27.4172 },
  { name: 'Kınık', lat: 39.0872, lng: 27.3828 },
  { name: 'Kiraz', lat: 38.2306, lng: 28.2047 },
  { name: 'Konak', lat: 38.4189, lng: 27.1287 },
  { name: 'Menderes', lat: 38.2552, lng: 27.1381 },
  { name: 'Menemen', lat: 38.6075, lng: 27.0697 },
  { name: 'Narlıdere', lat: 38.395, lng: 26.997 },
  { name: 'Ödemiş', lat: 38.2289, lng: 27.97 },
  { name: 'Seferihisar', lat: 38.1972, lng: 26.8383 },
  { name: 'Selçuk', lat: 37.9508, lng: 27.3681 },
  { name: 'Tire', lat: 38.0886, lng: 27.735 },
  { name: 'Torbalı', lat: 38.15, lng: 27.3616 },
  { name: 'Urla', lat: 38.3228, lng: 26.7647 },
];

const words = (s: string) => new Set(s.split(' '));

const GREETING = words(
  'selam selamlar merhaba mrb slm hey gunaydin naber nasilsin nasilsiniz iyiyim tesekkurler tesekkur ederim sagol sag ol eyvallah iyi aksamlar gunler geceler',
);
// Whole tokens only: never matched as a substring.
const ABUSE = words(
  'aq amk amq aqq sikim sikerim siktir sik orospu pic yarrak amina anani ananin anan got gotveren salak aptal gerizekali mal oc lan',
);
const FILLER = words(
  'bana beni bize ben biz bul bulur bulsana bulurmusun goster oner ara istiyorum istiyoruz isterim yemek yiyelim yiyecek yiyecegim bir bi yer yeri yerler mekan nerede nerde var mi mu misin musun ne diyorsun dersin hocam abi abla kanka lutfen acaba simdi hemen yakin yakinimda yakinda yakindaki civar civarinda civarda cevresinde tarafinda tarafta lazim cok ve ile icin vay cevap ver olsun olan bugun aksam ogle sabah gidelim gidecegim',
);
// Case suffixes left as their own token by apostrophes ("Alsancak'ta").
const SUFFIX_TOKENS = words('a e ya ye da de ta te dan den tan ten nda nde ndan nden');
const QUALITY = words('saglam guzel lezzetli meshur unlu kaliteli harika efsane en iyi');
const PARKING = words('park parki parkli parkyeri');
const NEGATION = words('olmayan olmasin secme istemiyorum istemem haric yok');

/** Place-name suffixes, longest first. */
const PLACE_SUFFIXES = [
  'larda',
  'lerde',
  'lari',
  'leri',
  'lar',
  'ler',
  'dan',
  'den',
  'tan',
  'ten',
  'nda',
  'nde',
  'da',
  'de',
  'ta',
  'te',
  'ya',
  'ye',
  'yi',
  'yu',
  'si',
  'su',
  'ci',
  'cu',
];

const isParking = (t: string) => t.startsWith('otopark') || PARKING.has(t);

/** The top search hit has a name word starting with the token. */
function namesToken(token: string): boolean {
  return searchPlaces(token, 1).some((h) =>
    fold(h.name)
      .split(' ')
      .some((w) => w.startsWith(token)),
  );
}

/** "mendereste" -> "menderes" when the stem names a place and the word does not. */
function placeStem(token: string): string {
  if (namesToken(token)) return token;
  for (const suf of PLACE_SUFFIXES) {
    if (!token.endsWith(suf) || token.length - suf.length < 3) continue;
    const stem = token.slice(0, token.length - suf.length);
    if (namesToken(stem)) return stem;
  }
  return token;
}

/** Split a free-text query into chit-chat, or place / dish / filters. */
export function parseQuery(raw: string): QueryIntent {
  const all = fold(raw).split(' ').filter(Boolean);
  if (all.length === 0) return { kind: 'empty' };

  // Greeting / abuse: nothing left once the chit-chat words are dropped.
  let rest = all.filter(
    (t) => !GREETING.has(t) && !ABUSE.has(t) && !FILLER.has(t) && !SUFFIX_TOKENS.has(t),
  );
  if (rest.length === 0) {
    if (all.some((t) => ABUSE.has(t))) return { kind: 'abuse' };
    if (all.some((t) => GREETING.has(t))) return { kind: 'greeting' };
    return { kind: 'empty' };
  }

  // 'iyi' is a greeting word, so it is checked on the full token list.
  const quality = all.some((t) => QUALITY.has(t));
  rest = rest.filter((t) => !QUALITY.has(t));

  // Category: a two-word phrase first, then a single word.
  let cat: FoodCategory | null = null;
  let dish: string | null = null;
  for (const len of [2, 1]) {
    for (let i = 0; i + len <= rest.length && !cat; i++) {
      const phrase = rest.slice(i, i + len).join(' ');
      const c = categoryForQuery(phrase);
      if (!c) continue;
      cat = c;
      dish = phrase;
      rest = [...rest.slice(0, i), ...rest.slice(i + len)];
    }
  }

  // A car-park word only narrows a food search; alone it is the app default.
  const hasPark = rest.some(isParking);
  rest = rest.filter((t) => !isParking(t) && !NEGATION.has(t));
  const requireParking = hasPark && cat !== null;

  const placeQuery = rest.map(placeStem).join(' ');
  if (placeQuery === '' && !cat && !hasPark) return { kind: 'empty' };

  const district = IZMIR_DISTRICTS.find((d) => fold(d.name) === placeQuery) ?? null;
  const uncertain = placeQuery !== '' && !district && searchPlaces(placeQuery, 1).length === 0;
  const text = cat ? [placeQuery, dish].filter(Boolean).join(' ') : placeQuery;

  return { kind: 'search', text, cat, dish, district, placeQuery, requireParking, quality, uncertain };
}
