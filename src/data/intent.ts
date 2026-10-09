import { categoryForQuery, type FoodCategory } from './restaurants';
import { fold, searchPlaces } from './search';

/** An official İzmir district with its centre. */
export type District = { name: string; lat: number; lng: number };

/** What a free-text query means: chit-chat, or a search with its parts split out. */
export type QueryIntent =
  | { kind: 'empty' }
  | { kind: 'greeting' }
  | { kind: 'abuse' }
  | { kind: 'offtopic' }
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
      /** The user wants food: a category, or a generic food word like "yemek". */
      food: boolean;
      /** The user means "around me" (yakınımda, burada, ...). */
      nearMe: boolean;
      /** The text contains a car-park word. */
      mentionsParking: boolean;
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
  'selam selamlar merhaba mrb slm hey gunaydin naber nasilsin nasilsiniz iyiyim tesekkurler tesekkur ederim sagol sag ol eyvallah aksamlar gunler geceler',
);
// Whole tokens only: never matched as a substring.
const ABUSE = words(
  'aq amk amq aqq sikim sikerim siktir sik orospu pic yarrak amina anani ananin anan got gotveren salak aptal gerizekali mal oc lan',
);
// Words used to address the bot; always filler.
const ADDRESS = words(
  'dostum dost kardesim kardes kanka kanki abi abla hocam hoca reis birader moruk canim guzelim usta kral kralice baba aga',
);
const FILLER = words(
  'bana beni bize ben biz bul bulur bulsana bulurmusun goster oner ara istiyorum istiyoruz isterim yemek yiyelim yiyecek yiyecegim bir bi yer yeri yerler mekan nerede nerde var mi mu misin musun ne diyorsun dersin lutfen acaba simdi peki hemen yakin yakinimda yakinda yakindaki civar civarinda civarda cevresinde tarafinda tarafta lazim cok ve ile icin vay cevap ver olsun olan bugun aksam ogle sabah gidelim gidecegim yapacak yapalim yapabilecegim yiyebilirim yiyebilecegim yiyebilecegimiz oturabilecegim oturalim gidebilecegim gidebilirim gidilecek oncesi sonrasi mac yakininda yakinlarinda yaninda karsisinda civarindaki etrafinda civari burada buraya burda etrafimda cevremde',
);
// Words that mean "food in general"; they stay filler for place purposes.
const FOOD_WORDS = words(
  'yemek yiyelim yiyecek yiyecegim yiyebilirim yiyebilecegim restoran karnim acim ac',
);
// Case suffixes left as their own token by apostrophes ("Alsancak'ta").
const SUFFIX_TOKENS = words('a e ya ye da de ta te dan den tan ten nda nde ndan nden');
const QUALITY = words('saglam guzel lezzetli meshur unlu kaliteli harika efsane en iyi');
const PARKING = words('park parki parkli parkyeri');
const NEAR_ME = words(
  'yakinimda yakinda yakindaki yakin etrafimda cevremde',
);
const NEGATION = words('olmayan olmasin secme istemiyorum istemem haric yok');
// Subjects that are not about parking or food, e.g. football or weather.
const TOPIC = words(
  'mac maci gol skor derbi galatasaray gs fenerbahce fb besiktas bjk trabzonspor altay takim hava yagmur haber secim dolar borsa',
);
const QUESTION = words('nasil neden niye kim kimin hangi kac');
// Past / progressive verb endings (folded).
const VERB_SUFFIXES = ['di', 'du', 'ti', 'tu', 'mis', 'mus', 'yor', 'iyor', 'uyor'];
const hasVerbSuffix = (t: string) => VERB_SUFFIXES.some((s) => t.endsWith(s));
// 'iyi' is a greeting only before these ("iyi akşamlar"); otherwise it is a quality word.
const IYI_GREETING_NEXT = words('aksamlar gunler geceler');
const STADIUM = words('stad stada stadi stadyum stadyuma stadyumu stadyumun');

/** Place-name suffixes, longest first. */
const PLACE_SUFFIXES = [
  'ndaki',
  'ndeki',
  'larda',
  'lerde',
  'daki',
  'deki',
  'taki',
  'teki',
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
      .some(
        (w) =>
          w === token ||
          (w.startsWith(token) && token.length >= 5 && token.length >= 0.7 * w.length),
      ),
  );
}

