// Shared by the app and the Cloudflare Worker: keep this file free of React / RN imports.
import { z } from 'zod';

import { cityById, cityExamples, CITIES, DEFAULT_CITY, isAvailableCity } from '../../data/cities';
import type { FoodCategory } from '../../data/restaurants';

export const FREE_DAILY = 10;
export const SUB_DAILY = 200;
export const MAX_MESSAGE_CHARS = 200;
/** The model's private reading of a message, as far as the app keeps it. */
export const MAX_MEANING_CHARS = 160;
/** Recent turns sent with every message, so the router keeps what was asked a few messages back. */
export const HISTORY_LIMIT = 10;
export const MAX_RESULTS = 5;
/**
 * How long the app waits for the router (/understand) before it answers with its own rules.
 * Haiku with structured output is usually faster, but the first call after a schema change (the
 * API compiles the schema then) and a cold worker took longer than 6 s; a longer wait feels like a hang.
 */
export const ROUTER_TIMEOUT_MS = 12000;
/** /pick and /plan: candidate restaurants per request, and car parks per restaurant (plan). */
export const MAX_CANDIDATES = 5;
/**
 * /pick for restaurants: the model sees this many nearby places (name and type) and judges which
 * fit the request, so a goal or a diet ("kas yapmak", "vejetaryenim") needs no rule of its own.
 */
export const MAX_PICK_CANDIDATES = 40;
/** At most this many candidates are marked as fitting the request. */
export const MAX_FIT = 5;
/** Longest candidate name / type the worker accepts. */
export const MAX_LABEL_CHARS = 80;
export const MAX_PLAN_PARKINGS = 3;

/**
 * The first `max` UTF-16 units of `text`, never ending in half of a surrogate pair: a cut emoji
 * is a lone surrogate, which JSON.stringify escapes and the Anthropic API rejects (HTTP 400).
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

export type ChatTurn = { role: 'user' | 'bot'; text: string };

/**
 * The city a request is about (the open cities of data/cities.ts). Optional everywhere: an app
 * or a worker that predates the field leaves it out or ignores it, and the prompts then say İzmir.
 */
export const CitySchema = z.enum(
  CITIES.filter((c) => c.available).map((c) => c.id) as [string, ...string[]],
);
export type AiCityId = z.infer<typeof CitySchema>;

/** The city of a request for the prompts: an unknown or missing id means İzmir. */
function promptCity(city: string | undefined) {
  return cityById(isAvailableCity(city) ? city : DEFAULT_CITY);
}

export type UnderstandRequest = {
  deviceId: string;
  messageId: string;
  text: string;
  history: ChatTurn[];
  section: 'park' | 'food';
  /** What the last bot reply showed (no names): lets the model answer "pick_from_last". */
  lastCards?: { count: number; kind: 'restaurant' | 'parking' };
  city?: AiCityId;
};

export type QuotaRequest = { deviceId: string };

/** The client gave up waiting for this message: the server gives its use back. */
export type CancelRequest = { deviceId: string; messageId: string };

// Same literals as FOOD_CATEGORIES in data/restaurants.ts.
const FOOD_CATEGORY_VALUES = [
  'breakfast',
  'soup',
  'meat',
  'lokanta',
  'fish',
  'cafe',
  'meyhane',
  'fast',
  'world',
  'dessert',
] as const satisfies readonly FoodCategory[];

/** What the user wishes for beyond what and where. Only some map to data we hold (see assistant). */
export const WISHES = [
  'cheap',
  'romantic',
  'quiet',
  'family',
  'kids',
  'group',
  'quick',
  'view',
  'late',
  'healthy',
  'tasty',
  'outdoor',
  // Car park wishes (free / covered / nonstop / rail / disabled map to data; the rest do not).
  'free',
  'covered',
  'nonstop',
  'safe',
  'big_vehicle',
  'motorcycle',
  'disabled',
  'overnight',
  'rail',
] as const;
export type Wish = (typeof WISHES)[number];

/** What the app does besides showing the reply; the chips and the pick come from app code. */
export const CHAT_ACTIONS = [
  'none',
  'ask_food_or_park',
  'pick_from_last',
  'suggest_examples',
] as const;
export type ChatReplyAction = (typeof CHAT_ACTIONS)[number];

/** What the bot may ask back. The question's chips always come from the app. */
export const CLARIFY_ASKS = ['district', 'dish', 'party', 'time', 'duration'] as const;
export type ClarifyAsk = (typeof CLARIFY_ASKS)[number];

export const PLAN_WHENS = ['now', 'tonight', 'lunch', 'dinner', 'later_today'] as const;
export type PlanWhen = (typeof PLAN_WHENS)[number];

const searchFields = {
  kind: z.literal('search'),
  district: z.string().nullable(),
  cat: z.enum(FOOD_CATEGORY_VALUES).nullable(),
  dish: z.string().nullable(),
  place: z.string().nullable(),
  food: z.boolean(),
  requireParking: z.boolean(),
  appleQuery: z.string().nullable(),
};

/**
 * Job 1 additions. `tone` (Z1), `clarify.text` (Z2) and `dishNote` (Z3) are the only free text
 * the model may write; the app drops any of them that fails validateFreeText.
 */
const searchExtras = {
  wishes: z.array(z.enum(WISHES)).max(6),
  partySize: z.number().int().min(1).max(99).nullable(),
  clarify: z.object({ ask: z.enum(CLARIFY_ASKS), text: z.string().nullable() }).nullable(),
  plan: z.object({ when: z.enum(PLAN_WHENS) }).nullable(),
  tone: z.string().nullable(),
  dishNote: z.string().nullable(),
  /**
   * The model's own short reading of the message with the conversation so far ("Bornova'da
   * vejetaryen bir yer istiyor"). Never shown; it goes to /pick so a clarify answer ("Bornova")
   * keeps what was asked before.
   */
  meaning: z.string().nullable(),
  /** A category the user ruled out ("kebap olmasın"). */
  notCat: z.enum(FOOD_CATEGORY_VALUES).nullable(),
};

