// The quota counters (device, IP, global, call fingerprints), one operation at a time.
//
// KV alone cannot do this: a check and the write after it are two calls, so parallel requests
// all read the same count and all pass (and KV writes take time to reach other locations). Every
// operation below is a whole check-and-write, and runs inside one Durable Object that handles them
// strictly one after another. Without the binding (tests) the same operations run in-process on
// KV, behind the same one-at-a-time queue.
import { FREE_DAILY } from '../../../src/lib/ai/protocol';
import {
  cancelUse,
  ipGuard,
  peek,
  releaseUse,
  takeCancelMark,
  takeUse,
  type AiLimits,
  type KV,
  type UseTaken,
} from './quota';
import { addReport, hiddenPlaces, type ReportKind, type ReportOutcome } from './reports';

const CALL_TTL_SECONDS = 172800;
const DEFAULT_TTL_SECONDS = 172800;
const HOUR_MS = 3_600_000;

/** One quota operation; times are epoch milliseconds so they cross the binding as plain JSON. */
export type QuotaOp =
  | { op: 'ipGuard'; key: string; now: number; max: number }
  | { op: 'peek'; deviceId: string; now: number }
  | {
      op: 'begin';
      deviceId: string;
      messageId: string;
      callKey: string;
      fingerprint: string;
      now: number;
      limits: AiLimits;
    }
  | { op: 'release'; deviceId: string; messageId: string; now: number }
  | { op: 'resetCall'; callKey: string }
  | { op: 'releaseIfCancelled'; deviceId: string; messageId: string; now: number }
  | { op: 'cancel'; deviceId: string; messageId: string; now: number }
  | {
      op: 'report';
      city: string;
      placeId: string;
      kind: ReportKind;
      device: string;
      dayDevice: string;
      now: number;
      hideAt: number;
    }
  | { op: 'hidden'; city: string; now: number };

/**
 * The start of an AI call: the same message and stage asked again with other content is a
 * conflict; otherwise the use is taken and the call's fingerprint stored, in one step.
 */
export type Begun = { conflict: true } | { conflict: false; previous: string | null; q: UseTaken };

export async function runOp(kv: KV, o: QuotaOp): Promise<unknown> {
  switch (o.op) {
    case 'ipGuard':
      return ipGuard(kv, o.key, new Date(o.now), o.max);
    case 'peek':
      return peek(kv, o.deviceId, new Date(o.now));
    case 'begin': {
      const previous = await kv.get(o.callKey);
      if (previous && previous !== o.fingerprint) return { conflict: true } satisfies Begun;
      const q = await takeUse(kv, o.deviceId, o.messageId, new Date(o.now), o.limits, FREE_DAILY);
      if (q.ok) await kv.put(o.callKey, o.fingerprint, { expirationTtl: CALL_TTL_SECONDS });
      return { conflict: false, previous, q } satisfies Begun;
    }
    case 'release':
      return releaseUse(kv, o.deviceId, o.messageId, new Date(o.now));
    case 'resetCall':
      await kv.put(o.callKey, '', { expirationTtl: CALL_TTL_SECONDS });
      return null;
    case 'releaseIfCancelled':
      return takeCancelMark(kv, o.deviceId, o.messageId, new Date(o.now));
    case 'cancel':
      return cancelUse(kv, o.deviceId, o.messageId, new Date(o.now));
    case 'report': {
      const { city, placeId, kind, device, dayDevice } = o;
      return addReport(kv, { city, placeId, kind, device, dayDevice }, new Date(o.now), o.hideAt);
    }
    case 'hidden':
      return hiddenPlaces(kv, o.city, new Date(o.now));
    default:
      throw new Error('unknown quota op');
  }
}

/** The quota operations the worker uses. */
export interface Quota {
  ipGuard(key: string, now: Date, max: number): Promise<boolean>;
  peek(deviceId: string, now: Date): Promise<number>;
  begin(a: {
    deviceId: string;
    messageId: string;
    callKey: string;
    fingerprint: string;
    now: Date;
    limits: AiLimits;
  }): Promise<Begun>;
  release(deviceId: string, messageId: string, now: Date): Promise<{ remaining: number }>;
  resetCall(callKey: string): Promise<void>;
  /** Gives the use back when the client cancelled this message; the new remaining, or null. */
  releaseIfCancelled(deviceId: string, messageId: string, now: Date): Promise<number | null>;
  cancel(deviceId: string, messageId: string, now: Date): Promise<{ remaining: number }>;
  report(
    r: { city: string; placeId: string; kind: ReportKind; device: string; dayDevice: string },
    now: Date,
    hideAt: number,
  ): Promise<ReportOutcome>;
  hidden(city: string, now: Date): Promise<string[]>;
}

