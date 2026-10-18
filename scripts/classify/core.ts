/**
 * The pure parts of scripts/classify-places.ts: chunking, the prompt, the answer schema, parsing
 * and checking an answer, the confidence filter, merging into data/category-guess.json and the
 * cost. No network, no file access, no SDK: the script wires them to the Message Batches API.
 */
import { z } from 'zod';

import { FOOD_CATEGORIES, type FoodCategory } from '@/data/restaurants';
import tr from '@/i18n/tr';

export const MODEL = 'claude-haiku-5-5';
export const CHUNK_SIZE = 40;
export const MAX_TOKENS = 4000;

export const NOT_FOOD = 'not_food';
export const UNKNOWN = 'unknown';
export type Answer = FoodCategory | typeof NOT_FOOD | typeof UNKNOWN;
export const ANSWERS: readonly Answer[] = [...FOOD_CATEGORIES, NOT_FOOD, UNKNOWN];
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** What a place is, as sent to the model. `i` is its position in the chunk; no id, no coordinates. */
export type PlaceInput = {
  i: number;
  name: string;
  kind: string;
  cuisine: string;
  district: string;
};

/** A candidate: the place's stable id (never sent to the model) plus what the model gets to see. */
/** `current` is the category the rules give the place now (its kind fallback), never sent to the model. */
export type Candidate = { id: string; current: FoodCategory | null } & Omit<PlaceInput, 'i'>;

export function chunk<T>(list: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < list.length; k += size) out.push(list.slice(k, k + size));
  return out;
}

export const customId = (city: string, index: number): string => `${city}-${index}`;

/** Splits "<city>-<chunk index>" back; null for anything else. */
export function parseCustomId(id: string): { city: string; index: number } | null {
  const m = /^(.+)-(\d+)$/.exec(id);
  return m ? { city: m[1]!, index: Number(m[2]) } : null;
}

/** One-line Turkish meaning of each category (the labels are the app's own, from tr.ts). */
const MEANING: Record<FoodCategory, string> = {
  breakfast: 'kahvaltı salonu, börekçi, simitçi, poğaça, gözleme, ekmek fırını',
  soup: 'çorbacı, işkembeci, kelle-paça, mercimek / tarhana çorbası ağırlıklı yerler',
  meat: 'kebapçı, köfteci, döner, ocakbaşı, steakhouse, ızgara, ciğerci, tavukçu, tantuni, et lokantası',
  lokanta: 'ev yemekleri, esnaf lokantası, hazır yemek, genel restoran',
  fish: 'balık restoranı, balıkçı, deniz ürünleri, midye',
  cafe: 'kafe, kahve dükkânı, çay bahçesi, kahve ve hafif atıştırmalık',
  meyhane: 'meyhane, bar, pub, rakı-meze, kokteyl barı',
  fast: 'fast food, hamburger, pizza, sandviç, tost, pide ve lahmacun',
  world: 'yabancı mutfak: İtalyan, Çin, Japon, Hint, Meksika, Uzak Doğu, Orta Doğu vb.',
  dessert: 'pastane, tatlıcı, baklavacı, dondurmacı, çikolata, waffle',
};

/** The category lines of the prompt: id, the app's Turkish label, the one-line meaning. */
export function categoryLines(): string[] {
  const cats = tr.food.cats as Record<string, string>;
  return FOOD_CATEGORIES.map((id) => `- ${id} (${cats[id]}): ${MEANING[id]}`);
}

/**
 * The system prompt. Stable text, the same for every request of every run (no date, no ids), so
 * the cached block is read from the second request on.
 */
export function systemPrompt(): string {
  return [
    'Sen Türkiye’deki yeme-içme mekânlarını türlerine ayıran bir sınıflandırıcısın.',
    'Sana bir JSON dizisi verilecek: her öğede i (sıra numarası), name (mekânın adı), kind (OpenStreetMap türü), cuisine (OpenStreetMap mutfak etiketleri) ve district (yaklaşık ilçe) var.',
    'Her öğe için aşağıdaki türlerden tam birini seç:',
    ...categoryLines(),
    '- not_food: yeme-içme yeri değil. Örnekler: market, şarküteri, kuruyemişçi, gıda toptancısı, kasap, manav, restoranı olmayan otel, düğün salonu, tesis, mağaza.',
    '- unknown: addan ve etiketlerden anlaşılamıyor.',
    'Kurallar:',
    '- Yalnızca verilen ada, OSM türüne, mutfak etiketlerine ve ilçeye bakarak karar ver.',
    '- Bilgi uydurma. Emin değilsen unknown de.',
    '- Bir mekân birden fazla şey satabilir: ana işini seç.',
    '- confidence: high = ad ya da etiket türü açıkça söylüyor; medium = büyük olasılıkla; low = zayıf tahmin.',
    '- Her öğe için tam bir cevap ver; i değerini aynen yaz.',
  ].join('\n');
}

