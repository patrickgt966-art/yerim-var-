// Shared by the app and the Cloudflare Worker: keep this file free of React / RN imports.
import { z } from 'zod';

import type { FoodCategory } from '../../data/restaurants';

export const FREE_DAILY = 5;
export const SUB_DAILY = 200;
export const MAX_MESSAGE_CHARS = 200;
export const HISTORY_LIMIT = 6;
export const MAX_RESULTS = 5;

export type ChatTurn = { role: 'user' | 'bot'; text: string };

export type UnderstandRequest = {
  deviceId: string;
  messageId: string;
  text: string;
  history: ChatTurn[];
  section: 'park' | 'food';
};

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
  'dessert',
] as const satisfies readonly FoodCategory[];

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

/** Server format schema: structured outputs need every field present. */
export const UnderstandingSchema = z.discriminatedUnion('kind', [
  z.object({
    ...searchFields,
    nearMe: z.boolean(),
    dishServes: z.array(z.string()).max(5).nullable(),
  }),
  z.object({ kind: z.literal('offtopic'), reply: z.string() }),
  z.object({ kind: z.literal('unknown') }),
]);

/** Client parse: an older deployed server answers without nearMe / dishServes. */
export const UnderstandingClientSchema = z.discriminatedUnion('kind', [
  z.object({
    ...searchFields,
    nearMe: z.boolean().optional().default(false),
    dishServes: z.array(z.string()).max(5).nullable().optional().default(null),
  }),
  z.object({ kind: z.literal('offtopic'), reply: z.string() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Understanding = z.infer<typeof UnderstandingSchema>;

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
- Sohbet, spor, haber, hava durumu gibi konularda kind "offtopic" döndür ve reply alanına kısa, sıcak, esprili, en çok 2 cümlelik bir Türkçe cevap yaz. Bu cevap HİÇBİR olgu içermesin (skor, sonuç, hava durumu, haber yok) ve konuyu otopark ya da yemeğe çevirsin.
- Ne istediği anlaşılmıyorsa kind "unknown" döndür.
- Sadece şemaya uygun JSON döndür.`;

export const NARRATE_SYSTEM = `Sen İzmir için bir otopark ve restoran uygulamasının (Yerim Var) sesisin. Verilen sonuçları tanıtan 1-2 kısa, samimi Türkçe cümle yaz (İzmir ağzı olabilir, "hocam" diyebilirsin).

Kurallar:
- Yerlerden SADECE {1}..{5} yer tutucularıyla söz et; isim uydurma.
- Sadece girdideki sayıları kullan (total, withParking, distanceM, parkingM, parkingFree).
- Puan, yıldız, lezzet, fiyat, açılış-kapanış saati ya da girdide olmayan hiçbir şeyden söz etme.
- open, parkingPaid ve parkingFree alanlarını SADECE verildiği gibi kullan. open "unknown" ise açık ya da kapalı deme. parkingFree null ise boş yer sayısından söz etme; parkingPaid null ise ücretli ya da ücretsiz deme.
- Fiyat, puan ve saat uydurma.
- Her yer için en fazla bir ya da iki bilgi ver (örneğin kategori, açık mı, otopark ücretli mi, boş yer sayısı).
- Cevap 1-2 cümle olsun.`;

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

function fold(s: string): string {
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