/** Server format schema: structured outputs need every field present. */
export const UnderstandingSchema = z.discriminatedUnion('kind', [
  z.object({
    ...searchFields,
    nearMe: z.boolean(),
    dishServes: z.array(z.string()).max(5).nullable(),
    ...searchExtras,
  }),
  z.object({ kind: z.literal('chat'), reply: z.string(), action: z.enum(CHAT_ACTIONS) }),
  z.object({ kind: z.literal('unknown') }),
]);

/**
 * What the model is asked to produce for /understand: ONE flat object. Structured outputs reject a
 * `$defs` / `$ref` (a reused sub-schema, or any array with a `.max()`) next to an `anyOf`, and a
 * discriminated union is an `anyOf` of objects, so the model never sees `UnderstandingSchema`.
 * The API also caps the union-typed parameters (`["string","null"]`, `anyOf [X, null]`), so this
 * schema has NONE: every property is required and "not given" is a sentinel, which
 * `toUnderstanding` maps back to null: "" (strings), "none" (enums), 0 (partySize), false
 * (booleans), [] (arrays). clarify / plan are flattened into clarifyAsk + clarifyText / planWhen.
 * Limits that JSON schema cannot carry are applied by `toUnderstanding`.
 * Keep every sub-schema inline and separate: do not reuse one instance twice.
 */
export const UnderstandingModelSchema = z.object({
  // Written first, so the fields below follow the model's own reading; never shown or used.
  meaning: z.string(),
  kind: z.enum(['search', 'chat', 'unknown']),
  district: z.string(),
  cat: z.enum([...FOOD_CATEGORY_VALUES, 'none']),
  notCat: z.enum([...FOOD_CATEGORY_VALUES, 'none']),
  dish: z.string(),
  place: z.string(),
  food: z.boolean(),
  requireParking: z.boolean(),
  appleQuery: z.string(),
  nearMe: z.boolean(),
  dishServes: z.array(z.string()),
  wishes: z.array(z.enum(WISHES)),
  partySize: z.number().int(),
  clarifyAsk: z.enum([...CLARIFY_ASKS, 'none']),
  clarifyText: z.string(),
  planWhen: z.enum([...PLAN_WHENS, 'none']),
  tone: z.string(),
  dishNote: z.string(),
  reply: z.string(),
  action: z.enum(CHAT_ACTIONS),
});
export type UnderstandingModel = z.infer<typeof UnderstandingModelSchema>;

/** The longest free-text field the app is given (the app drops what is over its own, tighter limit). */
const MAX_FIELD_CHARS = 300;
const MAX_SERVE_CHARS = 40;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A string field of the flat output: "" (or a missing / null / blank field) means "not given". */
function given(v: unknown, max = MAX_FIELD_CHARS): string | null {
  return typeof v === 'string' && v.trim() !== '' ? clipText(v, max) : null;
}

/** The values of `raw` that are one of `allowed`, once each, at most `max`; anything else is dropped. */
function codes<T extends string>(raw: unknown, allowed: readonly T[], max: number): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const v of raw) {
    const hit = allowed.find((a) => a === v);
    if (hit !== undefined && !out.includes(hit)) out.push(hit);
    if (out.length >= max) break;
  }
  return out;
}

/** An integer in 0..max, or null (anything else, including a float, is not an index). */
function index(v: unknown, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
}

/**
 * The flat model output (or an answer already shaped like the union) as the `Understanding` the
 * app, and every deployed app, reads. TOTAL: it never throws and its result always passes
 * `UnderstandingSchema`. Tolerant: a missing, null or odd field gets its default, the sentinels
 * ("" / "none" / 0 / [] / false) become null, an unknown code is dropped, numbers are clamped,
 * strings and lists are capped, and a chat without a reply (or anything unreadable) is "unknown".
 */
export function toUnderstanding(raw: unknown): Understanding {
  const unknown: Understanding = { kind: 'unknown' };
  try {
    if (!isObject(raw)) return unknown;
    const m = raw;
    let out: Understanding = unknown;
    if (m.kind === 'chat') {
      const reply = given(m.reply);
      if (reply !== null) {
        out = { kind: 'chat', reply, action: CHAT_ACTIONS.find((a) => a === m.action) ?? 'none' };
      }
    } else if (m.kind === 'search') {
      const party = typeof m.partySize === 'number' ? Math.trunc(m.partySize) : 0;
      // The union shape (clarify / plan objects) and the flat shape (clarifyAsk / planWhen) both read.
      const clarify = isObject(m.clarify) ? m.clarify : null;
      const plan = isObject(m.plan) ? m.plan : null;
      const ask = CLARIFY_ASKS.find((a) => a === (m.clarifyAsk ?? clarify?.ask));
      const when = PLAN_WHENS.find((w) => w === (m.planWhen ?? plan?.when));
      const serves = (Array.isArray(m.dishServes) ? m.dishServes : [])
        .map((v) => given(v, MAX_SERVE_CHARS))
        .filter((v): v is string => v !== null)
        .filter((v, i, all) => all.indexOf(v) === i)
        .slice(0, 5);
      out = {
        kind: 'search',
        district: given(m.district),
        cat: FOOD_CATEGORY_VALUES.find((c) => c === m.cat) ?? null,
        dish: given(m.dish),
        place: given(m.place),
        food: m.food === true,
        requireParking: m.requireParking === true,
        appleQuery: given(m.appleQuery),
        nearMe: m.nearMe === true,
        dishServes: serves.length > 0 ? serves : null,
        wishes: codes(m.wishes, WISHES, 6),
        partySize: party >= 1 && party <= 99 ? party : null,
        clarify: ask ? { ask, text: given(m.clarifyText ?? clarify?.text) } : null,
        plan: when ? { when } : null,
        tone: given(m.tone),
        dishNote: given(m.dishNote),
        meaning: given(m.meaning, MAX_MEANING_CHARS),
        notCat: FOOD_CATEGORY_VALUES.find((c) => c === m.notCat) ?? null,
      };
    }
    // The guarantee, checked here and not left to the request path.
    const checked = UnderstandingSchema.safeParse(out);
    return checked.success ? (checked.data as Understanding) : unknown;
  } catch {
    return unknown;
  }
}

