// "Burası kapanmış / bilgi yanlış" reports from the app. Anonymous: the device is stored only as a
// hash salted with the place, so two reports of one device on two places cannot be linked. A place
// that enough different devices report closed is listed by /hidden, and the app hides it.
import { CitySchema, todayIstanbul } from '../../../src/lib/ai/protocol';
import type { KV } from './quota';

export const REPORT_KINDS = ['closed', 'location', 'info'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportRequest = {
  deviceId: string;
  placeId: string;
  place: 'food' | 'parking';
  kind: ReportKind;
  city: string;
};

/** Distinct devices that must say "closed" before the place is hidden for everyone. */
export const HIDE_AT = 3;
/** Reports a device may send per day. */
export const REPORTS_PER_DEVICE_DAILY = 30;
/** How long a place's reports, and its hidden mark, are kept (from the first one). */
const REPORT_TTL_SECONDS = 180 * 86400;
/** The hidden list is kept per month; this many months (current included) are read. */
const HIDDEN_MONTHS = 6;
const DAY_TTL_SECONDS = 172800;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Place ids: "osm-n123", "apple-38.41234,27.12345", "ispark-12". */
const PLACE_RE = /^[A-Za-z0-9_.,:-]{1,80}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validReport(body: unknown): ReportRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, placeId, place, kind } = body;
  if (typeof deviceId !== 'string' || !ID_RE.test(deviceId)) return null;
  if (typeof placeId !== 'string' || !PLACE_RE.test(placeId)) return null;
  if (place !== 'food' && place !== 'parking') return null;
  if (!REPORT_KINDS.includes(kind as ReportKind)) return null;
  const city = CitySchema.safeParse(body.city);
  if (!city.success) return null;
  return { deviceId, placeId, place, kind: kind as ReportKind, city: city.data };
}

/** The city of a /hidden request, or null. */
export function validCity(raw: string | null): string | null {
  const city = CitySchema.safeParse(raw);
  return city.success ? city.data : null;
}

/** A short hex SHA-256 of the parts. */
export async function shortHash(...parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('\u0000'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type PlaceReports = { closed: string[]; location: number; info: number };

function readJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const month = (now: Date) => todayIstanbul(now).slice(0, 7);

function monthsBack(now: Date, n: number): string[] {
  const [y, m] = month(now).split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export type ReportOutcome = { ok: true; hidden: boolean } | { ok: false; reason: 'device' };

/**
 * Records one report. `device` is the device hashed with the place (shortHash), `dayDevice` the
 * device hashed alone for its daily cap. A device's second "closed" for a place counts once.
 */
export async function addReport(
  kv: KV,
  r: { city: string; placeId: string; kind: ReportKind; device: string; dayDevice: string },
  now: Date,
  hideAt = HIDE_AT,
): Promise<ReportOutcome> {
  const dayKey = `repdev:${todayIstanbul(now)}:${r.dayDevice}`;
  const sent = Number((await kv.get(dayKey)) ?? '0') || 0;
  if (sent >= REPORTS_PER_DEVICE_DAILY) return { ok: false, reason: 'device' };
  await kv.put(dayKey, String(sent + 1), { expirationTtl: DAY_TTL_SECONDS });

  const key = `rep:${r.city}:${r.placeId}`;
  const rec = readJson<PlaceReports>(await kv.get(key), { closed: [], location: 0, info: 0 });
  const closed = Array.isArray(rec.closed) ? rec.closed : [];
  if (r.kind === 'closed') {
    if (!closed.includes(r.device)) closed.push(r.device);
  } else {
    rec[r.kind] = (Number(rec[r.kind]) || 0) + 1;
  }
  await kv.put(key, JSON.stringify({ ...rec, closed }), { expirationTtl: REPORT_TTL_SECONDS });

  const hidden = closed.length >= hideAt;
  if (hidden) {
    const listKey = `hidden:${r.city}:${month(now)}`;
    const list = readJson<string[]>(await kv.get(listKey), []);
    if (!list.includes(r.placeId)) {
      list.push(r.placeId);
      await kv.put(listKey, JSON.stringify(list), { expirationTtl: REPORT_TTL_SECONDS });
    }
  }
  return { ok: true, hidden };
}

/** The places of the city hidden in the last HIDDEN_MONTHS months. */
export async function hiddenPlaces(kv: KV, city: string, now: Date): Promise<string[]> {
  const out = new Set<string>();
  for (const m of monthsBack(now, HIDDEN_MONTHS)) {
    const list = readJson<unknown>(await kv.get(`hidden:${city}:${m}`), []);
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') out.add(id);
  }
  return [...out].sort();
}
