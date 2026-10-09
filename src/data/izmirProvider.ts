import { z } from 'zod';

import type { OpeningHours, Parking, ParkingProvider } from './types';

/**
 * İzmir Büyükşehir open data: "Otopark Doluluk ve Lokasyon Bilgileri".
 *
 * Schema checked against a live response on 2026-10-07 (see
 * docs/data-source.md). Response headers, CORS and update frequency are
 * still unverified.
 */
export const IZMIR_PARKING_URL = 'https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar';

const count = z.number().finite().nonnegative();

const RecordSchema = z.object({
  ufid: z.string().min(1),
  // Trim first: a blank name is no name and the record is dropped.
  name: z.string().trim().min(1),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  type: z.string().optional(),
  status: z.string().optional(),
  address: z.string().nullish(),
  isPaid: z.boolean().nullish(),
  nonstop: z.boolean().nullish(),
  openingHours: z.record(z.string(), z.string()).nullish(),
  occupancy: z.object({
    total: z.object({ free: count.nullish(), occupied: count.nullish() }),
    // Present on some records only; a malformed block must not drop the record.
    disabled: z
      .object({ free: count.nullish(), occupied: count.nullish() })
      .nullish()
      .catch(undefined),
  }),
  accessibility: z.object({ disabled: z.boolean().nullish() }).partial().nullish().catch(undefined),
  accessories: z.object({ covered: z.boolean().nullish() }).partial().nullish(),
});

/** Keys whose absence means the whole response changed shape. */
const REQUIRED_KEYS = ['ufid', 'lat', 'lng', 'occupancy'] as const;

export class SchemaDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaDriftError';
  }
}

/** Longest name we keep. */
const MAX_NAME_LENGTH = 120;

/** Space counts are whole numbers; a fraction means the source is unsure, so it is unknown. */
const wholeOrNull = (n: number | null | undefined): number | null =>
  n != null && Number.isInteger(n) ? n : null;

const PLACEHOLDER_HOURS = /^[\s\-–—]*$/;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Normalizes a raw response. Bad records are dropped; schema drift throws. */
export function normalizeIzmir(raw: unknown, fetchedAt: string): Parking[] {
  if (!Array.isArray(raw)) throw new SchemaDriftError('Yanıt bir dizi değil');
  // An empty list is an outage, not "no car parks": keep the saved data.
  if (raw.length === 0) throw new SchemaDriftError('Boş yanıt');
  const anyValid = raw.some(
    (r) => r && typeof r === 'object' && REQUIRED_KEYS.every((k) => k in (r as object)),
  );
  if (!anyValid) throw new SchemaDriftError('Zorunlu alanlar hiçbir kayıtta yok');

  const out: Parking[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = RecordSchema.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    // Duplicate ids would break list keys and favourites: keep the first.
    if (seen.has(r.ufid)) continue;
    seen.add(r.ufid);
    const free = wholeOrNull(r.occupancy.total.free);
    const occupied = wholeOrNull(r.occupancy.total.occupied);
    const dFree = wholeOrNull(r.occupancy.disabled?.free);
    const dOccupied = wholeOrNull(r.occupancy.disabled?.occupied);
    const dTotal = dFree != null && dOccupied != null ? dFree + dOccupied : null;
    // 0 + 0 means the source has no disabled bays to count.
    const dCapacity = dTotal != null && dTotal > 0 ? dTotal : null;
    // Nonstop car parks send "–" for every day; keep only real values.
    const hourEntries = Object.entries(r.openingHours ?? {}).filter(
      ([d, v]) => DAYS.includes(d) && !PLACEHOLDER_HOURS.test(v),
    );
    const hours: OpeningHours | null =
      hourEntries.length > 0 ? Object.fromEntries(hourEntries) : null;
    out.push({
      id: r.ufid,
      name: r.name.slice(0, MAX_NAME_LENGTH),
      lat: r.lat,
      lng: r.lng,
      capacity: free != null && occupied != null ? free + occupied : null,
      free,
      // Live data reports covered:false even for multi-storey car parks
      // (e.g. "Konak Katlı Otopark"), so only `true` is trusted.
      isIndoor: r.accessories?.covered === true ? true : null,
      isOpen: r.status === 'Opened' ? true : r.status === 'Closed' ? false : null,
      isPaid: r.isPaid ?? null,
      nonstop: r.nonstop ?? null,
      openingHours: hours,
      address: r.address ? r.address : null,
      ...(dFree != null && dCapacity != null
        ? { disabledFree: dFree, disabledCapacity: dCapacity }
        : {}),
      ...(dCapacity != null || r.accessibility?.disabled === true
        ? { hasDisabledSpots: true }
        : {}),
      source: 'izmir-open-data',
      // The source has no measurement timestamp; never invent one.
      updatedAt: null,
      fetchedAt,
      occupancyKind: 'estimated',
    });
  }
  // Most records failing validation means the schema changed under us.
  if (out.length < raw.length / 2) {
    throw new SchemaDriftError(`Kayıtların çoğu geçersiz (${out.length}/${raw.length})`);
  }
  return out;
}

export class IzmirOpenDataProvider implements ParkingProvider {
  readonly source = 'izmir-open-data' as const;

  constructor(
    private readonly url = IZMIR_PARKING_URL,
    // The API took ~15 s on a phone (2026-10-07); the brief's 10 s was too short.
    // Retries get this long; the first attempt is shorter so a hung request
    // gives up sooner (see `firstTimeoutMs`).
    private readonly timeoutMs = 30_000,
    private readonly firstTimeoutMs = Math.min(20_000, timeoutMs),
  ) {}

  async list(signal?: AbortSignal, attempt = 0): Promise<Parking[]> {
    const limitMs = attempt === 0 ? this.firstTimeoutMs : this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limitMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(this.url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      return normalizeIzmir(json, new Date().toISOString());
    } catch (e) {
      // Name the timeout plainly instead of a generic "Aborted".
      if (controller.signal.aborted && !signal?.aborted) {
        throw new Error(`Zaman aşımı (${limitMs / 1000} sn)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