const nameWords = (name: string) => fold(name).split(' ');

/** The top search hit has a name word equal to the token. */
function equalsNameWord(token: string): boolean {
  return searchPlaces(token, 1).some((h) => nameWords(h.name).some((w) => w === token));
}

/** Suffixes from shortest to longest, for stem detection. */
const PLACE_SUFFIXES_SHORT_FIRST = [...PLACE_SUFFIXES].sort((a, b) => a.length - b.length);

/** "mendereste" -> "menderes" when the stem names a place and the word does not. */
function placeStem(token: string): string {
  if (namesToken(token)) return token;
  let firstPrefix: string | null = null;
  for (const suf of PLACE_SUFFIXES_SHORT_FIRST) {
    if (!token.endsWith(suf) || token.length - suf.length < 3) continue;
    const stem = token.slice(0, token.length - suf.length);
    if (equalsNameWord(stem)) return stem;
    if (firstPrefix === null && namesToken(stem)) firstPrefix = stem;
  }
  return firstPrefix ?? token;
}

/** True when a and b differ by at most one insertion, deletion, substitution or adjacent swap. */
function withinOneEdit(a: string, b: string): boolean {
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

/** Folded district name within one typo of the word, or null. */
function nearDistrict(word: string): string | null {
  for (const d of IZMIR_DISTRICTS) {
    const name = fold(d.name);
    if (withinOneEdit(word, name)) return name;
  }
  return null;
}

/** "bornavadaki" -> "bornova": typo-tolerant district match on the token or its stems. */
function fixDistrictTypo(original: string, token: string): string {
  if (token.length < 5) return token;
  if (IZMIR_DISTRICTS.some((d) => fold(d.name) === token) || namesToken(token)) return token;
  const direct = nearDistrict(token);
  if (direct) return direct;
  for (const suf of PLACE_SUFFIXES_SHORT_FIRST) {
    if (!original.endsWith(suf) || original.length - suf.length < 5) continue;
    const near = nearDistrict(original.slice(0, original.length - suf.length));
    if (near) return near;
  }
  return token;
}

/** Place tokens: kept as typed when one hit's name words cover them all, else stemmed. */
function placeTokens(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens;
  const hit = searchPlaces(tokens.join(' '), 1)[0];
  if (hit) {
    const nw = nameWords(hit.name);
    if (tokens.every((t) => nw.some((w) => w.startsWith(t)))) return tokens;
  }
  return tokens.map((t) => fixDistrictTypo(t, placeStem(t)));
}

/** Short text that can be a place name: no question, no verb, at most 4 words. */
export function looksLikePlace(text: string): boolean {
  const tokens = fold(text).split(' ').filter(Boolean);
  if (tokens.length > 4) return false;
  return !tokens.some((t) => QUESTION.has(t) || (hasVerbSuffix(t) && !isPlaceToken(t)));
}

/** The token is an İzmir district (also with a typo or case suffix) or starts a place name. */
function isPlaceToken(tok: string): boolean {
  if (namesToken(tok)) return true;
  const fixed = fixDistrictTypo(tok, placeStem(tok));
  return IZMIR_DISTRICTS.some((d) => fold(d.name) === fixed);
}

/** Split a free-text query into chit-chat, or place / dish / filters. */
export function parseQuery(raw: string): QueryIntent {
  const all = fold(raw).split(' ').filter(Boolean);
  if (all.length === 0) return { kind: 'empty' };

  // Greeting / abuse: nothing left once the chit-chat words are dropped.
  const greetIyi = (i: number) => all[i] === 'iyi' && IYI_GREETING_NEXT.has(all[i + 1] ?? '');
  const hasGreeting = all.some((t, i) => GREETING.has(t) || greetIyi(i));
  let rest = all.filter(
    (t, i) =>
      !GREETING.has(t) &&
      !greetIyi(i) &&
      !ABUSE.has(t) &&
      !FILLER.has(t) &&
      !ADDRESS.has(t) &&
      !SUFFIX_TOKENS.has(t),
  );
  // Generic food words ("yemek", "acım") count even though they are filler.
  const foodWord = all.some((t) => FOOD_WORDS.has(t));
  if (rest.length === 0) {
    if (all.some((t) => ABUSE.has(t))) return { kind: 'abuse' };
    if (hasGreeting) return { kind: 'greeting' };
    if (!foodWord) {
      return all.some((t) => TOPIC.has(t)) ? { kind: 'offtopic' } : { kind: 'empty' };
    }
  }

  // A greeting with up to two leftover words that mean nothing searchable is still a greeting.
  if (
    rest.length > 0 &&
    rest.length <= 2 &&
    !foodWord &&
    hasGreeting &&
    !all.some((t) => ABUSE.has(t)) &&
    !categoryForQuery(rest.join(' ')) &&
    !rest.some(
      (t) =>
        categoryForQuery(t) !== null || FOOD_WORDS.has(t) || isParking(t) || isPlaceToken(t),
    )
  ) {
    return { kind: 'greeting' };
  }

  // 'iyi' counts as quality unless it opens a greeting like "iyi akşamlar".
  const nearMe = all.some((t) => NEAR_ME.has(t));
  const quality = all.some((t, i) => QUALITY.has(t) && !greetIyi(i));
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

  // A food word (or the dish phrase) is never a place.
  rest = rest.filter((t) => categoryForQuery(t) === null);

  // A car-park word only narrows a food search; alone it is the app default.
  const hasPark = rest.some(isParking);
  rest = rest.filter((t) => !isParking(t) && !NEGATION.has(t));
  const requireParking = hasPark && cat !== null;

  const food = cat !== null || foodWord;

  rest = rest.map((t) => (STADIUM.has(t) ? 'stadyum' : t));

  // Off-topic: nothing about food, parking or a place, but a topic or a question about the past.
  if (
    !cat &&
    !food &&
    !hasPark &&
    !all.some((t) => IZMIR_DISTRICTS.some((d) => fold(d.name) === t)) &&
    !rest.some(
      (t) =>
        t.length >= 3 && !TOPIC.has(t) && !QUESTION.has(t) && !hasVerbSuffix(t) && isPlaceToken(t),
    ) &&
    (all.some((t) => TOPIC.has(t)) ||
      (all.some((t) => QUESTION.has(t)) && all.some(hasVerbSuffix)))
  ) {
    return { kind: 'offtopic' };
  }

  const placeQuery = placeTokens(rest).join(' ');
  if (placeQuery === '' && !cat && !hasPark && !food) return { kind: 'empty' };

  const district = IZMIR_DISTRICTS.find((d) => fold(d.name) === placeQuery) ?? null;
  const uncertain = placeQuery !== '' && !district && searchPlaces(placeQuery, 1).length === 0;
  const text = cat ? [placeQuery, dish].filter(Boolean).join(' ') : placeQuery;

  // Show the dish as typed (Turkish letters) when the raw words line up with the folded ones.
  let shownDish = dish;
  if (dish) {
    const rawWords = raw
      .toLocaleLowerCase('tr')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(Boolean);
    if (rawWords.length === all.length) {
      const dishTokens = dish.split(' ');
      const at = all.findIndex((_, i) => all.slice(i, i + dishTokens.length).join(' ') === dish);
      if (at >= 0) shownDish = rawWords.slice(at, at + dishTokens.length).join(' ');
    }
  }

  return {
    kind: 'search',
    text,
    cat,
    dish: shownDish,
    district,
    placeQuery,
    requireParking,
    quality,
    uncertain,
    food,
    nearMe,
    mentionsParking: hasPark,
  };
}

/**
 * The words of `raw` that make up the folded `placeQuery`, as typed (Turkish letters, lower case).
 * Falls back to the trimmed raw text when the raw words do not line up with the folded ones.
 */
export function typedPlaceText(raw: string, placeQuery: string): string {
  const fallback = raw.trim();
  const all = fold(raw).split(' ').filter(Boolean);
  const rawWords = raw
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  const wanted = placeQuery.split(' ').filter(Boolean);
  if (wanted.length === 0 || rawWords.length !== all.length) return fallback;
  const kept = rawWords.filter((_, i) => wanted.includes(all[i]!));
  return kept.length === wanted.length ? kept.join(' ') : fallback;
}

/** Text the local place search should use for a query. */
export function localPart(q: string): string {
  const it = parseQuery(q);
  if (it.kind !== 'search') return '';
  return it.district?.name ?? (it.cat || it.food ? it.placeQuery : it.placeQuery || q);
}
