// Pure logic: no Cloudflare or SDK imports, so it can be unit-tested with a fake KV.
import {
  CHAT_HISTORY_LIMIT,
  DISH_MATCHES,
  FREE_DAILY,
  HISTORY_LIMIT,
  MAX_CANDIDATES,
  MAX_CHAT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_PARKINGS,
  MAX_RESULTS,
  OPEN_STATES,
  PLAN_WHENS,
  todayIstanbul,
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

// --- /chat limits ---------------------------------------------------------------------------
// Small talk costs real money but no ✨: it has its own counters, all read from wrangler.toml
// [vars] (strings), so they change with a redeploy and without an app release.

export type ChatLimits = {
  /** Chat replies per device per day. */
  perDevice: number;
  /** Chat replies across all devices per day; at the cap nothing is sent to Anthropic. */
  global: number;
  /** Calls per IP per day, shared by every endpoint. */
  perIp: number;
  /** A device may call /chat at most once per this many milliseconds. */
  minIntervalMs: number;
};

export const CHAT_DEFAULTS: ChatLimits = {
  perDevice: 15,
  global: 10000,
  perIp: 100,
  minIntervalMs: 1000,
};

type LimitVars = {
  CHAT_DAILY_PER_DEVICE?: string;
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
export function chatLimits(vars: LimitVars): ChatLimits {
  return {
    perDevice: intVar(vars.CHAT_DAILY_PER_DEVICE, CHAT_DEFAULTS.perDevice),
    global: intVar(vars.CHAT_GLOBAL_DAILY, CHAT_DEFAULTS.global),
    perIp: intVar(vars.AI_DAILY_PER_IP, CHAT_DEFAULTS.perIp),
    minIntervalMs: intVar(vars.CHAT_MIN_INTERVAL_MS, CHAT_DEFAULTS.minIntervalMs),
  };
}

export type ChatCharge = { ok: true } | { ok: false; reason: 'slow' | 'device' | 'global' };

async function readCount(kv: KV, key: string): Promise<number> {
  const n = Number((await kv.get(key)) ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Takes one chat reply from the device and the global counters, or says which limit stopped it.
 * Checked in this order: too fast (a rejected call does not count), global cap, device cap.
 */
export async function chatCharge(
  kv: KV,
  deviceId: string,
  now: Date,
  limits: ChatLimits,
): Promise<ChatCharge> {
  const day = todayIstanbul(now);
  const lastKey = `chat:last:${deviceId}`;
  const last = Number((await kv.get(lastKey)) ?? '0');
  if (Number.isFinite(last) && last > 0 && now.getTime() - last < limits.minIntervalMs) {
    return { ok: false, reason: 'slow' };
  }
  const globalKey = `chat:global:${day}`;
  const deviceKey = `chat:${day}:${deviceId}`;
  const globalCount = await readCount(kv, globalKey);
  if (globalCount >= limits.global) return { ok: false, reason: 'global' };
  const deviceCount = await readCount(kv, deviceKey);
  if (deviceCount >= limits.perDevice) return { ok: false, reason: 'device' };
  await kv.put(globalKey, String(globalCount + 1), { expirationTtl: TTL_SECONDS });
  await kv.put(deviceKey, String(deviceCount + 1), { expirationTtl: TTL_SECONDS });
  // KV keeps a key for at least 60 s.
  await kv.put(lastKey, String(now.getTime()), { expirationTtl: 60 });
  return { ok: true };
}

/** Gives back what `chatCharge` took when Anthropic failed or refused; never below zero. */
export async function chatRefund(kv: KV, deviceId: string, now: Date): Promise<void> {
  const day = todayIstanbul(now);
  for (const key of [`chat:global:${day}`, `chat:${day}:${deviceId}`]) {
    const n = await readCount(kv, key);
    await kv.put(key, String(Math.max(0, n - 1)), { expirationTtl: TTL_SECONDS });
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validQuota(body: unknown): QuotaRequest | null {
  if (!isRecord(body)) return null;
  return isId(body.deviceId) ? { deviceId: body.deviceId } : null;
}

export function validUnderstand(body: unknown): UnderstandRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, messageId, text, history, section } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_MESSAGE_CHARS)) return null;
  if (section !== 'park' && section !== 'food') return null;
  if (!Array.isArray(history) || history.length > HISTORY_LIMIT) return null;
  const turns: ChatTurn[] = [];
  for (const h of history) {
    if (!isRecord(h)) return null;
    if (h.role !== 'user' && h.role !== 'bot') return null;
    if (typeof h.text !== 'string' || h.text.length > MAX_MESSAGE_CHARS) return null;
    turns.push({ role: h.role, text: h.text });
  }
  return { deviceId, messageId, text, history: turns, section };
}

/** /chat: a short text, the last four turns at most, and what the last reply showed. */
export function validChat(body: unknown): ChatRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, messageId, text, history, lastCards } = body;
  if (!isId(deviceId) || !isId(messageId)) return null;
  if (!isText(text, MAX_CHAT_CHARS)) return null;
  if (!Array.isArray(history) || history.length > CHAT_HISTORY_LIMIT) return null;
  const turns: ChatTurn[] = [];
  for (const h of history) {
    if (!isRecord(h)) return null;
    if (h.role !== 'user' && h.role !== 'bot') return null;
    if (typeof h.text !== 'string' || h.text.length > MAX_CHAT_CHARS) return null;
    turns.push({ role: h.role, text: h.text });
  }
  const req: ChatRequest = { deviceId, messageId, text, history: turns };
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
  return { deviceId, messageId, text, where, what, total, withParking, results: out };
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
  return { deviceId, messageId, text };
}

/**
 * /pick: 1..5 candidates, indexed by position, facts only (no names are accepted). All are
 * restaurants or all are car parks; the first one says which.
 */
export function validPick(body: unknown): PickRequest | ParkPickRequest | null {
  if (!isRecord(body)) return null;
  const ids = validIds(body);
  if (!ids) return null;
  const { candidates } = body;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_CANDIDATES) {
    return null;
  }
  const parking = isRecord(candidates[0]) && candidates[0].kind === 'parking';
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
