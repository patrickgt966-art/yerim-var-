import bursaRaw from '../../data/tariffs-bursa.json';
import isparkRaw from '../../data/tariffs-ispark.json';
import izmirRaw from '../../data/tariffs-izmir.json';
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
  /** The operator prices buses or trucks only (bands then empty): not a car park. */
  heavyVehicles?: boolean;
};

// --- Vehicle classes -------------------------------------------------------
// The app is for cars. Some operators publish one band list per vehicle class
// ("0-3 Saat Otomobil", "0-3 Saat Kamyon", "Tam Gün Tır") or a park for buses only.

/** Lower case the Turkish way, so "TIR" reads as "tır" and "OTOBÜS" as "otobüs". */
const fold = (s: string) => s.toLocaleLowerCase('tr');

/** A car band: "Otomobil", "Binek". */
const CAR_WORD = /(?<!\p{L})(?:otomobil|binek)(?!\p{L})/u;
/** Vehicles that are not a car: trucks, buses, minibuses, caravans, boats. */
const HEAVY_WORD =
  /(?<!\p{L})(?:otobüs|kamyonet|kamyon|minibüs|tır|jeep|karavan|tekne|trucks?|bus(?:es)?)(?:l[ae]r)?(?:[ıiuü])?(?!\p{L})/u;
/** Bands for something other than a normal car stay: heavy vehicles, motorcycles, valet, disabled-badge rates. */
const OTHER_CLASS_WORD = /(?<!\p{L})(?:motosiklet|vale|engelli)/u;

const isCarLabel = (label: string) => CAR_WORD.test(fold(label));
const isOtherClassLabel = (label: string) => {
  const l = fold(label);
  return HEAVY_WORD.test(l) || OTHER_CLASS_WORD.test(l);
};

/**
 * The bands a car pays. When the operator names a car class, only those bands (and unclassed
 * ones); otherwise every band that names no other vehicle. Never a truck, bus or valet price.
 */
export function carBands(bands: Tariff['bands']): Tariff['bands'] {
  if (bands.some((b) => isCarLabel(b.label))) {
    return bands.filter((b) => isCarLabel(b.label) || !isOtherClassLabel(b.label));
  }
  return bands.filter((b) => !isOtherClassLabel(b.label));
}

/**
 * A car park for heavy vehicles only, by its name: "Otobüs Otoparkı", "Tır Parkı",
 * "Kamyon Garajı", "Minibüs Durağı". A bus terminal's car park ("Otobüs Terminali
 * Otoparkı") and names that also name cars stay.
 */
export function isHeavyVehicleName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = fold(name);
  if (CAR_WORD.test(n) || /(?<!\p{L})(?:otobüs|minibüs)\s+terminal/u.test(n)) return false;
  return HEAVY_WORD.test(n);
}

// The hand-kept file, the İzmir (İzelman) price list mapped by scripts/fetch-sources.mjs, the
// İSPARK tariffs collected by scripts/fetch-ispark-tariffs.mjs, then the hand-kept BURULAŞ
// (Bursa terminal) tariff.
const RAW_TARIFFS = [
  ...(raw.tariffs as Tariff[]),
  ...(izmirRaw.tariffs as Tariff[]),
  ...(isparkRaw.tariffs as Tariff[]),
  ...(bursaRaw.tariffs as Tariff[]),
];
const RAW_BY_ID = new Map(RAW_TARIFFS.map((t) => [t.parkingId, t]));

/**
 * True when the operator's tariff prices heavy vehicles only (every band names a bus, truck
 * or similar): the car park is not for cars.
 */
export function heavyVehicleTariff(parkingId: string): boolean {
  const t = RAW_BY_ID.get(parkingId);
  if (!t) return false;
  if (t.heavyVehicles) return true;
  return t.bands.length > 0 && t.bands.every((b) => HEAVY_WORD.test(fold(b.label)));
}

/** Car bands only; a tariff that had bands but none for cars says nothing about a car's price. */
function forCars(t: Tariff): Tariff | null {
  if (t.heavyVehicles) return null;
  const bands = carBands(t.bands);
  if (bands.length === t.bands.length) return t;
  if (bands.length === 0 && t.hourly == null) return null;
  const hour = bands.find((b) => /^0\s*-\s*1\s*saat/i.test(b.label))?.price ?? null;
  return { ...t, bands, hourly: t.hourly ?? hour };
}

const TARIFFS = RAW_TARIFFS.map(forCars).filter((t): t is Tariff => t != null);
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

/**
 * Length of a band in minutes from its label: "2-4 Saat" -> 240, "25 Dk-1 Saat" -> 60,
 * "Tam Gün" / "Günlük" -> a day. A vehicle class after it ("0-3 Saat Otomobil") is ignored here;
 * carBands picks the class.
 */
export function bandMinutes(label: string): number | null {
  const range = /(\d+)\s*(?:dk|dakika)?\.?\s*-\s*(\d+)\s*saat/i.exec(label);
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
  const bands = carBands(t.bands)
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

/**
 * The next moment a stay at or after `fromMin` minutes gets dearer under this tariff: the band
 * boundary, the price up to it and the price just after. Null when the price never rises again
 * within two days or the bands cannot be read.
 */
export function nextPriceStep(
  t: Tariff,
  fromMin: number,
): { atMin: number; from: number; to: number } | null {
  const bands = carBands(t.bands)
    .map((b) => bandMinutes(b.label))
    .filter((m): m is number => m != null);
  if (bands.length === 0) return null;
  const DAY = 24 * 60;
  const edges = [...new Set([t.freeMinutes ?? 0, ...bands, DAY, 2 * DAY])]
    .filter((m) => m > 0 && m >= fromMin && m <= 2 * DAY)
    .sort((a, b) => a - b);
  for (const at of edges) {
    const from = tariffCost(t, at);
    const to = tariffCost(t, at + 1);
    if (from != null && to != null && to > from) return { atMin: at, from, to };
  }
  return null;
}