/** Client parse: an older deployed server answers without the newer fields. */
const ClientUnderstandingKinds = z.discriminatedUnion('kind', [
  z.object({
    ...searchFields,
    nearMe: z.boolean().optional().default(false),
    dishServes: z.array(z.string()).max(5).nullable().optional().default(null),
    wishes: searchExtras.wishes.optional().default([]),
    partySize: searchExtras.partySize.optional().default(null),
    clarify: searchExtras.clarify.optional().default(null),
    plan: searchExtras.plan.optional().default(null),
    tone: searchExtras.tone.optional().default(null),
    dishNote: searchExtras.dishNote.optional().default(null),
    meaning: searchExtras.meaning.optional().default(null),
    // No default: an older server does not read negations, and the app must not take that as "none".
    notCat: searchExtras.notCat.optional(),
  }),
  z.object({
    kind: z.literal('chat'),
    reply: z.string(),
    action: z.enum(CHAT_ACTIONS).optional().default('none'),
  }),
  z.object({ kind: z.literal('unknown') }),
]);
/** An older server still answers small talk as 'offtopic': read it as chat without an action. */
const OldOfftopic = z
  .object({ kind: z.literal('offtopic'), reply: z.string() })
  .transform((o) => ({ kind: 'chat' as const, reply: o.reply, action: 'none' as const }));
export const UnderstandingClientSchema = z.union([ClientUnderstandingKinds, OldOfftopic]);
type ServerUnderstanding = z.infer<typeof UnderstandingSchema>;
type ServerSearch = Extract<ServerUnderstanding, { kind: 'search' }>;
type SearchExtras = Pick<ServerSearch, keyof typeof searchExtras>;
/** The newer search fields are optional here: tests and older servers may omit them. */
export type Understanding =
  | Exclude<ServerUnderstanding, { kind: 'search' }>
  | (Omit<ServerSearch, keyof SearchExtras> & Partial<SearchExtras>);

/** No place names are sent: the model refers to results as {1}..{5}. */
export type NarrateRequest = {
  deviceId: string;
  messageId: string;
  city?: AiCityId;
  text: string;
  where: string;
  what: string;
  total: number;
  withParking: number;
  results: {
    n: number;
    kind: 'restaurant' | 'parking';
    distanceM: number;
    parkingM: number | null;
    /** Turkish category label as shown to the user; omitted for car parks. */
    cat?: string;
    /** 'unknown' when there are no readable hours. */
    open?: 'open' | 'closed' | 'unknown';
    /** Nearest car park is paid (null = unknown). */
    parkingPaid?: boolean | null;
    /** Fresh free spaces of the nearest car park; null when not fresh / unknown. */
    parkingFree?: number | null;
  }[];
};

