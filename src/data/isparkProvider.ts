import { z } from 'zod';

import { SchemaDriftError } from './izmirProvider';
import { heavyVehicleTariff, isHeavyVehicleName } from './tariffs';
import type { Parking, ParkingProvider } from './types';

/**
 * İBB (İstanbul) open data: İSPARK car parks with live free spaces.
 *
 * The shape below is checked against a live capture of the endpoint
 * (data/raw/ispark-sample.json, 2026-10-17, tested in isparkLive.test.ts):
 * string coordinates, `isOpen` 0/1, `parkType` "KAPALI OTOPARK" / "AÇIK
 * OTOPARK" / "YOL ÜSTÜ", and a placeholder `emptyCapacity` of 1 on every street
 * record. CORS, response headers and the update frequency are still unmeasured.
 */
export const ISPARK_PARKING_URL = 'https://api.ibb.gov.tr/ispark/Park';

/** A number that may arrive as a string ("41.0563", "41,0563"); anything else fails. */
const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((v) => (typeof v === 'string' ? Number(v.replace(',', '.')) : v))
  .pipe(z.number().finite());

/** An optional count: a malformed value is unknown, it never drops the record. */
const count = numeric.pipe(z.number().nonnegative()).nullish().catch(undefined);

const RecordSchema = z.object({
  parkID: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]),
  // Trim first: a blank name is no name and the record is dropped.
  parkName: z.string().trim().min(1),
  lat: numeric.pipe(z.number().min(-90).max(90)),
  lng: numeric.pipe(z.number().min(-180).max(180)),
  capacity: count,
  emptyCapacity: count,
  freeTime: count,
  workHours: z.string().nullish().catch(undefined),
  parkType: z.string().nullish().catch(undefined),
  district: z.string().nullish().catch(undefined),
  isOpen: z.union([z.number(), z.string(), z.boolean()]).nullish().catch(undefined),
});

/** Keys whose absence means the whole response changed shape. */
const REQUIRED_KEYS = ['parkID', 'parkName', 'lat', 'lng'] as const;

/** Longest name we keep. */
const MAX_NAME_LENGTH = 120;

/** "08:00-20:00" or "08:00 – 20:00": the one text format openState reads. */
const HOURS_RANGE = /^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/;

/** "24 Saat" / "24 saat" / "7/24": open round the clock. */
const ROUND_THE_CLOCK = /^(?:24\s*saat|7\s*\/\s*24|24\s*\/\s*7|24)$/i;

/** Whole counts only; a fraction means the source is unsure, so it is unknown. */
const wholeOrNull = (n: number | null | undefined): number | null =>
  n != null && Number.isInteger(n) ? n : null;

/** Turkish upper case without the dotted-İ trouble: "Kapalı" and "KAPALI" both match. */
const typeKey = (s: string) => s.toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();

function openFlag(v: string | number | boolean | null | undefined): boolean | null {
  if (v === 1 || v === true || v === '1') return true;
  if (v === 0 || v === false || v === '0') return false;
  return null;
}

/** Normalizes a raw response. Bad records are dropped; schema drift throws. */
export function normalizeIspark(raw: unknown, fetchedAt: string): Parking[] {
  if (!Array.isArray(raw)) throw new SchemaDriftError('Yanıt bir dizi değil');
  // An empty list is an outage, not "no car parks": keep the saved data.
  if (raw.length === 0) throw new SchemaDriftError('Boş yanıt');
  const anyValid = raw.some(
    (r) => r && typeof r === 'object' && REQUIRED_KEYS.every((k) => k in (r as object)),
  );
  if (!anyValid) throw new SchemaDriftError('Zorunlu alanlar hiçbir kayıtta yok');

  const out: Parking[] = [];
  const seen = new Set<string>();
  // Valid records left out on purpose (bus / truck parks): not a sign of schema drift.
  let skipped = 0;
  for (const item of raw) {
    const parsed = RecordSchema.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    // A (0, 0) point is the source's "no location", not a car park off Africa.
    if (r.lat === 0 && r.lng === 0) continue;
    // Prefixed so an İSPARK id can never equal an id of another source.
    const id = `ispark-${r.parkID}`;
    // Duplicate ids would break list keys and favourites: keep the first.
    if (seen.has(id)) continue;
    seen.add(id);
    // A bus or truck park ("… Otobüs Otoparkı", a tariff for buses only) is no place for a car.
    if (isHeavyVehicleName(r.parkName) || heavyVehicleTariff(id)) {
      skipped++;
      continue;
    }
    // 0 means "not counted", not a car park with no bays.
    const total = wholeOrNull(r.capacity);
    const capacity = total != null && total > 0 ? total : null;
    const type = r.parkType ? typeKey(r.parkType) : '';
    // Street parking ("YOL ÜSTÜ") is not counted: the live list sends emptyCapacity 1 for every
    // such record, open or closed (data/raw/ispark-sample.json). A placeholder, not a free count.
    let free = type.startsWith('YOL ÜSTÜ') ? null : wholeOrNull(r.emptyCapacity);
    // More free bays than bays is a broken count: unknown, not clamped.
    if (free != null && capacity != null && free > capacity) free = null;
    const hours = r.workHours?.trim() ?? '';
    const nonstop = ROUND_THE_CLOCK.test(hours) ? true : null;
    out.push({
      id,
      name: r.parkName.slice(0, MAX_NAME_LENGTH),
      lat: r.lat,
      lng: r.lng,
      capacity,
      free,
      // Only the closed type is trusted; "AÇIK" and "YOL ÜSTÜ" say nothing about a roof.
      isIndoor: type.startsWith('KAPALI') ? true : null,
      isOpen: openFlag(r.isOpen),
      isPaid: true,
      nonstop,
      openingHours: null,
      openingHoursText: HOURS_RANGE.test(hours) ? hours : null,
      address: r.district?.trim() ? r.district.trim() : null,
      operator: 'İSPARK',
      source: 'ispark',
      // The source has no measurement timestamp; never invent one.
      updatedAt: null,
      fetchedAt,
      occupancyKind: 'estimated',
    });
  }
  // Most records failing validation means the schema changed under us.
  if (out.length + skipped < raw.length / 2) {
    throw new SchemaDriftError(`Kayıtların çoğu geçersiz (${out.length}/${raw.length})`);
  }
  return out;
}

export class IsparkProvider implements ParkingProvider {
  readonly source = 'ispark' as const;

  constructor(
    private readonly url = ISPARK_PARKING_URL,
    // Unmeasured: same limits as the İzmir provider until a device run shows otherwise.
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
      return normalizeIspark(json, new Date().toISOString());
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
