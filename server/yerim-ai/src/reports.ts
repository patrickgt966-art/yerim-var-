// "Burası kapanmış / bilgi yanlış" reports from the app. Anonymous: the device and its network are
// stored only as hashes salted with the place, so two reports of one device on two places cannot
// be linked.
//
// Reports alone never hide a place for everyone: a device id is free to make (reinstall) and an IP
// changes with the mobile network, so a few reports prove nothing. Enough reports from different
// networks on different days only *flag* the place (the app shows "may be closed" and ranks it
// lower). Hiding it for everyone is the maintainer's call (/admin/review).
import { CitySchema, todayIstanbul } from '../../../src/lib/ai/protocol';
import type { KV } from './quota';

export const REPORT_KINDS = ['closed', 'location', 'info'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type PlaceKind = 'food' | 'parking';

export type ReportRequest = {
  deviceId: string;
  placeId: string;
  place: PlaceKind;
  kind: ReportKind;
  city: string;
};

/** Distinct networks that must say "closed" before the place is flagged. */
export const FLAG_AT = 3;
/** ...on at least this many different days: one person's evening of reinstalls is one day. */
export const FLAG_DAYS = 2;
/** Reports a device may send per day. */
export const REPORTS_PER_DEVICE_DAILY = 30;
/** How long a place's reports, and its flag, are kept (from the first one). */
const REPORT_TTL_SECONDS = 180 * 86400;
/** The flag list is kept per month; this many months (current included) are read. */
const FLAG_MONTHS = 6;
/** The maintainer's hide list is kept per year; the current and the previous year are read. */
const HIDE_TTL_SECONDS = 2 * 366 * 86400;
const DAY_TTL_SECONDS = 172800;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Place ids: "osm-n123", "apple-38.41234,27.12345", "ispark-12". */
const PLACE_RE = /^[A-Za-z0-9_.,:-]{1,80}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isPlaceId = (v: unknown): v is string => typeof v === 'string' && PLACE_RE.test(v);

export function validReport(body: unknown): ReportRequest | null {
  if (!isRecord(body)) return null;
  const { deviceId, placeId, place, kind } = body;
  if (typeof deviceId !== 'string' || !ID_RE.test(deviceId)) return null;
  if (!isPlaceId(placeId)) return null;
  if (place !== 'food' && place !== 'parking') return null;
  if (!REPORT_KINDS.includes(kind as ReportKind)) return null;
  const city = CitySchema.safeParse(body.city);
  if (!city.success) return null;
  return { deviceId, placeId, place, kind: kind as ReportKind, city: city.data };
}

/** The city of a /hidden request, or null. */
export function validCity(raw: unknown): string | null {
  const city = CitySchema.safeParse(raw);
  return city.success ? city.data : null;
}

export type ReviewRequest = { city: string; placeId: string; action: 'hide' | 'keep' };

/** The maintainer's decision on a place: hide it for everyone, or keep it (it is open). */
export function validReview(body: unknown): ReviewRequest | null {
  if (!isRecord(body)) return null;
  const city = validCity(body.city);
  if (!city || !isPlaceId(body.placeId)) return null;
  if (body.action !== 'hide' && body.action !== 'keep') return null;
  return { city, placeId: body.placeId, action: body.action };
}

/**
 * The network an address belongs to: an IPv4 /24 or an IPv6 /64 (as ipKey gives it). Phones on
 * one home Wi-Fi or one carrier block count as one.
 */
export function networkOf(ipKeyed: string): string {
  const v4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ipKeyed);
  return v4 ? `${v4[1]}.0/24` : ipKeyed;
}