function quotaClient(send: (o: QuotaOp) => Promise<unknown>): Quota {
  return {
    ipGuard: async (key, now, max) =>
      (await send({ op: 'ipGuard', key, now: now.getTime(), max })) === true,
    peek: async (deviceId, now) => Number(await send({ op: 'peek', deviceId, now: now.getTime() })),
    begin: async ({ now, ...a }) =>
      (await send({ op: 'begin', ...a, now: now.getTime() })) as Begun,
    release: async (deviceId, messageId, now) =>
      (await send({ op: 'release', deviceId, messageId, now: now.getTime() })) as {
        remaining: number;
      },
    resetCall: async (callKey) => {
      await send({ op: 'resetCall', callKey });
    },
    releaseIfCancelled: async (deviceId, messageId, now) => {
      const r = await send({ op: 'releaseIfCancelled', deviceId, messageId, now: now.getTime() });
      return typeof r === 'number' ? r : null;
    },
    cancel: async (deviceId, messageId, now) =>
      (await send({ op: 'cancel', deviceId, messageId, now: now.getTime() })) as {
        remaining: number;
      },
    report: async (r, now, hideAt) =>
      (await send({ op: 'report', ...r, now: now.getTime(), hideAt })) as ReportOutcome,
    hidden: async (city, now) => {
      const r = await send({ op: 'hidden', city, now: now.getTime() });
      return Array.isArray(r) ? (r as string[]) : [];
    },
  };
}

/** Runs tasks one after another; a failed task does not stop the next. */
function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

const localQueues = new WeakMap<object, ReturnType<typeof serial>>();

/** The operations in-process on a KV, one at a time per KV (tests, or no Durable Object). */
export function localQuota(kv: KV): Quota {
  let queue = localQueues.get(kv);
  if (!queue) {
    queue = serial();
    localQueues.set(kv, queue);
  }
  const q = queue;
  return quotaClient((o) => q(() => runOp(kv, o)));
}

/** The minimal Durable Object namespace the worker needs (a subset of Cloudflare's type). */
export interface QuotaNamespace {
  idFromName(name: string): unknown;
  get(id: never): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

/** The operations on the single quota Durable Object. */
export function objectQuota(ns: QuotaNamespace): Quota {
  const stub = ns.get(ns.idFromName('quota') as never);
  return quotaClient(async (o) => {
    const res = await stub.fetch('https://quota/op', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(o),
    });
    if (!res.ok) throw new Error(`quota object failed (${res.status})`);
    return res.json();
  });
}

/** Durable Object storage, as far as this file uses it. */
export interface ObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string | string[]): Promise<unknown>;
  list<T>(opts?: { limit?: number; startAfter?: string }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
}

type Stored = { v: string; e: number };

/**
 * KV on Durable Object storage: values carry their expiry, set when a key is first written and
 * never extended by later writes (a counter tied to an IP or device lives at most its TTL from
 * its first write); an alarm sweeps expired ones every hour.
 */
export function storageKV(
  storage: ObjectStorage,
  clock: () => number = Date.now,
): KV & {
  sweep(): Promise<number>;
} {
  let alarmChecked = false;
  return {
    async get(key) {
      const s = await storage.get<Stored>(key);
      if (!s) return null;
      if (s.e <= clock()) {
        await storage.delete(key);
        return null;
      }
      return s.v;
    },
    async put(key, value, opts) {
      const ttl = opts?.expirationTtl ?? DEFAULT_TTL_SECONDS;
      const now = clock();
      const old = await storage.get<Stored>(key);
      const e = old && old.e > now ? Math.min(old.e, now + ttl * 1000) : now + ttl * 1000;
      await storage.put(key, { v: value, e } satisfies Stored);
      if (!alarmChecked) {
        alarmChecked = true;
        // Also moves a later alarm (the daily one of an older version) forward.
        const alarm = await storage.getAlarm();
        if (alarm === null || alarm > clock() + HOUR_MS) await storage.setAlarm(clock() + HOUR_MS);
      }
    },
    /** Deletes every expired value; returns how many. */
    async sweep() {
      const now = clock();
      let removed = 0;
      let startAfter: string | undefined;
      for (;;) {
        const page = await storage.list<Stored>({
          limit: 512,
          ...(startAfter ? { startAfter } : {}),
        });
        if (page.size === 0) break;
        const old = [...page].filter(([, s]) => !s || s.e <= now).map(([k]) => k);
        for (let i = 0; i < old.length; i += 128) await storage.delete(old.slice(i, i + 128));
        removed += old.length;
        startAfter = [...page.keys()].pop();
        if (page.size < 512) break;
      }
      return removed;
    },
  };
}

/**
 * The quota Durable Object (one instance, named "quota"). Requests are handled one after another,
 * so a check and its write can never interleave with another request's.
 */
export class QuotaCounter {
  private readonly kv: ReturnType<typeof storageKV>;
  private readonly queue = serial();
  private readonly storage: ObjectStorage;

  constructor(state: { storage: ObjectStorage }) {
    this.storage = state.storage;
    this.kv = storageKV(state.storage);
  }

  async fetch(req: Request): Promise<Response> {
    let o: QuotaOp;
    try {
      o = (await req.json()) as QuotaOp;
    } catch {
      return new Response('bad request', { status: 400 });
    }
    try {
      const out = await this.queue(() => runOp(this.kv, o));
      return Response.json(out ?? null);
    } catch {
      return new Response('error', { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    await this.queue(() => this.kv.sweep());
    await this.storage.setAlarm(Date.now() + HOUR_MS);
  }
}
