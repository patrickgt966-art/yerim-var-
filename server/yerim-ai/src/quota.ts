// Pure logic: no Cloudflare or SDK imports, so it can be unit-tested with a fake KV.
import {
  CHAT_HISTORY_LIMIT,
  DISH_MATCHES,
  FREE_DAILY,
  HISTORY_LIMIT,
  MAX_CANDIDATES,
  MAX_LABEL_CHARS,
  MAX_PICK_CANDIDATES,
  MAX_CHAT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_PARKINGS,
  MAX_RESULTS,
  OPEN_STATES,
  PLAN_WHENS,
  CitySchema,
  clipText,
  todayIstanbul,
  type CancelRequest,
  type ChatRequest,
  type ChatTurn,
  type DishMatch,
  type NarrateRequest,
  type OpenStateCode,
  type ParkPickCandidate,
  type ParkPickRequest,
  type PickCandidate,
  type PickRequest,
  type PlanCandidate,
  type PlanParking,
  type PlanRequest,
  type PlanWhen,
  type QuotaRequest,
  type UnderstandRequest,
} from '../../../src/lib/ai/protocol';

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

const TTL_SECONDS = 172800;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function charge(
  kv: KV,
  deviceId: string,
  messageId: string,
  limit: number,
  now: Date,
): Promise<{ allowed: boolean; remaining: number; added: boolean }> {
  const key = `q:${todayIstanbul(now)}:${deviceId}`;
  const ids = parseIds(await kv.get(key));
  if (ids.includes(messageId)) {
    return { allowed: true, remaining: Math.max(0, limit - ids.length), added: false };
  }
  if (ids.length >= limit) return { allowed: false, remaining: 0, added: false };
  ids.push(messageId);
  await kv.put(key, JSON.stringify(ids), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: limit - ids.length, added: true };
}

/**
 * Gives back a use taken by `charge` (call only when it returned added: true).
 * Removes just this messageId, so it is idempotent; returns the remaining count.
 */
export async function refund(
  kv: KV,
  deviceId: string,
  messageId: string,
  now: Date,
  limit = FREE_DAILY,
): Promise<number> {
  const key = `q:${todayIstanbul(now)}:${deviceId}`;
  const ids = parseIds(await kv.get(key));
  if (!ids.includes(messageId)) return Math.max(0, limit - ids.length);
  const kept = ids.filter((id) => id !== messageId);
  await kv.put(key, JSON.stringify(kept), { expirationTtl: TTL_SECONDS });
  return Math.max(0, limit - kept.length);
}

/** Remaining uses today, without charging. */
export async function peek(
  kv: KV,
  deviceId: string,
  now: Date,
  limit = FREE_DAILY,
): Promise<number> {
  const ids = parseIds(await kv.get(`q:${todayIstanbul(now)}:${deviceId}`));
  return Math.max(0, limit - ids.length);
}

/** Per-IP daily call counter; false when over max (stops device-id rotation abuse). */
export async function ipGuard(kv: KV, ip: string, now: Date, max = 100): Promise<boolean> {
  const key = `ip:${todayIstanbul(now)}:${ip}`;
  const count = Number((await kv.get(key)) ?? '0');
  const current = Number.isFinite(count) ? count : 0;
  if (current >= max) return false;
  await kv.put(key, String(current + 1), { expirationTtl: TTL_SECONDS });
  return true;
}

// --- One counter for every AI endpoint ------------------------------------------------------
// /understand, /pick, /plan, /narrate and /chat all charge the same per-device daily quota,
// keyed by messageId (one user message = one use). On top of that: a global daily cap and a
// minimum interval per device. Limits come from wrangler.toml [vars] (strings), so they change
// with a redeploy and without an app release.

export type AiLimits = {
  /** AI messages across all devices per day; at the cap nothing is sent to Anthropic. */
  global: number;
  /** Calls per IP per day, shared by every endpoint. */
  perIp: number;
  /** A device may start a new AI message at most once per this many milliseconds. */
  minIntervalMs: number;
};

export const AI_DEFAULTS: AiLimits = {
  global: 10000,
  perIp: 100,
  minIntervalMs: 1000,
};

type LimitVars = {
  AI_GLOBAL_DAILY?: string;
  /** The former name of AI_GLOBAL_DAILY, read when the new one is not set. */
  CHAT_GLOBAL_DAILY?: string;
  AI_DAILY_PER_IP?: string;
  CHAT_MIN_INTERVAL_MS?: string;
};

