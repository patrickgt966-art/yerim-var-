// Pure logic: no Cloudflare or SDK imports, so it can be unit-tested with a fake KV.
import {
  HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  MAX_RESULTS,
  todayIstanbul,
  type ChatTurn,
  type NarrateRequest,
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
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `q:${todayIstanbul(now)}:${deviceId}`;
  const ids = parseIds(await kv.get(key));
  if (ids.includes(messageId)) {
    return { allowed: true, remaining: Math.max(0, limit - ids.length) };
  }
  if (ids.length >= limit) return { allowed: false, remaining: 0 };
  ids.push(messageId);
  await kv.put(key, JSON.stringify(ids), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: limit - ids.length };
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
