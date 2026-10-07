import raw from '../../data/tariffs.json';
import type { PriceKind } from './types';

export type Tariff = {
  parkingId: string;
  hourly: number | null;
  currency: 'TRY';
  bands: { label: string; price: number }[];
  priceKind: PriceKind;
  validFrom: string | null;
  source: string;
  verifiedAt: string | null;
};

const TARIFFS = raw.tariffs as Tariff[];

export function tariffFor(parkingId: string): Tariff | null {
  const t = TARIFFS.find((x) => x.parkingId === parkingId);
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