function intVar(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** The limits from the worker's vars; unset or invalid values fall back to the defaults. */
export function aiLimits(vars: LimitVars): AiLimits {
  const blank = (v: string | undefined) => v === undefined || v.trim() === '';
  return {
    global: intVar(
      blank(vars.AI_GLOBAL_DAILY) ? vars.CHAT_GLOBAL_DAILY : vars.AI_GLOBAL_DAILY,
      AI_DEFAULTS.global,
    ),
    perIp: intVar(vars.AI_DAILY_PER_IP, AI_DEFAULTS.perIp),
    minIntervalMs: intVar(vars.CHAT_MIN_INTERVAL_MS, AI_DEFAULTS.minIntervalMs),
  };
}

export type UseTaken =
  | { ok: true; remaining: number; added: boolean }
  | { ok: false; reason: 'quota' | 'slow' | 'global'; remaining: number };

async function readCount(kv: KV, key: string): Promise<number> {
  const n = Number((await kv.get(key)) ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Takes one use for a message, or says which limit stopped it. A messageId already charged today
 * (the /pick or /plan after its /understand) passes for free and skips the interval and the
 * global cap. For a new message, checked in this order: too fast (a rejected call does not
 * count), global cap, the device's daily uses.
 */
export async function takeUse(
  kv: KV,
  deviceId: string,
  messageId: string,
  now: Date,
  limits: AiLimits,
  limit = FREE_DAILY,
): Promise<UseTaken> {
  const day = todayIstanbul(now);
  const globalKey = `ai:global:${day}`;
  const lastKey = `ai:last:${deviceId}`;
  const known = parseIds(await kv.get(`q:${day}:${deviceId}`)).includes(messageId);
  if (!known) {
    const last = Number((await kv.get(lastKey)) ?? '0');
    if (Number.isFinite(last) && last > 0 && now.getTime() - last < limits.minIntervalMs) {
      return { ok: false, reason: 'slow', remaining: await peek(kv, deviceId, now, limit) };
    }
    if ((await readCount(kv, globalKey)) >= limits.global) {
      return { ok: false, reason: 'global', remaining: await peek(kv, deviceId, now, limit) };
    }
  }
  const q = await charge(kv, deviceId, messageId, limit, now);
  if (!q.allowed) return { ok: false, reason: 'quota', remaining: 0 };
  if (q.added) {
    await kv.put(globalKey, String((await readCount(kv, globalKey)) + 1), {
      expirationTtl: TTL_SECONDS,
    });
    // KV keeps a key for at least 60 s.
    await kv.put(lastKey, String(now.getTime()), { expirationTtl: 60 });
  }
  return { ok: true, remaining: q.remaining, added: q.added };
}

/**
 * Gives back the use of a message (device list and global counter) when Anthropic failed, or the
 * client gave up. Idempotent: only the call that really removes the messageId lowers the global
 * counter, and it never goes below zero.
 */
export async function releaseUse(
  kv: KV,
  deviceId: string,
  messageId: string,
  now: Date,
  limit = FREE_DAILY,
): Promise<{ removed: boolean; remaining: number }> {
  const day = todayIstanbul(now);
  const ids = parseIds(await kv.get(`q:${day}:${deviceId}`));
  if (!ids.includes(messageId)) {
    return { removed: false, remaining: Math.max(0, limit - ids.length) };
  }
  const remaining = await refund(kv, deviceId, messageId, now, limit);
  const globalKey = `ai:global:${day}`;
  const n = await readCount(kv, globalKey);
  await kv.put(globalKey, String(Math.max(0, n - 1)), { expirationTtl: TTL_SECONDS });
  return { removed: true, remaining };
}

/** A device may cancel this many messages per day; stops "ask, cancel, ask again" for free. */
export const MAX_CANCELS_PER_DAY = 5;
const CANCEL_MARK_TTL_SECONDS = 3600;

/**
 * The client gave up waiting for a message (timeout / abort). Gives its use back right away when
 * it was charged, and marks the messageId cancelled so a handler that is still running (or one
 * that has not charged yet) gives it back again, idempotently, when it finishes. Beyond
 * MAX_CANCELS_PER_DAY nothing is refunded.
 */
export async function cancelUse(
  kv: KV,
  deviceId: string,
  messageId: string,
  now: Date,
  limit = FREE_DAILY,
): Promise<{ removed: boolean; remaining: number }> {
  const day = todayIstanbul(now);
  const countKey = `cancels:${day}:${deviceId}`;
  const count = await readCount(kv, countKey);
  if (count >= MAX_CANCELS_PER_DAY) {
    return { removed: false, remaining: await peek(kv, deviceId, now, limit) };
  }
  await kv.put(countKey, String(count + 1), { expirationTtl: TTL_SECONDS });
  await kv.put(`cancel:${day}:${deviceId}:${messageId}`, '1', {
    expirationTtl: CANCEL_MARK_TTL_SECONDS,
  });
  return releaseUse(kv, deviceId, messageId, now, limit);
}

/** True when the client cancelled this message (see cancelUse). */
export async function wasCancelled(
  kv: KV,
  deviceId: string,
  messageId: string,
  now: Date,
): Promise<boolean> {
  return (await kv.get(`cancel:${todayIstanbul(now)}:${deviceId}:${messageId}`)) !== null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= max;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * The optional `city` of a request: undefined when absent (an older app, which then gets the
 * İzmir prompts), null when it is not an open city.
 */
/** The optional app language: only 'en' changes anything; anything else is Turkish. */
function readLang(body: Record<string, unknown>): { lang?: 'en' } {
  return body.lang === 'en' ? { lang: 'en' } : {};
}

function readCity(body: Record<string, unknown>): string | undefined | null {
  if (body.city === undefined) return undefined;
  const parsed = CitySchema.safeParse(body.city);
  return parsed.success ? parsed.data : null;
}

/**
 * The `history` of a request, made to fit: only the last `maxTurns` turns are kept, each text is
 * clipped to `maxChars` (the start stays) and a turn left without text is dropped. Old and new
 * apps both send long bot replies, and one of them must not cost the whole request. A history
 * that is not an array, or a turn with a wrong shape or role, is still malformed (null).
 */
function readHistory(raw: unknown, maxTurns: number, maxChars: number): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const h of raw.slice(-maxTurns) as unknown[]) {
    if (!isRecord(h)) return null;
    if (h.role !== 'user' && h.role !== 'bot') return null;
    if (typeof h.text !== 'string') return null;
    const text = clipText(h.text, maxChars);
    if (text.trim() === '') continue;
    turns.push({ role: h.role, text });
  }
  return turns;
}

export function validQuota(body: unknown): QuotaRequest | null {
  if (!isRecord(body)) return null;
  return isId(body.deviceId) ? { deviceId: body.deviceId } : null;
}

/** /cancel: which message the client gave up on. */
export function validCancel(body: unknown): CancelRequest | null {
  if (!isRecord(body)) return null;
  return isId(body.deviceId) && isId(body.messageId)
    ? { deviceId: body.deviceId, messageId: body.messageId }
    : null;
}

export function validUnderstand(body: unknown): UnderstandRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, messageId, text, history, section, lastCards } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_MESSAGE_CHARS)) return null;
  if (section !== 'park' && section !== 'food') return null;
  const turns = readHistory(history, HISTORY_LIMIT, MAX_MESSAGE_CHARS);
  if (!turns) return null;
  const city = readCity(body);
  if (city === null) return null;
  const req: UnderstandRequest = {
    deviceId,
    messageId,
    text,
    history: turns,
    section,
    ...readLang(body),
  };
  if (city) req.city = city;
  if (lastCards !== undefined) {
    if (!isRecord(lastCards)) return null;
    if (!Number.isInteger(lastCards.count) || (lastCards.count as number) < 0) return null;
    if ((lastCards.count as number) > MAX_RESULTS) return null;
    if (lastCards.kind !== 'restaurant' && lastCards.kind !== 'parking') return null;
    req.lastCards = { count: lastCards.count as number, kind: lastCards.kind };
  }
  return req;
}

