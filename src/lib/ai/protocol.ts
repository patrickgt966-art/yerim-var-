// Shared by the app and the Cloudflare Worker: keep this file free of React / RN imports.
import { z } from 'zod';

import type { FoodCategory } from '../../data/restaurants';

export const FREE_DAILY = 10;
export const SUB_DAILY = 200;
export const MAX_MESSAGE_CHARS = 200;
export const HISTORY_LIMIT = 6;
export const MAX_RESULTS = 5;
/** /pick and /plan: candidate restaurants per request, and car parks per restaurant (plan). */
export const MAX_CANDIDATES = 5;
export const MAX_PLAN_PARKINGS = 3;

export type ChatTurn = { role: 'user' | 'bot'; text: string };

export type UnderstandRequest = {
  deviceId: string;
  messageId: string;
  text: string;
  history: ChatTurn[];
  section: 'park' | 'food';
};

export type QuotaRequest = { deviceId: string };

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
};

/** Server format schema: structured outputs need every field present. */
export const UnderstandingSchema = z.discriminatedUnion('kind', [
  z.object({
    ...searchFields,
    nearMe: z.boolean(),
    dishServes: z.array(z.string()).max(5).nullable(),
    ...searchExtras,
  }),
  z.object({ kind: z.literal('offtopic'), reply: z.string() }),
  z.object({ kind: z.literal('unknown') }),
]);

/** Client parse: an older deployed server answers without the newer fields. */
export const UnderstandingClientSchema = z.discriminatedUnion('kind', [
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
  }),
  z.object({ kind: z.literal('offtopic'), reply: z.string() }),
  z.object({ kind: z.literal('unknown') }),
]);
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

export const UNDERSTAND_SYSTEM = `Sen İzmir için bir otopark ve restoran uygulamasının (Yerim Var) mesaj çevirmenisin. Kullanıcının Türkçe mesajını (yazım hataları, ek ve argo olabilir) verilen şemaya çevirirsin.

Kurallar:
- Soruları ASLA gerçek bilgiyle cevaplama. Sen bilgi vermezsin, sadece mesajı şemaya çevirirsin.
- Kullanıcı bir yer, otopark ya da yemek arıyorsa kind "search" döndür: district (İzmir ilçesi ya da null), cat (kategori ya da null), dish (yemek adı ya da null), place (ilçe dışında bir yer/mekân adı ya da null), food (yemek mi arıyor), requireParking (yanında otopark şart mı), appleQuery (Apple Haritalar'da aranacak kısa bir işletme/yer ifadesi ya da null), nearMe (kullanıcı kendi çevresini mi istiyor), dishServes (aşağıya bak).
- Kullanıcı bir yemek ya da yiyecek adı veriyorsa food true olsun; dish alanına yemeği standart Türkçe yazımıyla yaz; cat alanına en yakın kategoriyi koy; dishServes alanına bu yemeği sunan yerlerin ADINDA geçebilecek en çok 5 kısa, küçük harfli Türkçe kelime yaz (dükkân türü kelimeleri: "börekçi", "kumpirci", "kebapçı", "pide" gibi, ya da yemeğin kendi adı). Asla işletme adı yazma; genel kelimeler (restoran, cafe, lokanta, yemek, mutfak) yazma. Yemek değilse dishServes null olsun.
- "yakınımda", "en yakın", "buralarda", "etrafta" gibi ifadelerde nearMe true olsun, yoksa false.
- wishes: kullanıcının dileklerini SADECE şu kodlarla yaz: cheap (ucuz), romantic, quiet (sakin), family (aile), kids (çocuk), group (kalabalık/grup), quick (hızlı), view (manzara), late (gece geç saate kadar açık), healthy, tasty (lezzetli), outdoor (açık hava/bahçe/teras); otopark için: free (ücretsiz), covered (kapalı otopark), nonstop (24 saat), safe (güvenli), big_vehicle (büyük/yüksek araç, karavan), motorcycle (motosiklet), disabled (engelli), overnight (gece boyu), rail (metro/İZBAN yakını). Dilek yoksa boş dizi. Bu kodlar sadece etiket: onlar hakkında hiçbir bilgi verme.
- partySize: kaç kişi olduklarını söylediyse sayı, yoksa null.
- clarify: ancak yeri (district), yemeği (dish), kişi sayısını (party), zamanı (time) ya da otoparkta ne kadar kalacağını (duration) bilmeden iyi bir arama yapılamayacaksa {ask, text} döndür; aksi halde null. ask sadece district, dish, party, time ya da duration olabilir.
- plan: kullanıcı önce park edip sonra yemek yemekten, bir yere gidip arabayı nereye bırakacağını sormaktan ya da belli bir zaman için (şimdi, bu akşam, öğle, akşam yemeği, birazdan) planlamaktan söz ediyorsa {when} (now, tonight, lunch, dinner, later_today), değilse null.
- Sohbet, spor, haber, hava durumu gibi konularda kind "offtopic" döndür ve reply alanına kısa, sıcak, esprili, en çok 2 cümlelik ve en çok 120 karakterlik bir Türkçe cevap yaz. Bu cevap HİÇBİR olgu içermesin (skor, sonuç, hava durumu, haber yok), rakam, mekân adı, fiyat, "ücretsiz", otopark ya da açık/kapalı iddiası içermesin ve konuyu yemeğe çevirsin; uygulama bu cevabı denetler ve kurala uymayanı atar.
- Ne istediği anlaşılmıyorsa kind "unknown" döndür.
- Sadece şemaya uygun JSON döndür.

SERBEST METİN: sadece şu üç alanda kendi cümleni yazabilirsin, hepsi null olabilir. Başka hiçbir alana metin yazma.
- tone (en çok 90 karakter, tek kısa samimi cümle): kullanıcının durumuna ya da dileğine sıcak bir karşılık, örneğin "Yıldönümünüz kutlu olsun!".
- clarify.text (en çok 80 karakter): sorunun cümlesi, örneğin "Hangi semtte yemek istersiniz?".
- dishNote (en çok 140 karakter): yemek bizim için bilinmiyorsa ya da egzotikse yemeğin KENDİSİ hakkında genel bilgi, örneğin "Kibbe, bulgur ve kıymayla yapılan, içli köfteye benzeyen bir Orta Doğu yemeğidir." Asla belirli bir mekân hakkında değil.
Bu üç alanda: rakam, saat, fiyat, mesafe, dakika, açık/kapalı, otopark, boş yer, "en iyi/lezzetli/meşhur", puan, yorum, menü, güvenlik, kamera, yükseklik, rezervasyon, mekân adı, link, @ ya da # yazma; yer hakkında hiçbir iddiada bulunma (sakin, romantik, manzaralı, ucuz, güvenli, yakın gibi). (clarify.text otopark kelimesini kullanabilir.) Bu alanlar uygulamada denetlenir ve kurala uymayan atılır.`;

