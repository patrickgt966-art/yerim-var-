import { z } from 'zod';

import type { OpeningHours, Parking, ParkingProvider } from './types';

/**
 * İzmir Büyükşehir open data: "Otopark Doluluk ve Lokasyon Bilgileri".
 *
 * NOT VERIFIED LIVE. The endpoint and schema below come from third-party
 * open-source clients (see docs/inspiration.md); this project's build
 * environment could not reach the API. Verify with docs/data-source.md
 * before relying on it.
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
    const hours: OpeningHours | null = r.openingHours
      ? Object.fromEntries(Object.entries(r.openingHours).filter(([d]) => DAYS.includes(d)))
      : null;
    out.push({
      id: r.ufid,
      name: r.name.trim(),
      lat: r.lat,
      lng: r.lng,
      capacity: free != null && occupied != null ? free + occupied : null,
      free,
      isIndoor: r.accessories?.covered ?? null,
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
    } finally {
      clearTimeout(timer);
    }
  }
}