/** /chat: a short text, the last four turns at most, and what the last reply showed. */
export function validChat(body: unknown): ChatRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, messageId, text, history, lastCards } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_CHAT_CHARS)) return null;
  const turns = readHistory(history, CHAT_HISTORY_LIMIT, MAX_CHAT_CHARS);
  if (!turns) return null;
  const city = readCity(body);
  if (city === null) return null;
  const req: ChatRequest = { deviceId, messageId, text, history: turns, ...readLang(body) };
  if (city) req.city = city;
  if (lastCards !== undefined) {
    if (!isRecord(lastCards)) return null;
    if (!Number.isInteger(lastCards.count) || (lastCards.count as number) < 0) return null;
    if ((lastCards.count as number) > MAX_RESULTS) return null;
    if (lastCards.kind !== 'restaurant' && lastCards.kind !== 'parking') return null;
    req.lastCards = { count: lastCards.count as number, kind: lastCards.kind };
  }
  return req;
}

export function validNarrate(body: unknown): NarrateRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, messageId, text, where, what, total, withParking, results } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_MESSAGE_CHARS)) return null;
  if (typeof where !== 'string' || where.length > 60) return null;
  if (typeof what !== 'string' || what.length > 60) return null;
  if (!isNum(total) || !isNum(withParking)) return null;
  if (!Array.isArray(results) || results.length > MAX_RESULTS) return null;
  const out: NarrateRequest['results'] = [];
  for (const r of results) {
    if (!isRecord(r)) return null;
    if (r.kind !== 'restaurant' && r.kind !== 'parking') return null;
    if (!isNum(r.n) || !isNum(r.distanceM)) return null;
    if (r.parkingM !== null && !isNum(r.parkingM)) return null;
    const item: NarrateRequest['results'][number] = {
      n: r.n,
      kind: r.kind,
      distanceM: r.distanceM,
      parkingM: r.parkingM,
    };
    if (r.cat !== undefined) {
      if (typeof r.cat !== 'string' || r.cat.length > 20) return null;
      item.cat = r.cat;
    }
    if (r.open !== undefined) {
      if (r.open !== 'open' && r.open !== 'closed' && r.open !== 'unknown') return null;
      item.open = r.open;
    }
    if (r.parkingPaid !== undefined) {
      if (r.parkingPaid !== null && typeof r.parkingPaid !== 'boolean') return null;
      item.parkingPaid = r.parkingPaid;
    }
    if (r.parkingFree !== undefined) {
      if (
        r.parkingFree !== null &&
        !(Number.isInteger(r.parkingFree) && (r.parkingFree as number) >= 0)
      ) {
        return null;
      }
      item.parkingFree = r.parkingFree as number | null;
    }
    out.push(item);
  }
  const city = readCity(body);
  if (city === null) return null;
  return {
    deviceId,
    messageId,
    ...(city ? { city } : {}),
    ...readLang(body),
    text,
    where,
    what,
    total,
    withParking,
    results: out,
  };
}