export function understandSystem(city?: string): string {
  const c = promptCity(city);
  const place = cityExamples(c).a;
  return `Sen ${c.name} için bir otopark ve restoran uygulamasının (Yerim Var) yönlendiricisisin: kullanıcının HER mesajı önce sana gelir ve uygulamanın ne yapacağına sen karar verirsin. Mesaj hangi dilde olursa olsun (Türkçe, İngilizce, Almanca, Arapça ...; yazım hatası, ek ve argo olabilir) anlarsın ve verilen şemaya çevirirsin. Alan değerlerini her zaman standart Türkçe yazımıyla yaz (örneğin "kebab" -> dish "kebap", "${place}" -> district ya da place); serbest metinleri de dil ne olursa olsun Türkçe yaz.

Önce meaning alanına kullanıcının şu an ne istediğini kendi kısa cümlenle yaz (en çok 100 karakter, kullanıcıya gösterilmez). Önceki mesajlardaki isteği de kat: kullanıcı bir soruya kısa cevap verdiyse ("${place}") ya da isteğini sürdürüyorsa, önceki istekle birlikte yaz (örneğin önce "vejetaryenim" dediyse: "${place} civarında vejetaryen yemek istiyor"; "kas yapacak bir şey" için: "kas yapmak istiyor, protein ağırlıklı et ya da tavuk istiyor"). Sonra diğer bütün alanları bu anlama göre doldur: anladığın istek belli bir tür yemek gerektiriyorsa cat ve dish boş kalmasın.

Karar (kind):
- "search": kullanıcı yemek, restoran, otopark ya da bir yer arıyorsa; tek başına bir yemek ya da yer adı yazdıysa ("lahmacun", "${place}"); bir selamla başlayıp bir istek de bildiriyorsa ("Hi could you recommend me some food", "selam, köfte nerede yenir"); yeri söylemeden yemek önerisi istiyorsa ("acıktım", "recommend me something to eat": food true, nearMe true). Uygulama bu aramayı kendi verisiyle yapar; sen sonuç ya da bilgi vermezsin.
- "chat": selam, teşekkür, veda, uygulamanın kendisi ya da sohbet hakkında laf, "sence / sen seç" gibi seçimi sana bırakma, spor, haber, hava durumu gibi konu dışı sohbet. Hiçbir arama isteği yoksa.
- "unknown": ne istediği anlaşılmıyorsa.

Kurallar:
- Soruları ASLA gerçek bilgiyle cevaplama. Sen bilgi vermezsin, sadece mesajı şemaya çevirirsin.
- search: district (şehrin ilçesi ya da ""), cat (kategori ya da "none"), notCat (kullanıcının istemediğini söylediği kategori, örneğin "kebap olmasın", "tatlı istemem"; yoksa "none"), dish (yemek adı ya da ""), place (ilçe dışında bir yer/mekân adı ya da ""), food (yemek mi arıyor), requireParking (yanında otopark şart mı), appleQuery (Apple Haritalar'da aranacak kısa bir işletme/yer ifadesi ya da ""), nearMe (kullanıcı kendi çevresini mi istiyor), dishServes (aşağıya bak).
- Kullanıcı bir yemek ya da yiyecek adı veriyorsa food true olsun; dish alanına yemeği standart Türkçe yazımıyla yaz; cat alanına en yakın kategoriyi koy; dishServes alanına bu yemeği sunan yerlerin ADINDA geçebilecek en çok 5 kısa, küçük harfli Türkçe kelime yaz (dükkân türü kelimeleri: "börekçi", "kumpirci", "kebapçı", "pide" gibi, ya da yemeğin kendi adı). Asla işletme adı yazma; genel kelimeler (restoran, cafe, lokanta, yemek, mutfak) yazma. Yemek değilse dishServes boş dizi olsun.
- Mesajı kelime kelime değil, anlamıyla oku. Kullanıcı yemek adı yerine bir amaç, ruh hali, beslenme tarzı, durum, argo ya da emoji kullanabilir; ne yemek istediğini kendi aklınla çıkar, food true olsun ve isteği en iyi karşılayan kategoriyi (cat), yemeği (dish) ve dishServes kelimelerini sen seç. Örneğin "kas yapacak bir şey" protein (ızgara, et, tavuk) ister, "hafif bir şey" sağlıklı ve hafif yemek ister, "üşüdüm" sıcak bir çorba olabilir. Bunlar sadece örnek, liste değil: her ifadede aynı akıl yürütmeyi yap. İsteğe uymayan bir kategoriyi (örneğin protein için pastane) asla seçme. Bir istek birçok türde mekânda karşılanabiliyorsa (bir beslenme tarzı, bir amaç, bir durum) cat'i boş bırak, aramayı tek bir kategoriye daraltma; hangi yerin uyduğuna sonraki adımda ad ve türe bakılarak karar verilir. cat'i yalnızca kullanıcı gerçekten o kategoriyi istiyorsa seç.
- Ne istendiğini gerçekten çıkaramıyorsan tahmin etme, kind "unknown" döndür; uygulama kullanıcıya anlamadığını söyler.
- "yakınımda", "en yakın", "buralarda", "etrafta", "near me", "around here" gibi ifadelerde nearMe true olsun, yoksa false.
- wishes: kullanıcının dileklerini SADECE şu kodlarla yaz: cheap (ucuz), romantic, quiet (sakin), family (aile), kids (çocuk), group (kalabalık/grup), quick (hızlı), view (manzara), late (gece geç saate kadar açık), healthy, tasty (lezzetli), outdoor (açık hava/bahçe/teras); otopark için: free (ücretsiz), covered (kapalı otopark), nonstop (24 saat), safe (güvenli), big_vehicle (büyük/yüksek araç, karavan), motorcycle (motosiklet), disabled (engelli), overnight (gece boyu), rail (raylı sistem/metro yakını). Dilek yoksa boş dizi. Bu kodlar sadece etiket: onlar hakkında hiçbir bilgi verme.
- partySize: kaç kişi olduklarını söylediyse sayı, yoksa 0.
- clarifyAsk / clarifyText: ancak yeri (district), yemeği (dish), kişi sayısını (party), zamanı (time) ya da otoparkta ne kadar kalacağını (duration) bilmeden iyi bir arama yapılamayacaksa clarifyAsk'a sorunun konusunu (district, dish, party, time ya da duration) ve clarifyText'e sorunun cümlesini yaz; aksi halde clarifyAsk "none", clarifyText "" olsun.
- plan: kullanıcı önce park edip sonra yemek yemekten, bir yere gidip arabayı nereye bırakacağını sormaktan ya da belli bir zaman için (şimdi, bu akşam, öğle, akşam yemeği, birazdan) planlamaktan söz ediyorsa planWhen (now, tonight, lunch, dinner, later_today), değilse "none".
- chat: reply (1-2 kısa, sıcak, hafif esprili cümle, en çok 140 karakter) ve action (none, ask_food_or_park, suggest_examples, pick_from_last). Selama, teşekküre ve vedaya aynı türde karşılık ver ("iyi günler" -> "Size de iyi günler!"); konu dışı laflara kısaca gülümseyip yemek ya da otoparka dön. ask_food_or_park: ne arandığı belli değilse. suggest_examples: nasıl kullanılacağı sorulduysa. pick_from_last: kullanıcı seçimi sana bırakıyorsa VE aşağıda son cevapta kart olduğu yazıyorsa. Diğer durumlarda none. reply HİÇBİR olgu içermesin (skor, sonuç, hava durumu, haber yok); rakam, mekân adı, fiyat, "ücretsiz", otopark, mesafe, açık/kapalı iddiası, link, @, # içermesin, en çok bir emoji olsun, cümle ortasında büyük harfle başlayan sözcük (özel ad) olmasın; uygulama bu cevabı denetler ve kurala uymayanı atar.
- Şema tek düzdür: tüm alanlar her zaman yazılır; "verilmedi" demek için metinlerde "", kategori (cat, notCat)/clarifyAsk/planWhen/action alanlarında "none", partySize için 0, food/requireParking/nearMe için false, dishServes ve wishes için [] kullan. O kind'a ait olmayan alanlar bu boş değerlerde kalır. chat için reply ve action, search için diğer alanlar doldurulur.
- Sadece şemaya uygun JSON döndür.

SERBEST METİN: search için sadece şu üç alanda kendi cümleni yazabilirsin, hepsi boş ("") olabilir. Başka hiçbir alana metin yazma (chat reply yukarıdaki kurallara tabidir).
- tone (en çok 90 karakter, tek kısa samimi cümle): kullanıcının durumuna ya da dileğine sıcak bir karşılık, örneğin "Yıldönümünüz kutlu olsun!".
- clarifyText (en çok 80 karakter): sorunun cümlesi, örneğin "Hangi semtte yemek istersiniz?".
- dishNote (en çok 140 karakter): yemek bizim için bilinmiyorsa ya da egzotikse yemeğin KENDİSİ hakkında genel bilgi, örneğin "Kibbe, bulgur ve kıymayla yapılan, içli köfteye benzeyen bir Orta Doğu yemeğidir." Asla belirli bir mekân hakkında değil.
Bu üç alanda: rakam, saat, fiyat, mesafe, dakika, açık/kapalı, otopark, boş yer, "en iyi/lezzetli/meşhur", puan, yorum, menü, güvenlik, kamera, yükseklik, rezervasyon, mekân adı, link, @ ya da # yazma; yer hakkında hiçbir iddiada bulunma (sakin, romantik, manzaralı, ucuz, güvenli, yakın gibi). (clarifyText otopark kelimesini kullanabilir.) Bu alanlar uygulamada denetlenir ve kurala uymayan atılır.`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const UNDERSTAND_SYSTEM = understandSystem('izmir');

export function narrateSystem(city?: string): string {
  const c = promptCity(city);
  return `Sen ${c.name} için bir otopark ve restoran uygulamasının (Yerim Var) sesisin. Verilen sonuçları tanıtan 1-2 kısa, samimi Türkçe cümle yaz (${c.name} ağzı olabilir, "hocam" diyebilirsin).

Kurallar:
- Yerlerden SADECE {1}..{5} yer tutucularıyla söz et; isim uydurma.
- Sadece girdideki sayıları kullan (total, withParking, distanceM, parkingM, parkingFree).
- Puan, yıldız, lezzet, fiyat, açılış-kapanış saati ya da girdide olmayan hiçbir şeyden söz etme.
- open, parkingPaid ve parkingFree alanlarını SADECE verildiği gibi kullan. open "unknown" ise açık ya da kapalı deme. parkingFree null ise boş yer sayısından söz etme; parkingPaid null ise ücretli ya da ücretsiz deme.
- Fiyat, puan ve saat uydurma.
- Her yer için en fazla bir ya da iki bilgi ver (örneğin kategori, açık mı, otopark ücretli mi, boş yer sayısı).
- Cevap 1-2 cümle olsun.`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const NARRATE_SYSTEM = narrateSystem('izmir');

export const OPEN_STATES = ['open', 'closed', 'unknown'] as const;
export type OpenStateCode = (typeof OPEN_STATES)[number];
export const DISH_MATCHES = ['named', 'likely', 'none'] as const;
export type DishMatch = (typeof DISH_MATCHES)[number];

/** Why a place was picked. Each code is a claim the app re-checks against its own data. */
export const PICK_REASONS = [
  'closest',
  'open_now',
  'open_late',
  'free_parking',
  'parking_close',
  'most_free_spots',
  'dish_named',
  'outdoor',
  // The model judged, from name and type, that the place fits the request; shown as its judgment.
  'fits_request',
] as const;
export type PickReason = (typeof PICK_REASONS)[number];
export const MAX_REASONS = 3;

/** Job 2. Facts only: no names, so nothing the model could repeat. `i` is the list position. */
export type PickCandidate = {
  i: number;
  kind: 'restaurant';
  /** The place's name in our data (public business name), for judging fit only. */
  name?: string;
  /** Its category, kind and cuisines in words ("Kahvaltı, pastane"), for judging fit only. */
  type?: string;
  /** Rough walk from the search point. */
  walkMin: number;
  openState: OpenStateCode;
  /** Closes at 22:00 or later, or is open 24 hours. */
  closesLate: boolean;
  /** Metres to the nearest car park, null when none within reach. */
  parkingM: number | null;
  /** The nearest car park is free of charge (null = unknown). */
  parkingFree: boolean | null;
  /** Fresh free spaces of the nearest car park (null = not fresh / unknown). */
  freeSpots: number | null;
  dishMatch: DishMatch;
  outdoor: boolean | null;
};

export type PickRequest = {
  deviceId: string;
  messageId: string;
  city?: AiCityId;
  text: string;
  candidates: PickCandidate[];
};

/** Output schema for `n` candidates: every index is bounded by construction. */
export function pickOutputSchema(n: number) {
  const idx = z
    .number()
    .int()
    .min(0)
    .max(Math.max(0, n - 1));
  return z.object({
    /** Candidates that fit what the user asked for, best first; [] when any place will do. */
    fit: z.array(idx).max(MAX_FIT),
    /** The user asked for something none of the candidates seems to offer. */
    noneFit: z.boolean(),
    pick: idx,
    reasons: z.array(z.enum(PICK_REASONS)).max(MAX_REASONS),
    runnerUp: idx.nullable(),
    runnerUpWhy: z.enum(PICK_REASONS).nullable(),
    /** Z1: one short friendly line, validated by the app (validateFreeText). */
    tone: z.string().nullable(),
  });
}
export type PickResponse = z.infer<ReturnType<typeof pickOutputSchema>>;

/**
 * What the model is asked for in /pick (restaurants): the same fields without the array cap and
 * with a separate index schema per field, so the generated JSON schema has no `$defs` (see
 * UnderstandingModelSchema). The worker caps `reasons` and then checks pickOutputSchema.
 */
export function pickModelSchema(n: number) {
  const max = Math.max(0, n - 1);
  // fit / noneFit come first: the model judges what fits before it picks.
  return z.object({
    fit: z.array(z.number().int().min(0).max(max)),
    noneFit: z.boolean(),
    pick: z.number().int().min(0).max(max),
    reasons: z.array(z.enum(PICK_REASONS)),
    runnerUp: z.number().int().min(0).max(max).nullable(),
    runnerUpWhy: z.enum(PICK_REASONS).nullable(),
    tone: z.string().nullable(),
  });
}

/** The model output with its reason list cut to MAX_REASONS, ready for the strict output schema. */
export function capReasons<T>(out: T): T {
  if (typeof out !== 'object' || out === null) return out;
  const o = out as { reasons?: unknown };
  return Array.isArray(o.reasons) ? { ...out, reasons: o.reasons.slice(0, MAX_REASONS) } : out;
}

/** Car park picks (park section): same job, different facts and reason codes. */
export const PARK_REASONS = [
  'closest',
  'free',
  'nonstop',
  'open_now',
  'most_free_spots',
  'near_rail',
  'covered',
  'big_capacity',
] as const;
export type ParkReason = (typeof PARK_REASONS)[number];
/** "big_capacity" is true from this many spaces up. */
export const PARK_BIG_CAPACITY = 200;

export type ParkPickCandidate = {
  i: number;
  kind: 'parking';
  walkMin: number;
  openState: OpenStateCode;
  nonstop: boolean;
  /** Free of charge (null = unknown). */
  free: boolean | null;
  /** We hold a tariff for this car park. */
  tariffKnown: boolean;
  /** Indoor / multi-storey (null = unknown). */
  covered: boolean | null;
  /** Fresh free spaces (null = not fresh / unknown / not now). */
  freeSpots: number | null;
  nearRail: boolean;
  capacity: number | null;
};

export type ParkPickRequest = {
  deviceId: string;
  messageId: string;
  city?: AiCityId;
  text: string;
  candidates: ParkPickCandidate[];
};

export function parkPickOutputSchema(n: number) {
  const idx = z
    .number()
    .int()
    .min(0)
    .max(Math.max(0, n - 1));
  return z.object({
    pick: idx,
    reasons: z.array(z.enum(PARK_REASONS)).max(MAX_REASONS),
    runnerUp: idx.nullable(),
    runnerUpWhy: z.enum(PARK_REASONS).nullable(),
    tone: z.string().nullable(),
  });
}
export type ParkPickResponse = z.infer<ReturnType<typeof parkPickOutputSchema>>;

/** What the model is asked for in /pick (car parks); see pickModelSchema. */
export function parkPickModelSchema(n: number) {
  const max = Math.max(0, n - 1);
  return z.object({
    pick: z.number().int().min(0).max(max),
    reasons: z.array(z.enum(PARK_REASONS)),
    runnerUp: z.number().int().min(0).max(max).nullable(),
    runnerUpWhy: z.enum(PARK_REASONS).nullable(),
    tone: z.string().nullable(),
  });
}

/** Job 4. A car park option of one restaurant; `p` is unique across the whole request. */
export type PlanParking = {
  p: number;
  /** Rough walk from the car park to the restaurant. */
  walkMin: number;
  parkingFree: boolean | null;
  /** Only sent for "now": a count is not known for a later time. */
  freeSpots: number | null;
  openState: OpenStateCode;
};

export type PlanCandidate = {
  i: number;
  kind: 'restaurant';
  walkMin: number;
  /** Open state at the planned time. */
  openState: OpenStateCode;
  closesLate: boolean;
  dishMatch: DishMatch;
  outdoor: boolean | null;
  parkings: PlanParking[];
};

export type PlanRequest = {
  deviceId: string;
  messageId: string;
  city?: AiCityId;
  text: string;
  when: PlanWhen;
  candidates: PlanCandidate[];
};

export function planOutputSchema(restaurants: number, parkings: number) {
  const r = z
    .number()
    .int()
    .min(0)
    .max(Math.max(0, restaurants - 1));
  const p = z
    .number()
    .int()
    .min(0)
    .max(Math.max(0, parkings - 1));
  return z.object({
    restaurant: r,
    parking: p,
    reasons: z.array(z.enum(PICK_REASONS)).max(MAX_REASONS),
    tone: z.string().nullable(),
  });
}
export type PlanResponse = z.infer<ReturnType<typeof planOutputSchema>>;

/** What the model is asked for in /plan; see pickModelSchema. */
export function planModelSchema(restaurants: number, parkings: number) {
  return z.object({
    restaurant: z
      .number()
      .int()
      .min(0)
      .max(Math.max(0, restaurants - 1)),
    parking: z
      .number()
      .int()
      .min(0)
      .max(Math.max(0, parkings - 1)),
    reasons: z.array(z.enum(PICK_REASONS)),
    tone: z.string().nullable(),
  });
}

/**
 * The model's /pick answer (restaurants or car parks) as the strict output for `n` candidates, or
 * null when it is unusable (no valid `pick` index). TOTAL: never throws. An out-of-range
 * `runnerUp` or an unknown code is dropped, reasons are deduplicated and capped, `tone` is cut.
 * Used by the worker before it answers and by the app on what it receives.
 */
export function toPick(
  raw: unknown,
  n: number,
  park = false,
): PickResponse | ParkPickResponse | null {
  try {
    if (!isObject(raw)) return null;
    const max = Math.max(0, n - 1);
    const pick = index(raw.pick, max);
    if (pick === null) return null;
    const allowed: readonly string[] = park ? PARK_REASONS : PICK_REASONS;
    const why = allowed.find((r) => r === raw.runnerUpWhy);
    const fit = (Array.isArray(raw.fit) ? raw.fit : [])
      .map((v) => index(v, max))
      .filter((v): v is number => v !== null)
      .filter((v, k, all) => all.indexOf(v) === k)
      .slice(0, MAX_FIT);
    // A malformed nonempty fit list must not become "any candidate will do".
    if (!park && Array.isArray(raw.fit) && raw.fit.length > 0 && !fit.includes(pick)) return null;
    const out = {
      // Restaurants only: an older worker or a car park pick has no fit.
      ...(park ? {} : { fit, noneFit: raw.noneFit === true }),
      pick,
      reasons: codes(raw.reasons, allowed, MAX_REASONS),
      runnerUp: index(raw.runnerUp, max),
      runnerUpWhy: why ?? null,
      tone: given(raw.tone),
    };
    const checked = (park ? parkPickOutputSchema(n) : pickOutputSchema(n)).safeParse(out);
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

/** The model's /plan answer as the strict output, or null when a chosen index is out of range. Total. */
export function toPlan(raw: unknown, restaurants: number, parkings: number): PlanResponse | null {
  try {
    if (!isObject(raw)) return null;
    const restaurant = index(raw.restaurant, Math.max(0, restaurants - 1));
    const parking = index(raw.parking, Math.max(0, parkings - 1));
    if (restaurant === null || parking === null) return null;
    const checked = planOutputSchema(restaurants, parkings).safeParse({
      restaurant,
      parking,
      reasons: codes(raw.reasons, PICK_REASONS, MAX_REASONS),
      tone: given(raw.tone),
    });
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

const LIMITS_TR = `Sınırlar (uygulama bunları ayrıca denetler, uymayan sonuç atılır):
- Sadece verilen indekslerden birini seç; yeni indeks ya da isim uydurma.
- reasons yalnızca verilen koddan seçilir ve SADECE o adayın verilerinde gerçekten doğruysa yazılır; emin değilsen yazma.
- Fiyat, ortam, gürültü, yorum, menü, çocuk olanakları hakkında hiçbir verimiz yok; bunlara dayanarak seçim yapma ve bunlar hakkında bir şey söyleme.
- tone serbest metindir (en çok 90 karakter, tek kısa samimi cümle) ya da null: rakam, saat, fiyat, mesafe, açık/kapalı, otopark, boş yer, mekân adı, "en iyi/lezzetli", puan, yorum, link ve yer hakkında hiçbir iddia içermesin; sadece kullanıcının durumuna sıcak bir karşılık olsun (örneğin "Kalabalık bir grup için rahat bir seçim yapalım."). Başka hiçbir alana metin yazma.`;

export function pickSystem(city?: string): string {
  const c = promptCity(city);
  return `Sen ${c.name} için bir restoran ve otopark uygulamasının (Yerim Var) seçicisisin. Kullanıcının mesajına ve adayların verilerine bakıp en uygun adayı seçersin.

Her aday: i (indeks), name (yerin adı), type (kategorisi, türü ve mutfağı), walkMin (yürüme dk), openState (open/closed/unknown), closesLate, parkingM (otopark mesafesi), parkingFree (otopark ücretsiz mi), freeSpots (güncel boş yer), dishMatch (named/likely/none), outdoor.

Önce isteğe uygunluğa karar ver: kullanıcı ne istiyor (bir yemek, bir amaç ya da beslenme tarzı: kas yapmak, vejetaryen, hafif, tatlı, çocukla gitmek ...)? Her adayın adına ve türüne bakıp hangilerinin bu isteğe uyduğunu kendi aklınla değerlendir. Menü bilgimiz yok; sadece ad ve türden makul bir çıkarım yap. Uymak, yalnızca o işe özel bir yer olmak demek değildir: kullanıcının orada isteğine uygun bir şey bulup yiyebileceği her yer uyar; yalnızca isteğe açıkça ters düşen yerler uymaz (örneğin vejetaryen biri ev yemekleri yapan bir lokantada sebze yemeği, pidecide peynirli pide bulabilir ama sadece et yapan bir yer ona uymaz; protein isteyen biri lokantada, pidecide, döner ya da tavuk yapan bir yerde doyabilir ama yalnızca kahve ve tatlı satan bir yerde doyamaz). Bunlar sadece örnek: her istekte aynı akıl yürütmeyi yap. Kullanıcı yemek yemek istiyorsa, doyurucu bir öğün bulabileceği yerleri yalnızca kahve, tatlı ya da atıştırmalık sunan yerlerin önüne koy.
type içinde "Vegan", "Vejetaryen", "Vejetaryen seçenek var", "Pesketaryen", "Helal" gibi beslenme bilgileri bizim verimizdir, tahmin değildir: varsa ad ve türden yaptığın çıkarımdan önce bunlara güven.
Adayların bir kısmı arama alanının biraz dışındadır (walkMin daha büyük). İsteğe uyan yakın bir aday varsa onu seç; daha uzaktakini ancak yakındakilerden hiçbiri isteğe uymuyorsa ya da açıkça çok daha iyi uyuyorsa (örneğin vejetaryen için tamamen vejetaryen bir yer) seç.
Çıktı:
- fit: isteğe uyan adayların indeksleri, en uygundan başlayarak, en çok 5. Kullanıcı belirli bir şey istemiyorsa (her yer olur) boş dizi.
- noneFit: kullanıcı belirli bir şey istiyor ama hiçbir aday buna uymuyorsa true, yoksa false.
- pick: seçtiğin aday; fit boş değilse fit içinden olmalı.
- reasons: en çok 3 kod: closest, open_now, open_late, free_parking, parking_close, most_free_spots, dish_named, outdoor, fits_request (seçtiğin aday fit içindeyse).
- runnerUp (ikinci tercih ya da null; fit boş değilse fit içinden), runnerUpWhy (tek kod ya da null), tone.

${LIMITS_TR}`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const PICK_SYSTEM = pickSystem('izmir');

export function parkPickSystem(city?: string): string {
  const c = promptCity(city);
  return `Sen ${c.name} için bir otopark ve restoran uygulamasının (Yerim Var) seçicisisin. Kullanıcının mesajına ve otoparkların verilerine bakıp en uygun otoparkı seçersin.

Her aday: i (indeks), walkMin (hedefe yürüme dk), openState (open/closed/unknown), nonstop (24 saat), free (ücretsiz mi), tariffKnown, covered (kapalı/katlı mı), freeSpots (güncel boş yer), nearRail (raylı sisteme yakın mı), capacity.
Çıktı: pick (seçtiğin aday), reasons (en çok 3 kod: closest, free, nonstop, open_now, most_free_spots, near_rail, covered, big_capacity), runnerUp (ikinci tercih ya da null), runnerUpWhy (tek kod ya da null), tone.

${LIMITS_TR}
- Güvenlik, kamera, araç yüksekliği, motosiklet ya da rezervasyon hakkında hiçbir verimiz yok; bunlara dayanarak seçim yapma ve bunlar hakkında bir şey söyleme.`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const PARK_PICK_SYSTEM = parkPickSystem('izmir');

export function planSystem(city?: string): string {
  const c = promptCity(city);
  return `Sen ${c.name} için bir restoran ve otopark uygulamasının (Yerim Var) planlayıcısısın. Kullanıcı bir saatte arabayı bırakıp yemek yemek istiyor. Verilen restoranlardan ve her birinin otopark seçeneklerinden birer tane seçersin.

Her restoran: i, walkMin (kullanıcıdan yürüme dk), openState (planlanan saatte), closesLate, dishMatch, outdoor, parkings (p: otopark indeksi, walkMin: otoparktan restorana yürüme dk, parkingFree, freeSpots, openState).
Çıktı: restaurant (restoran indeksi i), parking (o restoranın kendi otoparklarından birinin p değeri; başka restoranın otoparkını seçme), reasons (en çok 3 kod: closest, open_now, open_late, free_parking, parking_close, most_free_spots, dish_named, outdoor), tone.

${LIMITS_TR}`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const PLAN_SYSTEM = planSystem('izmir');

// --- Small talk (/chat): greetings, thanks, goodbyes and talk about the chat itself --------------

export const MAX_CHAT_CHARS = 300;
export const CHAT_HISTORY_LIMIT = 4;

export type ChatRequest = {
  deviceId: string;
  messageId: string;
  city?: AiCityId;
  text: string;
  /** The last four turns at most. */
  history: ChatTurn[];
  /** What the last bot reply showed (no names): lets the model suggest "pick_from_last". */
  lastCards?: { count: number; kind: 'restaurant' | 'parking' };
};

/** Server format schema and client parse: the reply is free text, the action a code. */
export const chatOutputSchema = z.object({
  reply: z.string(),
  action: z.enum(CHAT_ACTIONS),
});
export type ChatResponse = z.infer<typeof chatOutputSchema>;

/** The model's /chat answer as the strict output; an unknown action is "none", anything unreadable an empty reply. Total. */
export function toChat(raw: unknown): ChatResponse {
  const m = isObject(raw) ? raw : {};
  return {
    reply: typeof m.reply === 'string' ? clipText(m.reply, MAX_FIELD_CHARS) : '',
    action: CHAT_ACTIONS.find((a) => a === m.action) ?? 'none',
  };
}

export function chatSystem(city?: string): string {
  const c = promptCity(city);
  return `Sen "Yerim" adlı samimi bir Türkçe sohbet asistanısın: ${c.locative} yemek ve otopark bulmaya yardım eden uygulamanın (Yerim Var) sesisin. Kullanıcı selam veriyor, teşekkür ediyor, vedalaşıyor ya da sohbetin kendisi hakkında bir şey söylüyor.

Çıktı: reply (1-2 kısa, sıcak cümle, en çok 140 karakter) ve action (none, ask_food_or_park, pick_from_last, suggest_examples).
- Selama, teşekküre ve vedaya aynı türde karşılık ver ("iyi günler" -> "Size de iyi günler!").
- Sohbeti nazikçe yemek ya da otopark aramaya yönlendir.
- ask_food_or_park: ne arandığı belli değilse. suggest_examples: nasıl kullanılacağı sorulduysa. pick_from_last: kullanıcı "sence", "sen seç" gibi seçimi sana bırakıyorsa ve son cevapta kartlar varsa. Diğer durumlarda none.
- Yerler, fiyatlar, çalışma saatleri, otopark durumu, mesafeler hakkında HİÇBİR bilgi ya da iddia verme; mekân adı yazma.
- Rakam, link, @ ya da # kullanma; en çok bir emoji.
- Uygulamanın dışındaki konularda (maç, hava, siyaset) kısaca gülümseyip yemek ya da otoparka dön.`;
}

/** The İzmir prompt (the default; scripts/ai-eval.ts reads it). */
export const CHAT_SYSTEM = chatSystem('izmir');

export function fillPlaceholders(reply: string, names: string[]): string {
  return reply.replace(/\{(\d+)\}/g, (m, n: string) => names[Number(n) - 1] ?? m);
}

/** Words the narration must never contain (folded; matched at the start of a word). */
export const BLOCK = [
  'puan',
  'yildiz',
  'fiyat',
  'lira',
  'tl',
  'ucuz',
  'pahali',
  'lezzet',
  'skor',
  'gol',
  'saat',
];

/** Facts that unlock otherwise blocked words (see GATED). */
export type ReplyFacts = { anyOpen: boolean; anyClosed: boolean; anyFree: boolean };

/** Blocked unless the matching fact is present in the narrate payload. */
const GATED: { word: string; fact: keyof ReplyFacts }[] = [
  { word: 'acik', fact: 'anyOpen' },
  { word: 'kapali', fact: 'anyClosed' },
  { word: 'bos yer', fact: 'anyFree' },
  { word: 'dolu', fact: 'anyFree' },
];

export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGroundedReply(
  reply: string,
  allowedNumbers: number[],
  resultCount: number,
  facts?: ReplyFacts,
): boolean {
  if (reply.length > 400) return false;
  for (const m of reply.matchAll(/\{(-?\d+)\}/g)) {
    const n = Number(m[1]);
    if (n < 1 || n > resultCount) return false;
  }
  for (const m of reply.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (allowedNumbers.includes(n)) continue;
    if (n >= 1 && n <= resultCount) continue;
    return false;
  }
  const padded = ` ${fold(reply)}`;
  if (BLOCK.some((w) => padded.includes(` ${w}`))) return false;
  return !GATED.some((g) => padded.includes(` ${g.word}`) && !facts?.[g.fact]);
}

/** Today's date (YYYY-MM-DD) in Istanbul (UTC+3, no DST). */
export function todayIstanbul(now: Date | string | number = new Date()): string {
  return new Date(new Date(now).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