/** The user message: a JSON array `[{ i, name, kind, cuisine, district }]`. */
export function userContent(places: readonly Omit<PlaceInput, 'i'>[]): string {
  const rows: PlaceInput[] = places.map((p, i) => ({
    i,
    name: p.name,
    kind: p.kind,
    cuisine: p.cuisine,
    district: p.district,
  }));
  return JSON.stringify(rows);
}

/** The JSON schema of the answer (structured outputs: `output_config.format.schema`). */
export const ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          cat: { type: 'string', enum: [...ANSWERS] },
          confidence: { type: 'string', enum: [...CONFIDENCES] },
        },
        required: ['i', 'cat', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const AnswerSchema = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      cat: z.enum(ANSWERS as [Answer, ...Answer[]]),
      confidence: z.enum(CONFIDENCES),
    }),
  ),
});

export type Classified = { cat: Answer; confidence: Confidence };

/** One request body (without the batch wrapper), as `client.messages.batches.create` takes it. */
export function buildParams(places: readonly Omit<PlaceInput, 'i'>[]) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text' as const,
        text: systemPrompt(),
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user' as const, content: userContent(places) }],
    output_config: {
      effort: 'low' as const,
      format: {
        type: 'json_schema' as const,
        schema: ANSWER_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  };
}

export type ParseResult =
  { ok: true; answers: Map<number, Classified> } | { ok: false; reason: string };

/**
 * Reads the model's text for a chunk of `count` places. Bad JSON or a wrong shape is a bad chunk;
 * an `i` outside the chunk is dropped, and the first answer wins for a repeated `i`.
 */
export function parseAnswer(text: string, count: number): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'the answer is not JSON' };
  }
  const parsed = AnswerSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'the answer does not match the schema' };
  const answers = new Map<number, Classified>();
  for (const it of parsed.data.items) {
    if (it.i < 0 || it.i >= count || answers.has(it.i)) continue;
    answers.set(it.i, { cat: it.cat, confidence: it.confidence });
  }
  return { ok: true, answers };
}

/** What a batch result gives: the text, or why the chunk is skipped. */
export type MessageLike = {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
};

export function textOf(message: MessageLike): { text: string } | { skip: string } {
  if (message.stop_reason === 'refusal') return { skip: 'the model refused' };
  if (message.stop_reason === 'max_tokens') return { skip: 'the answer was cut off (max_tokens)' };
  const text = message.content.find((b) => b.type === 'text')?.text;
  return text === undefined ? { skip: 'no text in the answer' } : { text };
}

/**
 * What to write for an answer, given the category the rules give the place now (`current`: its
 * kind fallback, or null when the rules give none). Only an answer that changes something is
 * stored in the bundled file: a food category different from `current`, or not_food (high only).
 * Everything else (unknown, low, a guess equal to the fallback, a food guess for a place that has
 * no category and keeps none) goes to `seen` so later runs do not ask again.
 */
export function keep(
  a: Classified,
  current: FoodCategory | null,
): { store: Answer } | { seen: true } {
  if (a.cat === UNKNOWN || a.confidence === 'low') return { seen: true };
  if (a.cat === NOT_FOOD) return a.confidence === 'high' ? { store: NOT_FOOD } : { seen: true };
  return current !== null && a.cat !== current ? { store: a.cat } : { seen: true };
}

/** data/category-guess.json: the only file the app bundles. */
export type GuessFile = {
  $comment?: string;
  generatedAt?: string | null;
  model?: string | null;
  items: Record<string, string>;
};

/** data/category-guess-seen.json: ids already asked about; the script reads it, the app never does. */
export type SeenFile = { $comment?: string; seen: string[] };

export const GUESS_COMMENT =
  'Estimated food category of places whose category the name rules in src/data/restaurants.ts do not read from a name or cuisine tag. Written by scripts/classify-places.ts (Anthropic Message Batches API, ' +
  `${MODEL}; run it from the Classify places workflow or: npx tsx scripts/classify-places.ts [--dry-run] [--limit N]). ` +
  "items: place id -> food category id (replaces the place's kind-only fallback category) or not_food; only high/medium confidence answers (not_food only when high), and only answers that change something. " +
  'The ids already asked about are in data/category-guess-seen.json, which the app does not bundle.';