/** A short hex SHA-256 of the parts. */
export async function shortHash(...parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('\u0000'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the two strings are equal, in time that does not depend on where they differ. */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([shortHash('secret', a), shortHash('secret', b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && a.length > 0;
}

/** One "closed" report: device hash, network hash, Istanbul day. */
type Closed = { d: string; n: string; day: string };
type PlaceReports = { place?: PlaceKind; closed: Closed[]; location: number; info: number };

function readJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readIds(raw: string | null): string[] {
  const v = readJson(raw);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function readPlace(raw: string | null): PlaceReports {
  const v = readJson(raw);
  const r = isRecord(v) ? v : {};
  const closed = (Array.isArray(r.closed) ? r.closed : []).filter(
    (c): c is Closed =>
      isRecord(c) &&
      typeof c.d === 'string' &&
      typeof c.n === 'string' &&
      typeof c.day === 'string',
  );
  return {
    ...(r.place === 'food' || r.place === 'parking' ? { place: r.place } : {}),
    closed,
    location: Number(r.location) || 0,
    info: Number(r.info) || 0,
  };
}

/** How strong the "closed" reports are: distinct networks, and distinct days. */
function strength(closed: Closed[]) {
  return {
    nets: new Set(closed.map((c) => c.n)).size,
    days: new Set(closed.map((c) => c.day)).size,
  };
}

const month = (now: Date) => todayIstanbul(now).slice(0, 7);
const year = (now: Date) => Number(todayIstanbul(now).slice(0, 4));

function monthsBack(now: Date, n: number): string[] {
  const [y, m] = month(now).split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7),
  );
}

const flagKeys = (city: string, now: Date) =>
  monthsBack(now, FLAG_MONTHS).map((m) => `flag:${city}:${m}`);
const hideKeys = (city: string, now: Date) =>
  [year(now), year(now) - 1].map((y) => `hide:${city}:${y}`);

async function readUnion(kv: KV, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const k of keys) for (const id of readIds(await kv.get(k))) out.add(id);
  return out;
}

async function removeFrom(kv: KV, keys: string[], placeId: string, ttl: number): Promise<void> {
  for (const k of keys) {
    const list = readIds(await kv.get(k));
    if (list.includes(placeId))
      await kv.put(k, JSON.stringify(list.filter((x) => x !== placeId)), { expirationTtl: ttl });
  }
}

export type ReportOutcome = { ok: true; flagged: boolean } | { ok: false; reason: 'device' };

/**
 * Records one report. `device` and `net` are the device and its network hashed with the place;
 * `dayDevice` is the device hashed alone, for its daily cap. A device's second "closed" for a
 * place replaces its first; reports from one network count once.
 */
export async function addReport(
  kv: KV,
  r: {
    city: string;
    placeId: string;
    place: PlaceKind;
    kind: ReportKind;
    device: string;
    net: string;
    dayDevice: string;
  },
  now: Date,
  flagAt = FLAG_AT,
): Promise<ReportOutcome> {
  const today = todayIstanbul(now);
  const dayKey = `repdev:${today}:${r.dayDevice}`;
  const sent = Number((await kv.get(dayKey)) ?? '0') || 0;
  if (sent >= REPORTS_PER_DEVICE_DAILY) return { ok: false, reason: 'device' };
  await kv.put(dayKey, String(sent + 1), { expirationTtl: DAY_TTL_SECONDS });

  const key = `rep:${r.city}:${r.placeId}`;
  const rec = readPlace(await kv.get(key));
  if (r.kind === 'closed') {
    rec.closed = [
      ...rec.closed.filter((c) => c.d !== r.device),
      { d: r.device, n: r.net, day: today },
    ];
  } else {
    rec[r.kind] += 1;
  }
  await kv.put(key, JSON.stringify({ ...rec, place: r.place }), {
    expirationTtl: REPORT_TTL_SECONDS,
  });

  const s = strength(rec.closed);
  const flagged = s.nets >= flagAt && s.days >= FLAG_DAYS;
  if (flagged) {
    const listKey = `flag:${r.city}:${month(now)}`;
    const list = readIds(await kv.get(listKey));
    if (!list.includes(r.placeId)) {
      list.push(r.placeId);
      await kv.put(listKey, JSON.stringify(list), { expirationTtl: REPORT_TTL_SECONDS });
    }
  }
  return { ok: true, flagged };
}

/**
 * What the app gets for a city: `ids` the maintainer hid, `flagged` the places enough people
 * reported closed (shown with a warning, ranked lower) that are not decided yet.
 */
export async function hiddenPlaces(
  kv: KV,
  city: string,
  now: Date,
): Promise<{ ids: string[]; flagged: string[] }> {
  const hidden = await readUnion(kv, hideKeys(city, now));
  const flagged = await readUnion(kv, flagKeys(city, now));
  return {
    ids: [...hidden].sort(),
    flagged: [...flagged].filter((id) => !hidden.has(id)).sort(),
  };
}

export type FlaggedPlace = {
  placeId: string;
  place: PlaceKind | null;
  closedNetworks: number;
  closedDays: number;
  location: number;
  info: number;
  hidden: boolean;
};

/** The maintainer's list: every flagged or hidden place of the city, with its report counts. */
export async function flaggedPlaces(kv: KV, city: string, now: Date): Promise<FlaggedPlace[]> {
  const hidden = await readUnion(kv, hideKeys(city, now));
  const ids = new Set([...(await readUnion(kv, flagKeys(city, now))), ...hidden]);
  const out: FlaggedPlace[] = [];
  for (const placeId of [...ids].sort()) {
    const rec = readPlace(await kv.get(`rep:${city}:${placeId}`));
    const s = strength(rec.closed);
    out.push({
      placeId,
      place: rec.place ?? null,
      closedNetworks: s.nets,
      closedDays: s.days,
      location: rec.location,
      info: rec.info,
      hidden: hidden.has(placeId),
    });
  }
  return out;
}

/**
 * The maintainer's decision. 'hide': hidden for everyone. 'keep': it is open; shown again, its
 * flag and "closed" reports cleared, so it takes new reports on new days to flag it again.
 */
export async function reviewPlace(kv: KV, r: ReviewRequest, now: Date): Promise<void> {
  const key = `hide:${r.city}:${year(now)}`;
  if (r.action === 'hide') {
    const list = readIds(await kv.get(key));
    if (!list.includes(r.placeId)) {
      list.push(r.placeId);
      await kv.put(key, JSON.stringify(list), { expirationTtl: HIDE_TTL_SECONDS });
    }
    return;
  }
  await removeFrom(kv, hideKeys(r.city, now), r.placeId, HIDE_TTL_SECONDS);
  await removeFrom(kv, flagKeys(r.city, now), r.placeId, REPORT_TTL_SECONDS);
  const repKey = `rep:${r.city}:${r.placeId}`;
  const rec = readPlace(await kv.get(repKey));
  if (rec.closed.length > 0)
    await kv.put(repKey, JSON.stringify({ ...rec, closed: [] }), {
      expirationTtl: REPORT_TTL_SECONDS,
    });
}