const isCount = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 99999;
const isBoolOrNull = (v: unknown): v is boolean | null => v === null || typeof v === 'boolean';
const isOpenState = (v: unknown): v is OpenStateCode =>
  typeof v === 'string' && (OPEN_STATES as readonly string[]).includes(v);
const isDishMatch = (v: unknown): v is DishMatch =>
  typeof v === 'string' && (DISH_MATCHES as readonly string[]).includes(v);

/** The facts every restaurant candidate carries (pick and plan); unknown keys are dropped. */
function restaurantFacts(c: Record<string, unknown>, index: number) {
  if (c.i !== index || c.kind !== 'restaurant') return null;
  if (!isCount(c.walkMin)) return null;
  if (!isOpenState(c.openState) || typeof c.closesLate !== 'boolean') return null;
  if (!isDishMatch(c.dishMatch) || !isBoolOrNull(c.outdoor)) return null;
  return {
    i: index,
    kind: 'restaurant' as const,
    walkMin: c.walkMin,
    openState: c.openState,
    closesLate: c.closesLate,
    dishMatch: c.dishMatch,
    outdoor: c.outdoor,
  };
}

function validIds(body: Record<string, unknown>) {
  const { deviceId, messageId, text } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_MESSAGE_CHARS)) return null;
  const city = readCity(body);
  if (city === null) return null;
  return { deviceId, messageId, text, ...(city ? { city } : {}), ...readLang(body) };
}

/**
 * /pick: indexed by position. Car parks: 1..5, facts only. Restaurants: 1..40, facts plus the
 * place's public name and type (so the model can judge what fits the request); a name or type that
 * is not short text is dropped. All are restaurants or all are car parks; the first one says which.
 */
