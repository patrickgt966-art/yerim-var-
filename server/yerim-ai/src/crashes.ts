// JS error reports from the app (POST /crash). Anonymous: the message, a short stack and the
// app / OS version, no device id, no location, no user text. One KV record per day and distinct
// error (the key holds a hash of the message and the first stack line) with a counter, the first
// and last time seen and one sample. The maintainer reads them at GET /admin/crashes.
import { todayIstanbul } from '../../../src/lib/ai/protocol';
import type { KV } from './quota';
import { shortHash } from './reports';

/** Largest request body accepted, in bytes. */
export const CRASH_BODY_MAX = 8 * 1024;
/** How long a record is kept. */
export const CRASH_TTL_SECONDS = 30 * 86400;
/** The admin list reads the last this many days, and at most this many records (each one is a KV
 * read; a Worker may make only 50 subrequests on the free plan). */
const LIST_DAYS = 7;
const LIST_MAX = 36;

export type CrashSample = {
  message: string;
  stack: string;
  appVersion: string;
  buildNumber: string;
  os: string;
  osVersion: string;
  route: string;
  fatal: boolean;
};

export type CrashRecord = {
  count: number;
  first: string;
  last: string;
  sample: CrashSample;
};

export type CrashListItem = CrashRecord & { id: string };

export interface CrashKV extends KV {
  list(opts: { prefix: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** [field, longest allowed length] of the text fields; `stack` may be empty. */
const TEXT_FIELDS = [
  ['message', 300],
  ['stack', 4000],
  ['appVersion', 32],
  ['buildNumber', 32],
  ['os', 16],
  ['osVersion', 32],
  ['route', 200],
] as const;

/** The sample when every field has the right type and size, else null (nothing is cut here). */
export function validCrash(body: unknown): CrashSample | null {
  if (!isRecord(body)) return null;
  if (typeof body.fatal !== 'boolean') return null;
  const out: Record<string, string> = {};
  for (const [field, max] of TEXT_FIELDS) {
    const v = body[field];
    if (typeof v !== 'string' || v.length > max) return null;
    out[field] = v;
  }
  if (out.message === '') return null;
  return { ...(out as Omit<CrashSample, 'fatal'>), fatal: body.fatal };
}

const hashOf = (s: CrashSample): Promise<string> =>
  shortHash('crash', s.message, s.stack.split('\n')[0] ?? '');

/** Counts one report. (KV has no atomic add: two reports in the same instant may count as one.) */
export async function recordCrash(kv: KV, sample: CrashSample, now: Date): Promise<void> {
  const key = `crash:${todayIstanbul(now)}:${await hashOf(sample)}`;
  const at = now.toISOString();
  let rec: CrashRecord | null = null;
  try {
    const raw = await kv.get(key);
    rec = raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    rec = null;
  }
  const next: CrashRecord =
    rec && typeof rec.count === 'number'
      ? { ...rec, count: rec.count + 1, last: at }
      : { count: 1, first: at, last: at, sample };
  await kv.put(key, JSON.stringify(next), { expirationTtl: CRASH_TTL_SECONDS });
}

/** The recent errors, most frequent first. The same error on several days is one item. */
export async function listCrashes(kv: CrashKV, now: Date): Promise<CrashListItem[]> {
  const keys: string[] = [];
  for (let i = 0; i < LIST_DAYS && keys.length < LIST_MAX; i++) {
    const day = todayIstanbul(new Date(now.getTime() - i * 86400_000));
    const { keys: found } = await kv.list({
      prefix: `crash:${day}:`,
      limit: LIST_MAX - keys.length,
    });
    keys.push(...found.map((k) => k.name));
  }
  const byId = new Map<string, CrashListItem>();
  for (const key of keys) {
    let rec: CrashRecord | null = null;
    try {
      const raw = await kv.get(key);
      rec = raw ? (JSON.parse(raw) as CrashRecord) : null;
    } catch {
      rec = null;
    }
    if (!rec || typeof rec.count !== 'number' || !isRecord(rec.sample)) continue;
    const id = key.slice(key.lastIndexOf(':') + 1);
    const old = byId.get(id);
    if (!old) {
      byId.set(id, { id, ...rec });
      continue;
    }
    // Keys come newest day first: keep the newest sample, widen the time span, add the counts.
    old.count += rec.count;
    if (rec.first < old.first) old.first = rec.first;
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}
