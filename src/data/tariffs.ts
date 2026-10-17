import isparkRaw from '../../data/tariffs-ispark.json';
import raw from '../../data/tariffs.json';
import type { PriceKind } from './types';

export type Tariff = {
  parkingId: string;
  hourly: number | null;
  currency: 'TRY';
  /** Price for a stay up to the band's length ("0-1 saat", "1-2 saat", "Tam Gün"), not per hour. */
  bands: { label: string; price: number }[];
  priceKind: PriceKind;
  validFrom: string | null;
  source: string;
  verifiedAt: string | null;
  /** Minutes free of charge at the start (İSPARK: usually 15). */
  freeMinutes?: number;
  /** Monthly subscription, when the operator publishes one. */
  monthly?: number | null;
};

// The hand-kept file, then the İSPARK tariffs collected by scripts/fetch-ispark-tariffs.mjs.
const TARIFFS = [...(raw.tariffs as Tariff[]), ...(isparkRaw.tariffs as Tariff[])];
const BY_ID = new Map(TARIFFS.map((t) => [t.parkingId, t]));

export function tariffFor(parkingId: string): Tariff | null {
  const t = BY_ID.get(parkingId);
  if (!t) return null;
  // Guard: "official" requires a recorded verification.
  if (t.priceKind === 'official' && !t.verifiedAt) return { ...t, priceKind: 'estimated' };
  return t;
}

/** Estimated cost: every started hour is billed at the hourly rate. */
export function estimateCost(hourly: number | null, minutes: number): number | null {
  if (hourly == null) return null;
  return Math.max(1, Math.ceil(minutes / 60)) * hourly;
}

/** Length of a band in minutes from its label: "2-4 Saat" -> 240, "Tam Gün" / "Günlük" -> a day. */
export function bandMinutes(label: string): number | null {
  const range = /(\d+)\s*-\s*(\d+)\s*saat/i.exec(label);
  if (range) return Number(range[2]) * 60;
  if (/tam\s*gün|günlük/i.test(label)) return 24 * 60;
  return null;
}

/**
 * Cost of a stay of `minutes` from a banded tariff: free within the free minutes, then the
 * first band long enough; past the last band, the day price per started day. Null when the
 * bands cannot be read, so the caller falls back to the hourly estimate.
 */
export function tariffCost(t: Tariff, minutes: number): number | null {
  if (minutes <= (t.freeMinutes ?? 0)) return 0;
  const bands = t.bands
    .map((b) => ({ max: bandMinutes(b.label), price: b.price }))
    .filter((b): b is { max: number; price: number } => b.max != null)
    .sort((a, b) => a.max - b.max);
  if (bands.length === 0) return null;
  const fit = bands.find((b) => minutes <= b.max);
  if (fit) return fit.price;
  const day = bands.find((b) => b.max === 24 * 60);
  return day ? Math.ceil(minutes / (24 * 60)) * day.price : null;
}

/** What a stay at this car park costs: its banded tariff when known, else the hourly estimate. */
export function parkCost(parkingId: string, hourly: number | null, minutes: number): number | null {
  const t = tariffFor(parkingId);
  return (t && tariffCost(t, minutes)) ?? estimateCost(hourly ?? t?.hourly ?? null, minutes);
}

/**
 * True when at least one real (non-sample) car park has a tariff. Without
 * this the "2 saat" estimate cannot say anything, so the chips are hidden.
 */
export function hasRealTariffs(
  parkings: readonly { id: string; source: string }[],
  tariffs: readonly { parkingId: string }[] = TARIFFS,
): boolean {
  const ids = new Set(tariffs.map((t) => t.parkingId));
  return parkings.some((p) => p.source !== 'mock' && ids.has(p.id));
}