export const NARRATE_SYSTEM = `Sen İzmir için bir otopark ve restoran uygulamasının (Yerim Var) sesisin. Verilen sonuçları tanıtan 1-2 kısa, samimi Türkçe cümle yaz (İzmir ağzı olabilir, "hocam" diyebilirsin).

Kurallar:
- Yerlerden SADECE {1}..{5} yer tutucularıyla söz et; isim uydurma.
- Sadece girdideki sayıları kullan (total, withParking, distanceM, parkingM, parkingFree).
- Puan, yıldız, lezzet, fiyat, açılış-kapanış saati ya da girdide olmayan hiçbir şeyden söz etme.
- open, parkingPaid ve parkingFree alanlarını SADECE verildiği gibi kullan. open "unknown" ise açık ya da kapalı deme. parkingFree null ise boş yer sayısından söz etme; parkingPaid null ise ücretli ya da ücretsiz deme.
- Fiyat, puan ve saat uydurma.
- Her yer için en fazla bir ya da iki bilgi ver (örneğin kategori, açık mı, otopark ücretli mi, boş yer sayısı).
- Cevap 1-2 cümle olsun.`;

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
] as const;
export type PickReason = (typeof PICK_REASONS)[number];
export const MAX_REASONS = 3;

/** Job 2. Facts only: no names, so nothing the model could repeat. `i` is the list position. */
export type PickCandidate = {
  i: number;
  kind: 'restaurant';
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
    pick: idx,
    reasons: z.array(z.enum(PICK_REASONS)).max(MAX_REASONS),
    runnerUp: idx.nullable(),
    runnerUpWhy: z.enum(PICK_REASONS).nullable(),
    /** Z1: one short friendly line, validated by the app (validateFreeText). */
    tone: z.string().nullable(),
  });
}
export type PickResponse = z.infer<ReturnType<typeof pickOutputSchema>>;

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

const LIMITS_TR = `Sınırlar (uygulama bunları ayrıca denetler, uymayan sonuç atılır):
- Sadece verilen indekslerden birini seç; yeni indeks ya da isim uydurma.
- reasons yalnızca verilen koddan seçilir ve SADECE o adayın verilerinde gerçekten doğruysa yazılır; emin değilsen yazma.
- Fiyat, ortam, gürültü, yorum, menü, çocuk olanakları hakkında hiçbir verimiz yok; bunlara dayanarak seçim yapma ve bunlar hakkında bir şey söyleme.
- tone serbest metindir (en çok 90 karakter, tek kısa samimi cümle) ya da null: rakam, saat, fiyat, mesafe, açık/kapalı, otopark, boş yer, mekân adı, "en iyi/lezzetli", puan, yorum, link ve yer hakkında hiçbir iddia içermesin; sadece kullanıcının durumuna sıcak bir karşılık olsun (örneğin "Kalabalık bir grup için rahat bir seçim yapalım."). Başka hiçbir alana metin yazma.`;