export function validPick(body: unknown): PickRequest | ParkPickRequest | null {
  if (!isRecord(body)) return null;
  const ids = validIds(body);
  if (!ids) return null;
  const { candidates } = body;
  const parking =
    Array.isArray(candidates) && isRecord(candidates[0]) && candidates[0].kind === 'parking';
  const most = parking ? MAX_CANDIDATES : MAX_PICK_CANDIDATES;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > most) {
    return null;
  }
  const restaurants: PickCandidate[] = [];
  const parkings: ParkPickCandidate[] = [];
  for (let k = 0; k < candidates.length; k++) {
    const c: unknown = candidates[k];
    if (!isRecord(c)) return null;
    if (parking) {
      if (c.i !== k || c.kind !== 'parking' || !isCount(c.walkMin) || !isOpenState(c.openState)) {
        return null;
      }
      if (typeof c.nonstop !== 'boolean' || typeof c.tariffKnown !== 'boolean') return null;
      if (!isBoolOrNull(c.free) || !isBoolOrNull(c.covered) || typeof c.nearRail !== 'boolean') {
        return null;
      }
      if (c.freeSpots !== null && !isCount(c.freeSpots)) return null;
      if (c.capacity !== null && !isCount(c.capacity)) return null;
      parkings.push({
        i: k,
        kind: 'parking',
        walkMin: c.walkMin,
        openState: c.openState,
        nonstop: c.nonstop,
        free: c.free,
        tariffKnown: c.tariffKnown,
        covered: c.covered,
        freeSpots: c.freeSpots as number | null,
        nearRail: c.nearRail,
        capacity: c.capacity as number | null,
      });
      continue;
    }
    const base = restaurantFacts(c, k);
    if (!base) return null;
    if (c.parkingM !== null && !isCount(c.parkingM)) return null;
    if (!isBoolOrNull(c.parkingFree)) return null;
    if (c.freeSpots !== null && !isCount(c.freeSpots)) return null;
    restaurants.push({
      ...base,
      ...(isText(c.name, MAX_LABEL_CHARS) ? { name: c.name } : {}),
      ...(isText(c.type, MAX_LABEL_CHARS) ? { type: c.type } : {}),
      parkingM: c.parkingM as number | null,
      parkingFree: c.parkingFree,
      freeSpots: c.freeSpots as number | null,
    });
  }
  return parking ? { ...ids, candidates: parkings } : { ...ids, candidates: restaurants };
}

/**
 * /plan: 1..5 restaurants, each with 1..3 car parks. Car park indices `p` are global and must
 * run 0,1,2,... in order, so the response bound is simply the total count.
 */
export function validPlan(body: unknown): PlanRequest | null {
  if (!isRecord(body)) return null;
  const ids = validIds(body);
  if (!ids) return null;
  const when = body.when;
  if (typeof when !== 'string' || !(PLAN_WHENS as readonly string[]).includes(when)) return null;
  const { candidates } = body;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_CANDIDATES) {
    return null;
  }
  const out: PlanCandidate[] = [];
  let nextP = 0;
  for (let k = 0; k < candidates.length; k++) {
    const c: unknown = candidates[k];
    if (!isRecord(c)) return null;
    const base = restaurantFacts(c, k);
    if (!base) return null;
    const { parkings } = c;
    if (!Array.isArray(parkings) || parkings.length < 1 || parkings.length > MAX_PLAN_PARKINGS) {
      return null;
    }
    const ps: PlanParking[] = [];
    for (const raw of parkings as unknown[]) {
      if (!isRecord(raw)) return null;
      if (raw.p !== nextP || !isCount(raw.walkMin)) return null;
      if (!isBoolOrNull(raw.parkingFree) || !isOpenState(raw.openState)) return null;
      if (raw.freeSpots !== null && !isCount(raw.freeSpots)) return null;
      ps.push({
        p: nextP,
        walkMin: raw.walkMin,
        parkingFree: raw.parkingFree,
        freeSpots: raw.freeSpots as number | null,
        openState: raw.openState,
      });
      nextP++;
    }
    out.push({ ...base, parkings: ps });
  }
  return { ...ids, when: when as PlanWhen, candidates: out };
}

export function toMessages(
  history: ChatTurn[],
  text: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const mapped = history.map((h) => ({
    role: h.role === 'bot' ? ('assistant' as const) : ('user' as const),
    content: h.text,
  }));
  while (mapped[0]?.role === 'assistant') mapped.shift();
  mapped.push({ role: 'user', content: text });
  return mapped;
}
