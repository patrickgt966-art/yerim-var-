import { categoryForQuery, headStems, isFoodWord, type FoodCategory } from './restaurants';
import { dishProfile, hasExactDish, leadDishProfile } from './dishes';
import {
  CITY_STYLES,
  isTrailingModifier,
  LEADING_GENERIC,
  MODIFIERS,
  orderSpan,
  respellAlias,
} from './foodLexicon';
import type { PlanWhen, Wish } from '../lib/ai/protocol';
import { activeCity, type District } from './cities';
import { fold, searchPlaces } from './search';

export { IZMIR_DISTRICTS } from './cities';
export type { District };

/** The active city's districts with their centres. */
const districtsOfCity = (): readonly District[] => activeCity().districtCenters;
/** The folded token is the name of a district of the active city. */
const isDistrictName = (t: string) => districtsOfCity().some((d) => fold(d.name) === t);

/** What a free-text query means: chit-chat, or a search with its parts split out. */
export type QueryIntent =
  | { kind: 'empty' }
  /** Too short, repeated letters or no vowel ("oo", "aaa", "xd"): never searched, never sent to the AI. */
  | { kind: 'gibberish' }
  | { kind: 'greeting' }
  | { kind: 'abuse' }
  | { kind: 'offtopic' }
  | {
      kind: 'search';
      /** Cleaned text (folded) for a name search. */
      text: string;
      cat: FoodCategory | null;
      /** A category the user ruled out ("kebap olmasın"); parseQuery always sets it, null when none. */
      notCat?: FoodCategory | null;
      /** The food word the user typed, as typed after folding, e.g. 'pirzola'. */
      dish: string | null;
      /** AI only: short words that appear in the names of places serving an unknown dish. */
      dishServes?: string[] | null;
      /** Official district of the active city named by any place word (that word is not in placeQuery). */
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

const words = (s: string) => new Set(s.split(' '));

const GREETING = words(
  'selam selamlar merhaba merhabalar mrb slm hey gunaydin naber nbr nasilsin nasilsiniz iyiyim tesekkurler tesekkur ederim sagol sag ol eyvallah aksamlar gunler geceler selamun selamin aleykum selamunaleykum selaminaleykum aleykumselam hello helo hi hii heyy hola',
);
// Short greetings ("sa", "as" for "selamün aleyküm"): only when they are most of the text.
const SOLO_GREETING = words('sa as');
// Whole tokens only: never matched as a substring.
const ABUSE = words(
  'aq amk amq aqq sikim sikerim siktir sik orospu pic yarrak amina anani ananin anan got gotveren salak aptal gerizekali mal oc lan',
);
// Words used to address the bot; always filler.
const ADDRESS = words(
  'dostum dost kardesim kardes kanka kanki abi abla hocam hoca reis birader moruk canim guzelim usta kral kralice baba aga',
);
const FILLER = words(
  'bana beni bize ben biz bul bulur bulsana bulurmusun goster oner ara istiyorum istiyoruz isterim yemek yiyelim yiyecek yiyecegim bir bi yer yeri yerler mekan nerede nerde var mi mu misin musun ne diyorsun dersin lutfen acaba simdi peki hemen yakin yakinimda yakinda yakindaki civar civarinda civarda cevresinde tarafinda tarafta lazim cok ve ile icin vay cevap ver olsun olan bugun aksam ogle sabah gidelim gidecegim yapacak yapalim yapabilecegim yiyebilirim yiyebilecegim yiyebilecegimiz oturabilecegim oturalim cekti cekiyor gidebilecegim gidebilirim gidilecek oncesi sonrasi mac yakininda yakinlarinda yaninda karsisinda civarindaki etrafinda civari burada buraya burda etrafimda cevremde yiyecem gidecem sart varmi yakinimdaki yakinlarda buralarda etrafta cevrede bulundugum derken dedim demek istedim kastettim kast etmistim ettim yani hani aslinda onu bunu yemekten yemegi tabi tabii tabiii tabiki tabikii tabikiii ki iste',
);
// Filler only when the text is about food or names a district; else it may be a place name.
const COND_FILLER = words('restoran restorani restorant lokal sey seyler acik');
// Words that mean "food in general"; they stay filler for place purposes.
const FOOD_WORDS = words(
  'yemek yemekten yemegi yiyelim yiyecek yiyecegim yiyebilirim yiyebilecegim restoran karnim acim ac',
);
// Case suffixes left as their own token by apostrophes ("Alsancak'ta").
const SUFFIX_TOKENS = words('a e ya ye da de ta te dan den tan ten nda nde ndan nden');
const QUALITY = words('saglam guzel lezzetli meshur unlu kaliteli harika efsane en iyi');
const PARKING = words('park parki parkli parkyeri');
const NEAR_ME = words(
  'yakinimda yakinimdaki yakinda yakindaki yakin yakinlarda buralarda etrafta etrafimda civarda cevrede cevremde',
);
// Near-me words that stand for the user's own position (not the bare "yakın", which may be "en yakın").
const SELF_NEAR = words('yakinimda yakinimdaki buralarda etrafimda cevremde');
const NEGATION = words('olmayan olmasin secme istemiyorum istemem haric yok degil');
// A category word right before one of these is ruled out ("kebap olmasın", "köfte değil de balık").
const NEGATES_PREVIOUS = words('olmasin istemiyorum istemem olmayan haric degil');
// Dishes that are also matched with one typo ("lahmcun").
const TYPO_DISHES = ['lahmacun'];
// Subjects that are not about parking or food, e.g. football or weather.
const TOPIC = words(
  'mac maci gol skor derbi fikra fikrasi saka espri anlat galatasaray gs fenerbahce fb besiktas bjk trabzonspor altay takim hava yagmur haber secim dolar borsa',
);
const QUESTION = words('nasil neden niye kim kimin hangi kac');
// Past / progressive verb endings (folded).
const VERB_SUFFIXES = ['di', 'du', 'ti', 'tu', 'mis', 'mus', 'yor', 'iyor', 'uyor'];
const hasVerbSuffix = (t: string) => VERB_SUFFIXES.some((s) => t.endsWith(s));
// 'iyi' is a greeting only before these ("iyi akşamlar"); otherwise it is a quality word.
const IYI_GREETING_NEXT = words('aksamlar gunler geceler');
const STADIUM = words('stad stada stadi stadyum stadyuma stadyumu stadyumun');

// Wishes about how a place feels, when or who it is for: they qualify a request, they name nothing.
const QUALIFIER = words(
  'romantik ucuz uygun pahali sakin sessiz manzarali manzara deniz aile ailece cocuklu cocuk kalabalik rahat eglenceli gece aksam ogle sabah kahvalti saati saatleri yemegi yemek yemekleri yer yeri mekan mekani oneri oneriler tavsiye tavsiyesi yenir yesek yiyelim yenilir yenebilir nerede nerde ne neresi acik kapali guzel iyi en meshur unlu lezzetli kaliteli',
);

/**
 * True for a word that only qualifies a request ("romantik", "ucuz", "ne yenir", "bir yer", "akşam"):
 * a filler, quality, near-me, greeting or address word, or one of the QUALIFIER wishes.
 */
export function isQualifierWord(t: string): boolean {
  return (
    QUALIFIER.has(t) ||
    isWishWord(t) ||
    FILLER.has(t) ||
    COND_FILLER.has(t) ||
    QUALITY.has(t) ||
    NEAR_ME.has(t) ||
    GREETING.has(t) ||
    ADDRESS.has(t) ||
    FOOD_WORDS.has(t)
  );
}

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

/** Folded district name of the active city equal to the word, within one typo, or null. */
function nearDistrict(word: string): string | null {
  for (const d of districtsOfCity()) {
    const name = fold(d.name);
    if (withinOneEdit(word, name)) return name;
  }
  return null;
}

/** "bornavadaki" -> "bornova": typo-tolerant district match on the token or its stems. */
function fixDistrictTypo(original: string, token: string): string {
  if (token.length < 5) return token;
  if (isDistrictName(token) || namesToken(token)) return token;
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

/** Two or more words that one place's name words cover, e.g. "adnan menderes". */
function isOnePlaceName(tokens: string[]): boolean {
  if (tokens.length < 2) return false;
  const hit = searchPlaces(tokens.join(' '), 1)[0];
  if (!hit) return false;
  const nw = nameWords(hit.name);
  return tokens.every((t) => nw.some((w) => w.startsWith(t)));
}

/** Short text that can be a place name: no question, no verb, at most 4 words. */
export function looksLikePlace(text: string): boolean {
  const tokens = fold(text).split(' ').filter(Boolean);
  if (tokens.length > 4) return false;
  return !tokens.some((t) => QUESTION.has(t) || (hasVerbSuffix(t) && !isPlaceToken(t)));
}

/** The token is a district (also with a typo or case suffix) or starts a place name. */
function isPlaceToken(tok: string): boolean {
  if (namesToken(tok)) return true;
  return isDistrictName(fixDistrictTypo(tok, placeStem(tok)));
}

/** The token is an official district (also with a case suffix or a typo). */
function isDistrictToken(tok: string): boolean {
  return isDistrictName(fixDistrictTypo(tok, placeStem(tok)));
}

/**
 * The first word of a food phrase is a place, so the phrase is a place plus a dish ("Bornova kebap").
 * A district always is; any other place name is only when it is not a food word as well
 * ("pirinç pilavı", "çiftlik kebabı", "cevizli baklava" are dishes whatever a shop or quarter is called).
 */
function placeBeforeDish(tok: string): boolean {
  return isDistrictToken(tok) || (namesToken(tok) && !isFoodWord(tok));
}

/** Dish heads with a compound ending: a dish phrase whatever place name the words before them match. */
const COMPOUND_HEADS = /^(?:kebabi|tatlisi|boregi|corbasi|pilavi|koftesi|salatasi|dolmasi)$/;

/**
 * "ali paşa kebabı", "hasan paşa köftesi": a compound head with words before it is a dish, even
 * when those words are also a person's or a place's name; only a district ("Bornova
 * köftesi") still reads as a place plus a dish.
 */
function compoundDish(words: string[]): boolean {
  return COMPOUND_HEADS.test(words[words.length - 1]!) && !words.slice(0, -1).some(isDistrictToken);
}

/** Dishes named after a district: a sweet word next to the name is the dish, not a place ("kemalpaşa dondurmalı"). */
const TOWN_DISHES = [
  { town: 'kemalpasa', head: 'tatli', folded: 'kemalpasa tatlisi', written: 'kemalpaşa tatlısı' },
];
// Said around the dish ("dondurmalı kemalpaşa tatlısı"): it only says how the dessert is served.
const SWEET_SIDES = words('dondurmali kaymakli');

/**
 * "kemalpaşa dondurmalı", "kemalpaşa tatlı", "kemalpaşa dondurmalı tatlı" are the dessert
 * "kemalpaşa tatlısı", not the district. Only a word that is right next to the name counts:
 * "kemalpaşa'da dondurmalı" (a case suffix between) stays a place plus a food word.
 */
function townDish(ws: string[], raws: string[] | null): { words: string[]; raws: string[] | null } {
  // The dishes are named after İzmir towns.
  if (activeCity().id !== 'izmir') return { words: ws, raws };
  const outW: string[] = [];
  const outR: string[] = [];
  // Words of how much ("iki tane") say nothing: the town with only those is the dessert too.
  const ordered = new Set<number>();
  for (let k = 0; k < ws.length;) {
    const n = orderSpan(ws, k);
    for (let j = 0; j < n; j++) ordered.add(k + j);
    k += n || 1;
  }
  for (let i = 0; i < ws.length; i++) {
    const dish = TOWN_DISHES.find((x) => x.town === ws[i]);
    if (dish) {
      const lead = outW.length;
      let from = lead;
      while (from > 0 && SWEET_SIDES.has(outW[from - 1]!)) from--;
      let end = i + 1;
      while (end < ws.length && SWEET_SIDES.has(ws[end]!)) end++;
      const sweet = end > i + 1;
      const head = end < ws.length && headStems(ws[end]!).includes(dish.head);
      if (head) end++;
      const already = !sweet && from === lead && head && ws[end - 1] === 'tatlisi';
      const onlyOrder = ws.length > 1 && ws.every((_, k) => k === i || ordered.has(k));
      if ((sweet || head || from < lead || onlyOrder) && !already) {
        const written = dish.written.split(' ');
        outW.length = from;
        outR.length = from;
        dish.folded.split(' ').forEach((w, j) => {
          outW.push(w);
          outR.push(j === 0 ? (raws?.[i] ?? w) : (written[j] ?? w));
        });
        i = end - 1;
        continue;
      }
    }
    outW.push(ws[i]!);
    outR.push(raws?.[i] ?? ws[i]!);
  }
  return { words: outW, raws: raws ? outR : null };
}

/** Just "su" and filler ("su istiyorum"): plain water, never "su" beside other words. */
function isBareWater(ws: string[]): boolean {
  return ws.includes('su') && ws.every((t) => t === 'su' || FILLER.has(t));
}

/** The words `from` to `to` are a food category, a dish or a two-word modifier in their own right. */
function knownPhrase(ws: string[], from: number, to: number): boolean {
  const phrase = ws.slice(from, to).join(' ');
  return (
    categoryForQuery(phrase) !== null ||
    hasExactDish(phrase) ||
    // "tam buğday": a modifier of two words keeps its first word.
    (to - from > 1 && MODIFIERS.has(phrase))
  );
}

/** Some window of up to 3 words names a food category ("baklava", "maraş dondurma", "sade kahve"). */
function hasFoodWords(ws: string[]): boolean {
  for (const len of [3, 2, 1]) {
    for (let i = 0; i + len <= ws.length; i++) {
      if (categoryForQuery(ws.slice(i, i + len).join(' '), true) !== null) return true;
    }
  }
  return false;
}

/**
 * "baklava kilo", "dondurma kase", "iskender yarım", "somon tabağı", "şekerli kahve": how much or how
 * it is ordered says nothing about the dish, so those words go before the dish is looked up. Only
 * when something food is left, and never a phrase that is a dish itself ("kahvaltı tabağı", "tam
 * buğday ekmeği"); a text without food ("Yarım Ekmek", "Büyük Efes") keeps all its words.
 */
function withoutOrderWords(
  ws: string[],
  raws: string[] | null,
): { words: string[]; raws: string[] | null } {
  const drop = new Set<number>();
  for (let i = 0; i < ws.length;) {
    const n = orderSpan(ws, i);
    if (n === 0) {
      i++;
      continue;
    }
    // "porsiyon döner", "yarım pide": said right before the dish it already belongs to the dish phrase.
    if (n === 1 && LEADING_GENERIC.has(ws[i]!) && i + 1 < ws.length && orderSpan(ws, i + 1) === 0) {
      i++;
      continue;
    }
    // A dish or modifier of up to 4 words that holds the span and more ("kahvaltı tabağı") keeps it.
    let kept = false;
    for (let a = Math.max(0, i - 3); a < i + n && !kept; a++) {
      for (let b = Math.max(a + 2, i + 1); b <= Math.min(ws.length, a + 4) && !kept; b++) {
        if (!(a === i && b === i + n) && knownPhrase(ws, a, b)) kept = true;
      }
    }
    if (!kept) for (let k = i; k < i + n; k++) drop.add(k);
    i += n;
  }
  if (drop.size === 0) return { words: ws, raws };
  const keep = ws.map((_, i) => i).filter((i) => !drop.has(i));
  const left = keep.map((i) => ws[i]!);
  if (left.length === 0 || !(hasFoodWords(left) || isBareWater(left))) return { words: ws, raws };
  return { words: left, raws: raws ? keep.map((i) => raws[i]!) : null };
}

/**
 * "uygun fiyatlı hamburger", "ucuz kebap", "öğrenci bütçesine pide": a budget word is the cheap wish
 * (wishesIn reads it from the text), not part of the dish, so it goes before the dish is looked up.
 * Only when a food word is left; a text without food ("ucuz otopark") keeps all its words.
 */
function withoutBudgetWords(
  ws: string[],
  raws: string[] | null,
): { words: string[]; raws: string[] | null } {
  const drop = new Set<number>();
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    const next = ws[i + 1] ?? '';
    if (
      (w === 'uygun' && next.startsWith('fiyat')) ||
      (w === 'ogrenci' && next.startsWith('butce'))
    ) {
      drop.add(i).add(i + 1);
      i++;
    } else if (['ucuz', 'ekonomik', 'hesapli'].includes(w)) drop.add(i);
  }
  if (drop.size === 0) return { words: ws, raws };
  const keep = ws.map((_, i) => i).filter((i) => !drop.has(i));
  const left = keep.map((i) => ws[i]!);
  if (!hasFoodWords(left)) return { words: ws, raws };
  return { words: left, raws: raws ? keep.map((i) => raws[i]!) : null };
}

/** A dish text from the AI without its budget words ("uygun fiyatlı hamburger" -> "hamburger"), null when none is left. */
export function dishWithoutBudget(dish: string | null): string | null {
  if (!dish) return dish;
  const left = dish
    .replace(
      /(?<![\p{L}\p{N}])(?:uygun\s+fiyat\p{L}*|öğrenci\s+bütçe\p{L}*|ogrenci\s+butce\p{L}*|ucuz|ekonomik|hesaplı|hesapli)(?![\p{L}\p{N}])/giu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return left === '' ? null : left;
}

/** Towns whose name is a köfte style ("tire köfte", "ödemiş köfte"): the dish, not a place to search in. */
const KOFTE_TOWNS = words('tire odemis bergama');

/** Under 3 letters, one repeated letter ("aaa"), or no vowel ("xd", "hmm"): not a word to search. */
function isGibberish(text: string): boolean {
  const letters = text.replace(/[^a-z]/g, '');
  if (letters.length === 0) return false;
  if (letters.length < 3 || new Set(letters).size === 1) return true;
  // A short no-vowel name can still be a real place ("ptt").
  return !/[aeiou]/.test(letters) && !(text.indexOf(' ') < 0 && equalsNameWord(text));
}

/** Joined dish typed apart ("ezo gelin") or apart dish typed joined ("kellepaça"): the other spelling that is a food word. */
function respell(
  words: string[],
  raws: string[] | null,
): { words: string[]; raws: string[] | null } {
  const outW: string[] = [];
  const outR: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const rw = raws?.[i] ?? w;
    const alias = respellAlias(w);
    if (alias) {
      const typed = alias.written.split(' ');
      alias.folded.split(' ').forEach((f, j) => {
        outW.push(f);
        outR.push(typed[j] ?? f);
      });
      continue;
    }
    const next = words[i + 1];
    const joined = next === undefined ? '' : w + next;
    if (
      next !== undefined &&
      w.length >= 3 &&
      next.length >= 3 &&
      !categoryForQuery(`${w} ${next}`, true) &&
      categoryForQuery(joined)
    ) {
      outW.push(joined);
      outR.push(rw + (raws?.[i + 1] ?? next));
      i++;
      continue;
    }
    if (w.length >= 7 && !categoryForQuery(w)) {
      let split: number | null = null;
      for (let k = 3; k <= w.length - 3 && split === null; k++) {
        if (categoryForQuery(`${w.slice(0, k)} ${w.slice(k)}`)) split = k;
      }
      if (split !== null && !isPlaceToken(w)) {
        const lined = fold(rw).length === w.length;
        outW.push(w.slice(0, split), w.slice(split));
        outR.push(
          lined ? rw.slice(0, split) : w.slice(0, split),
          lined ? rw.slice(split) : w.slice(split),
        );
        continue;
      }
    }
    outW.push(w);
    outR.push(rw);
  }
  return { words: outW, raws: raws ? outR : null };
}

/** Split a free-text query into chit-chat, or place / dish / filters. */
export function parseQuery(raw: string): QueryIntent {
  // "s.a" is a greeting ("selamün aleyküm"), not two letters.
  const all0 = fold(raw)
    .replace(/(^| )s a( |$)/g, '$1sa$2')
    .split(' ')
    .filter(Boolean);
  const typed0 = raw
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  const spelled = respell(all0, typed0.length === all0.length ? typed0 : null);
  const dished = townDish(spelled.words, spelled.raws);
  const budgetless = withoutBudgetWords(dished.words, dished.raws);
  const { words: all, raws: typed } = withoutOrderWords(budgetless.words, budgetless.raws);
  if (all.length === 0) return { kind: 'empty' };
  // "tire köfte": the town right before the köfte word is its style (see KOFTE_TOWNS).
  const kofteStyles = new Set(
    all.filter((t, i) => KOFTE_TOWNS.has(t) && headStems(all[i + 1] ?? '').includes('kofte')),
  );

  // Greeting / abuse: nothing left once the chit-chat words are dropped.
  const isGreet = (t: string) => GREETING.has(t) || (SOLO_GREETING.has(t) && all.length <= 2);
  const greetIyi = (i: number) => all[i] === 'iyi' && IYI_GREETING_NEXT.has(all[i + 1] ?? '');
  const hasGreeting = all.some((t, i) => isGreet(t) || greetIyi(i));
  let rest = all.filter(
    (t, i) =>
      !isGreet(t) &&
      !greetIyi(i) &&
      !ABUSE.has(t) &&
      // "ev yemeği" / "öğle yemeği" are dishes, not filler.
      (!FILLER.has(t) ||
        (t === 'yemegi' && (all[i - 1] === 'ev' || all[i - 1] === 'ogle')) ||
        // "sebze yemeği", "etli yemek": the meal word stays with the word that names its category.
        ((t === 'yemegi' || t === 'yemek') &&
          i > 0 &&
          categoryForQuery(`${all[i - 1]} ${t}`) !== null) ||
        // "ara sıcak" is the meze course, not "search hot".
        (t === 'ara' && (all[i + 1] ?? '').startsWith('sicak'))) &&
      !(t === 'yerde' && all[i - 1] === 'bulundugum') &&
      !ADDRESS.has(t) &&
      !SUFFIX_TOKENS.has(t),
  );
  // Generic food words ("yemek", "acım") count even though they are filler.
  const foodWord = all.some((t) => FOOD_WORDS.has(t));
  if (rest.length === 0) {
    if (all.some((t) => ABUSE.has(t))) return { kind: 'abuse' };
    if (hasGreeting) return { kind: 'greeting' };
    // "yakınımda tabii", "buralarda lütfen": only filler around a near-me word is a near-me search.
    if (!foodWord && !all.some((t) => SELF_NEAR.has(t))) {
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
      (t) => categoryForQuery(t) !== null || FOOD_WORDS.has(t) || isParking(t) || isPlaceToken(t),
    )
  ) {
    return { kind: 'greeting' };
  }

  // 'iyi' counts as quality unless it opens a greeting like "iyi akşamlar".
  const nearMe = all.some((t) => NEAR_ME.has(t)) || all.join(' ').includes('bulundugum yerde');
  // "en yakın" asks for the nearest, not the best: 'en' is quality only before other words.
  const quality = all.some(
    (t, i) =>
      QUALITY.has(t) && !greetIyi(i) && !(t === 'en' && (all[i + 1] ?? '').startsWith('yakin')),
  );
  rest = rest.filter((t) => !QUALITY.has(t));

  // "kebap olmasın", "köfte değil de balık": the category before the negation is ruled out.
  // "Bornova değil Buca'da": so is a place, and it is not searched.
  let notCat: FoodCategory | null = null;
  for (let i = 1; i < rest.length; i++) {
    if (!NEGATES_PREVIOUS.has(rest[i]!)) continue;
    const len = i >= 2 && categoryForQuery(rest.slice(i - 2, i).join(' ')) ? 2 : 1;
    const c = categoryForQuery(rest.slice(i - len, i).join(' '));
    if (!c) {
      const ruledOut = (t: string) =>
        isPlaceToken(t) && !NEGATION.has(t) && !isParking(t) && categoryForQuery(t) === null;
      let from = i;
      while (from > 0 && ruledOut(rest[from - 1]!)) from--;
      rest = [...rest.slice(0, from), ...rest.slice(i)];
      i = from;
      continue;
    }
    notCat = c;
    rest = [...rest.slice(0, i - len), ...rest.slice(i)];
    i -= len;
  }

  // One typo in a dish word ("lahmcun" -> "lahmacun").
  rest = rest.map((t) => {
    if (t.length < 6 || categoryForQuery(t) !== null) return t;
    const fixed = TYPO_DISHES.find((d) => withinOneEdit(t, d));
    return fixed && !namesToken(t) ? fixed : t;
  });

  // A word only the food lexicon knows is not a dish when the whole text names one place ("Pirinç Center").
  const text0 = rest;
  let wholePlace: boolean | undefined;
  const isWholePlace = () => (wholePlace ??= text0.length >= 2 && isOnePlaceName(text0));

  // Category: a three- or two-word phrase first, then a single word.
  let cat: FoodCategory | null = null;
  let dish: string | null = null;
  // Plain water: only a text that is just "su" ("su istiyorum", "bir su") means it, never "su" beside other words.
  if (rest.length === 1 && isBareWater(all)) {
    cat = 'cafe';
    dish = 'su';
    rest = [];
  }
  for (const len of [4, 3, 2, 1]) {
    for (let i = 0; i + len <= rest.length && !cat; i++) {
      const words = rest.slice(i, i + len);
      // "otoparklı lahmacun": a car-park word asks for parking, it is never part of the dish.
      if (len > 1 && words.some(isParking)) continue;
      const phrase = words.join(' ');
      let c = categoryForQuery(phrase);
      let named = phrase;
      // "pilavlı tavuk", "makarnalı tavuk": the -lı word is the dish, the plain protein only says what is in it.
      if (!c && len === 2 && !placeBeforeDish(words[0]!)) c = leadDishProfile(words)?.cat ?? null;
      // "su böreği peynirli", "kumru sucuklu": the dish first, a word that only describes it after.
      const lead = words.slice(0, -1).join(' ');
      if (!c && len >= 2 && isTrailingModifier(words[len - 1]!)) {
        const leadCat = categoryForQuery(lead);
        // Only a dish the app knows is the head ("bal kaymak" is not "bal" with a modifier).
        if (leadCat && dishProfile(lead, false) && !isDistrictToken(words[len - 1]!)) {
          c = leadCat;
          named = lead;
        }
      }
      if (!c) {
        // "tepsi kebabı": the head noun names the category, but not after a place ("Bornova kebap").
        const head = categoryForQuery(phrase, true);
        if (head && (len === 1 || !placeBeforeDish(words[0]!) || compoundDish(words))) c = head;
      }
      // "tire köfte", "ödemiş köfte": a köfte style named after a town, not köfte in that town.
      const style =
        len === 2 && kofteStyles.has(words[0]!) && headStems(words[1]!).includes('kofte');
      if (!c && style) c = categoryForQuery(words[1]!);
      if (c && !style && !categoryForQuery(named, true, false) && isWholePlace()) c = null;
      if (!c) continue;
      // "taze meyve suyu", "sade kahve": how it is served belongs to the dish, it is not a place.
      let from = i;
      let size = len;
      if (i > 0 && LEADING_GENERIC.has(rest[i - 1]!) && !isDistrictToken(rest[i - 1]!)) {
        named = `${rest[i - 1]} ${named}`;
        from = i - 1;
        size = len + 1;
      }
      cat = c;
      dish = named;
      rest = [...rest.slice(0, from), ...rest.slice(from + size)];
    }
  }

  // "piyaz antalya": a city said after the dish is its style, not a place to look in (a district is).
  if (cat && dish) {
    const dishTokens = dish.split(' ');
    const at = all.findIndex((_, i) => all.slice(i, i + dishTokens.length).join(' ') === dish);
    if (at >= 0) {
      const end = at + dishTokens.length;
      rest = rest.filter(
        (t) => !(CITY_STYLES.has(t) && all.lastIndexOf(t) >= end && !isDistrictToken(t)),
      );
    }
  }

  // A food word (or the dish phrase) is never a place.
  rest = rest.filter(
    (t) =>
      categoryForQuery(t) === null ||
      (categoryForQuery(t, false, false) === null && isWholePlace()),
  );

  // A car-park word only narrows a food search; alone it is the app default.
  const hasPark = rest.some(isParking);
  rest = rest.filter((t) => !isParking(t) && !NEGATION.has(t));
  const requireParking = hasPark && cat !== null;

  // Ruling out the same category that was picked ("et ... kebap olmasın") excludes nothing.
  if (notCat === cat) notCat = null;
  const food = cat !== null || foodWord || notCat !== null;
  if (food) rest = rest.filter((t) => !COND_FILLER.has(t));

  rest = rest.map((t) => (STADIUM.has(t) ? 'stadyum' : t));

  // Off-topic: nothing about food, parking or a place, but a topic or a question about the past.
  if (
    !cat &&
    !food &&
    !hasPark &&
    !all.some(isDistrictName) &&
    !rest.some(
      (t) =>
        t.length >= 3 && !TOPIC.has(t) && !QUESTION.has(t) && !hasVerbSuffix(t) && isPlaceToken(t),
    ) &&
    (all.some((t) => TOPIC.has(t)) || (all.some((t) => QUESTION.has(t)) && all.some(hasVerbSuffix)))
  ) {
    return { kind: 'offtopic' };
  }

  // Nothing to search for: no food, no parking, and the leftover is not a word.
  if (!cat && !food && !hasPark && isGibberish(rest.join(' '))) return { kind: 'gibberish' };

  let tokens = placeTokens(rest);
  const fullPlace = tokens.join(' ');

  // Any place word that is a district sets it; but not inside one place's full name.
  const districtAt = isOnePlaceName(tokens) ? -1 : tokens.findIndex(isDistrictName);
  const district =
    districtAt >= 0
      ? (districtsOfCity().find((d) => fold(d.name) === tokens[districtAt]) ?? null)
      : null;
  if (district) {
    tokens = tokens.filter((_, i) => i !== districtAt).filter((t) => !COND_FILLER.has(t));
  }
  const placeQuery = tokens.join(' ');
  if (fullPlace === '' && !cat && !hasPark && !food && !nearMe) return { kind: 'empty' };

  const uncertain = placeQuery !== '' && searchPlaces(placeQuery, 1).length === 0;
  const text = cat ? [fullPlace, dish].filter(Boolean).join(' ') : fullPlace;

  // Show the dish as typed (Turkish letters) when the raw words line up with the folded ones.
  let shownDish = dish;
  if (dish && typed) {
    const dishTokens = dish.split(' ');
    const at = all.findIndex((_, i) => all.slice(i, i + dishTokens.length).join(' ') === dish);
    if (at >= 0) shownDish = typed.slice(at, at + dishTokens.length).join(' ');
  }

  return {
    kind: 'search',
    text,
    cat,
    notCat,
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

/**
 * Words that wish for something a plain search cannot use ("romantik", "ucuz", "aileyle", "gece").
 * Folded; a stem of 4+ letters also matches longer forms ("aile" -> "ailemle"). Dish and place
 * words are never in here, so an ordinary query never reaches the AI because of this list.
 */
export const WISH_WORDS: Record<Wish, string[]> = {
  cheap: ['ucuz', 'ekonomik', 'butce', 'hesapli'],
  romantic: ['romantik', 'sevgili'],
  quiet: ['sakin', 'sessiz', 'huzurlu'],
  family: ['aile'],
  kids: ['cocuk'],
  group: ['grup', 'arkadas'],
  quick: ['cabuk', 'cabucak', 'acele', 'hizlica', 'hizli'],
  view: ['manzara'],
  late: ['gece', 'gec'],
  // "zayıflamak", "kalori saymak"; "kalorili" (high calorie) is hearty, see wishesIn.
  healthy: ['saglikli', 'diyet', 'fit', 'hafif', 'light', 'kalori', 'zayifla'],
  // "kas" (muscle) is a whole word only: "kasap" is a butcher. Words under 4 letters never match a longer form.
  protein: ['protein', 'kas', 'kasli', 'spor', 'sporcu', 'fitness', 'gym'],
  // Filling food: "doyurucu", "bulk yapıyorum"; "kalorili", "kilo almak", "tok tutsun" are said in wishesIn.
  hearty: ['doyur', 'bulk'],
  tasty: ['lezzetli', 'nefis', 'enfes', 'leziz'],
  outdoor: ['bahce', 'teras', 'balkon', 'disarida'],
  // Car parks. "ücretsiz", "metro" and "engelli" next to a place stay with the normal search, so
  // free and rail only come from the AI; phrases below catch the rest.
  free: [],
  covered: [],
  nonstop: ['nonstop'],
  safe: ['guvenli', 'guvenlik', 'kamerali'],
  big_vehicle: ['karavan', 'minibus', 'kamyonet', 'pikap'],
  motorcycle: ['motosiklet', 'motor'],
  disabled: ['engelli'],
  overnight: [],
  rail: [],
};

/** Wishes said in more than one word (folded, padded with spaces). */
const WISH_PHRASES: [Wish, string][] = [
  ['covered', ' kapali otopark'],
  ['covered', ' katli otopark'],
  ['nonstop', ' 24 saat'],
  ['nonstop', ' 7 24 '],
  ['overnight', ' gece boyu'],
  ['overnight', ' sabaha kadar'],
  ['big_vehicle', ' buyuk arac'],
  ['big_vehicle', ' yuksek arac'],
  ['healthy', ' temiz beslen'],
  ['healthy', ' kilo ver'],
  ['healthy', ' kilo kayb'],
  ['hearty', ' kilo al '],
  ['hearty', ' kilo alm'],
  ['hearty', ' kilo alay'],
  ['hearty', ' kilo alic'],
  ['hearty', ' tok tut'],
  ['hearty', ' karnim cok ac'],
  ['hearty', ' karnim doy'],
  ['cheap', ' cebime uygun'],
  ['cheap', ' uygun fiyat'],
  ['quick', ' vaktim yok'],
  ['quick', ' vaktim az'],
  ['quick', ' zamanim yok'],
  ['quick', ' zamanim az'],
];

/** True for one folded word that names a wish ("çocuklarla", "romantik"). */
function isWishWord(t: string): boolean {
  return Object.values(WISH_WORDS).some((stems) =>
    stems.some((stem) => t === stem || (stem.length >= 4 && t.startsWith(stem))),
  );
}

/** The wishes named in the text, found by rules (the AI may find more). */
export function wishesIn(text: string): Wish[] {
  // "Kaş" (the Antalya district, typed with its ş) is not "kas" (muscle).
  const folded = fold(text.toLocaleLowerCase('tr').replace(/kaş/g, 'kasx'));
  const tokens = folded.split(' ').filter(Boolean);
  const out: Wish[] = [];
  // "kalori" is light food ("düşük kalorili", "kalori saymak"), "kalorili" and "yüksek kalori" are
  // filling food. The word "kalori" counts for one of the two wishes only.
  const kcal = (t: string, i: number): 'healthy' | 'hearty' | null => {
    if (!t.startsWith('kalori')) return null;
    const before = tokens[i - 1] ?? '';
    const after = tokens[i + 1] ?? '';
    if (['dusuk', 'az', 'hafif'].includes(before) || after === 'dusuk') return 'healthy';
    if (['yuksek', 'bol'].includes(before) || after === 'yuksek') return 'hearty';
    return t.startsWith('kalorili') ? 'hearty' : 'healthy';
  };
  for (const wish of Object.keys(WISH_WORDS) as Wish[]) {
    const hit =
      WISH_WORDS[wish].some((stem) =>
        tokens.some(
          (t, i) =>
            (t === stem || (stem.length >= 4 && t.startsWith(stem))) &&
            (stem !== 'kalori' || kcal(t, i) === 'healthy'),
        ),
      ) ||
      (wish === 'hearty' && tokens.some((t, i) => kcal(t, i) === 'hearty'));
    if (hit) out.push(wish);
  }
  const padded = ` ${folded} `;
  if (padded.includes(' acik hava ') && !out.includes('outdoor')) out.push('outdoor');
  for (const [wish, phrase] of WISH_PHRASES) {
    if (padded.includes(phrase) && !out.includes(wish)) out.push(wish);
  }
  return out;
}

/**
 * Words of an occasion, a person, a mood or a body state that ask for food without naming any
 * ("doğum günü", "annem geliyor", "moralim bozuk", "midem bozuldu", "yorgunuz", "gece geç saatte").
 * Folded stems; `wish` is the goal wish whose table entry fits (null: no entry fits, the search
 * stays as it is). Short on purpose: the router picks the kinds, this is only the fallback.
 */
const OCCASION_SIGNALS: { stem: RegExp; wish: Wish | null }[] = [
  { stem: /\b(dogum gunu|yildonum|misafir|annem|babam|is arkadas|surpriz|yoresel)/, wish: null },
  { stem: /\b(usud|usuy|soguk)/, wish: null },
  { stem: /\b(moral|yorgun|yoruldu)/, wish: 'hearty' },
  { stem: /\b(midem|hasta\b|hastayim)/, wish: 'healthy' },
  { stem: /\bgece gec/, wish: 'quick' },
];

/** The occasion / mood signal of a message: the wish of a fitting table entry (or null), undefined without a signal. */
export function occasionSignal(text: string): { wish: Wish | null } | undefined {
  const f = fold(text);
  const hit = OCCASION_SIGNALS.find((x) => x.stem.test(f));
  return hit ? { wish: hit.wish } : undefined;
}

/** "önce park sonra yemek", "akşam 8'de yemek", "bu akşam": a plan for a time, or null. */
export function planWhenIn(text: string): PlanWhen | null {
  const f = fold(text);
  if (/\bonce\b.*\bpark\w*\b.*\bsonra\b/.test(f) || /\bpark (edip|ettikten|edince)\b/.test(f)) {
    return 'now';
  }
  if (/\baksam\s+(saat\s+)?\d{1,2}/.test(f) || /\bbu aksam\b/.test(f)) return 'tonight';
  if (/\bogle(n)?\s+(saat\s+)?\d{1,2}/.test(f)) return 'lunch';
  if (/\bogleden sonra\b|\bbirazdan\b|\bbiraz sonra\b/.test(f)) return 'later_today';
  return null;
}

/** True when the text has a wish or plan word the rules cannot act on, so the AI may help. */
export function hasWishWords(text: string): boolean {
  return wishesIn(text).length > 0 || planWhenIn(text) !== null || parkTripIn(text);
}

/** "Konak'a gideceğim, nereye bırakayım": a car park for a trip, no restaurant involved. */
export function parkTripIn(text: string): boolean {
  const f = fold(text);
  return (
    /\bnereye (birak|park)\w*/.test(f) ||
    (/\b(gidecegim|gidiyorum|gidicem|gidecek)\b/.test(f) && /\b(birak|park)\w*/.test(f))
  );
}

/**
 * The text without the words that only say when or that it is a trip ("akşam 8'de", "gideceğim,
 * nereye bırakayım"), so they are not mistaken for an unknown place or dish. The question where to
 * leave the car ("arabayı nereye park edeyim") stays as one car-park word. The plan itself is
 * read from the original text by planWhenIn / parkTripIn.
 */
export function withoutPlanWords(text: string): string {
  return text
    .replace(
      /(?:akşam|aksam|öğle|ogle|öğlen|oglen)\s+(?:saat\s+)?\d{1,2}(?:[’']?\s*(?:de|da|te|ta)\b)?/giu,
      ' ',
    )
    .replace(
      /(?:\b(?:araba|arac|araç)\p{L}*\s+)?\bnereye\s+(?:bırak|birak|park)\p{L}*(?:\s+(?:ed|et)\p{L}*)?/giu,
      ' otopark ',
    )
    .replace(/\b(?:gideceğim|gidecegim|gidiyorum|gidicem)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