export const PICK_SYSTEM = `Sen İzmir için bir restoran ve otopark uygulamasının (Yerim Var) seçicisisin. Kullanıcının mesajına ve adayların verilerine bakıp en uygun adayı seçersin.

Her aday: i (indeks), walkMin (yürüme dk), openState (open/closed/unknown), closesLate, parkingM (otopark mesafesi), parkingFree (otopark ücretsiz mi), freeSpots (güncel boş yer), dishMatch (named/likely/none), outdoor.
Çıktı: pick (seçtiğin aday), reasons (en çok 3 kod: closest, open_now, open_late, free_parking, parking_close, most_free_spots, dish_named, outdoor), runnerUp (ikinci tercih ya da null), runnerUpWhy (tek kod ya da null), tone.

${LIMITS_TR}`;

export const PARK_PICK_SYSTEM = `Sen İzmir için bir otopark ve restoran uygulamasının (Yerim Var) seçicisisin. Kullanıcının mesajına ve otoparkların verilerine bakıp en uygun otoparkı seçersin.

Her aday: i (indeks), walkMin (hedefe yürüme dk), openState (open/closed/unknown), nonstop (24 saat), free (ücretsiz mi), tariffKnown, covered (kapalı/katlı mı), freeSpots (güncel boş yer), nearRail (raylı sisteme yakın mı), capacity.
Çıktı: pick (seçtiğin aday), reasons (en çok 3 kod: closest, free, nonstop, open_now, most_free_spots, near_rail, covered, big_capacity), runnerUp (ikinci tercih ya da null), runnerUpWhy (tek kod ya da null), tone.

${LIMITS_TR}
- Güvenlik, kamera, araç yüksekliği, motosiklet ya da rezervasyon hakkında hiçbir verimiz yok; bunlara dayanarak seçim yapma ve bunlar hakkında bir şey söyleme.`;

export const PLAN_SYSTEM = `Sen İzmir için bir restoran ve otopark uygulamasının (Yerim Var) planlayıcısısın. Kullanıcı bir saatte arabayı bırakıp yemek yemek istiyor. Verilen restoranlardan ve her birinin otopark seçeneklerinden birer tane seçersin.

Her restoran: i, walkMin (kullanıcıdan yürüme dk), openState (planlanan saatte), closesLate, dishMatch, outdoor, parkings (p: otopark indeksi, walkMin: otoparktan restorana yürüme dk, parkingFree, freeSpots, openState).
Çıktı: restaurant (restoran indeksi i), parking (o restoranın kendi otoparklarından birinin p değeri; başka restoranın otoparkını seçme), reasons (en çok 3 kod: closest, open_now, open_late, free_parking, parking_close, most_free_spots, dish_named, outdoor), tone.

${LIMITS_TR}`;

// --- Small talk (/chat): greetings, thanks, goodbyes and talk about the chat itself --------------

/** What the app does besides showing the reply; the chips and the pick come from app code. */
export const CHAT_ACTIONS = [
  'none',
  'ask_food_or_park',
  'pick_from_last',
  'suggest_examples',
] as const;
export type ChatReplyAction = (typeof CHAT_ACTIONS)[number];
export const MAX_CHAT_CHARS = 300;
export const CHAT_HISTORY_LIMIT = 4;

export type ChatRequest = {
  deviceId: string;
  messageId: string;
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

export const CHAT_SYSTEM = `Sen "Yerim" adlı samimi bir Türkçe sohbet asistanısın: İzmir'de yemek ve otopark bulmaya yardım eden uygulamanın (Yerim Var) sesisin. Kullanıcı selam veriyor, teşekkür ediyor, vedalaşıyor ya da sohbetin kendisi hakkında bir şey söylüyor.

Çıktı: reply (1-2 kısa, sıcak cümle, en çok 140 karakter) ve action (none, ask_food_or_park, pick_from_last, suggest_examples).
- Selama, teşekküre ve vedaya aynı türde karşılık ver ("iyi günler" -> "Size de iyi günler!").
- Sohbeti nazikçe yemek ya da otopark aramaya yönlendir.
- ask_food_or_park: ne arandığı belli değilse. suggest_examples: nasıl kullanılacağı sorulduysa. pick_from_last: kullanıcı "sence", "sen seç" gibi seçimi sana bırakıyorsa ve son cevapta kartlar varsa. Diğer durumlarda none.
- Yerler, fiyatlar, çalışma saatleri, otopark durumu, mesafeler hakkında HİÇBİR bilgi ya da iddia verme; mekân adı yazma.
- Rakam, link, @ ya da # kullanma; en çok bir emoji.
- Uygulamanın dışındaki konularda (maç, hava, siyaset) kısaca gülümseyip yemek ya da otoparka dön.`;

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