export const SEEN_COMMENT =
  'Place ids scripts/classify-places.ts has already asked about and that need no entry in data/category-guess.json (unknown, low confidence, or the same category the rules give). Read only by the script, never bundled by the app.';

/** Ids already answered, in `items` or `seen`: later runs skip them. */
export function doneIds(items: Record<string, string>, seen: readonly string[]): Set<string> {
  return new Set([...Object.keys(items), ...seen]);
}

/** Places to ask about: not done yet, in a stable order (by id), at most `limit`. */
export function pickCandidates<T extends { id: string }>(
  places: readonly T[],
  done: ReadonlySet<string>,
  limit = Infinity,
): T[] {
  const out: T[] = [];
  if (limit <= 0) return out;
  const seen = new Set<string>();
  for (const p of [...places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (done.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

const sortedKeys = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Merges new answers: new ids only, sorted keys, `seen` sorted and unique. Returns the bundled
 * file and the seen file.
 */
export function mergeGuess(
  existing: Partial<GuessFile> | null,
  existingSeen: readonly string[],
  fresh: readonly { id: string; answer: Classified; current: FoodCategory | null }[],
  meta: { generatedAt: string; model: string },
): { guess: GuessFile; seen: SeenFile } {
  const items: Record<string, string> = { ...(existing?.items ?? {}) };
  const seen = new Set(existingSeen);
  for (const { id, answer, current } of fresh) {
    if (id in items || seen.has(id)) continue;
    const k = keep(answer, current);
    if ('store' in k) items[id] = k.store;
    else seen.add(id);
  }
  return {
    guess: {
      $comment: GUESS_COMMENT,
      generatedAt: meta.generatedAt,
      model: meta.model,
      items: sortedKeys(items),
    },
    seen: { $comment: SEEN_COMMENT, seen: [...seen].sort() },
  };
}

/** claude-haiku-5-5, $ per million tokens: standard input / output. */
export const PRICE_IN_PER_MTOK = 0.1;
export const PRICE_OUT_PER_MTOK = 0.5;
/** The Batches API charges half. Cache reads cost 0.1x the input price, cache writes 1.25x. */
export const BATCH_FACTOR = 0.5;

export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export const emptyUsage = (): Usage => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

export function addUsage(
  total: Usage,
  u: {
    input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    output_tokens?: number | null;
  },
): void {
  total.input += u.input_tokens ?? 0;
  total.cacheRead += u.cache_read_input_tokens ?? 0;
  total.cacheWrite += u.cache_creation_input_tokens ?? 0;
  total.output += u.output_tokens ?? 0;
}

/** Dollars for the usage at batch prices. */
export function costUsd(u: Usage): number {
  const inPrice = PRICE_IN_PER_MTOK * BATCH_FACTOR;
  const outPrice = PRICE_OUT_PER_MTOK * BATCH_FACTOR;
  return (
    (u.input * inPrice +
      u.cacheRead * inPrice * 0.1 +
      u.cacheWrite * inPrice * 1.25 +
      u.output * outPrice) /
    1_000_000
  );
}

/** Rough tokens of a text (Turkish and JSON run about 3 characters a token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

/**
 * A rough cost before submitting, with no API call: each request's input counted at the full
 * price (no cache hit assumed), and `OUTPUT_TOKENS_PER_PLACE` output tokens per place plus a fixed
 * allowance for the model's own reasoning (Haiku 5.5 always thinks, a little at effort low).
 */
export const OUTPUT_TOKENS_PER_PLACE = 18;
export const OUTPUT_OVERHEAD_TOKENS = 500;

export function estimateCost(chunks: readonly (readonly Omit<PlaceInput, 'i'>[])[]): {
  usage: Usage;
  usd: number;
} {
  const usage = emptyUsage();
  const system = estimateTokens(systemPrompt());
  for (const c of chunks) {
    usage.input += system + estimateTokens(userContent(c));
    usage.output += c.length * OUTPUT_TOKENS_PER_PLACE + OUTPUT_OVERHEAD_TOKENS;
  }
  return { usage, usd: costUsd(usage) };
}

/** The place nearest to one of the district centres, within `maxM` metres; '' when none. */
export function nearestDistrict(
  centers: readonly { name: string; lat: number; lng: number }[],
  p: { lat: number; lng: number },
  distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
  maxM = 15_000,
): string {
  let best = '';
  let bestM = maxM;
  for (const c of centers) {
    const d = distance(c, p);
    if (d <= bestM) {
      best = c.name;
      bestM = d;
    }
  }
  return best;
}
