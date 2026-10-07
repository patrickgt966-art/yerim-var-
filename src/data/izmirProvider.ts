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
  name: z.string().min(1),
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
  }),
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

const PLACEHOLDER_HOURS = /^[\s\-–—]*$/;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Normalizes a raw response. Bad records are dropped; schema drift throws. */
export function normalizeIzmir(raw: unknown, fetchedAt: string): Parking[] {
  if (!Array.isArray(raw)) throw new SchemaDriftError('Yanıt bir dizi değil');
  if (raw.length > 0) {
    const anyValid = raw.some(
      (r) => r && typeof r === 'object' && REQUIRED_KEYS.every((k) => k in (r as object)),
    );
    if (!anyValid) throw new SchemaDriftError('Zorunlu alanlar hiçbir kayıtta yok');
  }

  const out: Parking[] = [];
  for (const item of raw) {
    const parsed = RecordSchema.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    const free = r.occupancy.total.free ?? null;
    const occupied = r.occupancy.total.occupied ?? null;
    // Nonstop car parks send "–" for every day; keep only real values.
    const hourEntries = Object.entries(r.openingHours ?? {}).filter(
      ([d, v]) => DAYS.includes(d) && !PLACEHOLDER_HOURS.test(v),
    );
    const hours: OpeningHours | null =
      hourEntries.length > 0 ? Object.fromEntries(hourEntries) : null;
    out.push({
      id: r.ufid,
      name: r.name.trim(),
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
      source: 'izmir-open-data',
      // The source has no measurement timestamp; never invent one.
      updatedAt: null,
      fetchedAt,
      occupancyKind: 'estimated',
    });
  }
  return out;
}

export class IzmirOpenDataProvider implements ParkingProvider {
  readonly source = 'izmir-open-data' as const;

  constructor(
    private readonly url = IZMIR_PARKING_URL,
    private readonly timeoutMs = 10_000,
  ) {}

  async list(signal?: AbortSignal): Promise<Parking[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    signal?.addEventListener('abort', () => controller.abort());
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
        throw new Error(`Zaman aşımı (${this.timeoutMs / 1000} sn)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
