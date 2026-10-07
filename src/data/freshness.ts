import type { Parking } from './types';

/** Source measurement older than this is no longer "live". */
export const LIVE_MAX_AGE_MS = 10 * 60 * 1000;
/** Download older than this means we no longer show a free-space count. */
export const UPDATED_MAX_AGE_MS = 15 * 60 * 1000;

export type Freshness =
  /** Source gave a real measurement time and it is recent. */
  | { kind: 'live'; at: Date }
  /** No source timestamp; we downloaded it recently. Shown as "Güncellendi: HH:mm". */
  | { kind: 'updated'; at: Date }
  /** Too old or missing. The free-space count must be hidden. */
  | { kind: 'unknown' }
  /** Mock data. Never presented as real. */
  | { kind: 'sample' }
  /** A static record (İzelman inventory, OpenStreetMap) with no occupancy at all. */
  | { kind: 'noData' };

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getFreshness(
  p: Pick<Parking, 'source' | 'updatedAt' | 'fetchedAt' | 'free'>,
  now: Date = new Date(),
): Freshness {
  if (p.source === 'mock') return { kind: 'sample' };
  if (p.source === 'osm' || p.source === 'izelman') return { kind: 'noData' };
  if (p.free == null) return { kind: 'unknown' };

  const measured = parse(p.updatedAt);
  if (measured) {
    const age = now.getTime() - measured.getTime();
    if (age >= 0 && age <= LIVE_MAX_AGE_MS) return { kind: 'live', at: measured };
    if (age >= 0 && age <= UPDATED_MAX_AGE_MS) return { kind: 'updated', at: measured };
    return { kind: 'unknown' };
  }

  const fetched = parse(p.fetchedAt);
  if (!fetched) return { kind: 'unknown' };
  const age = now.getTime() - fetched.getTime();
  if (age >= 0 && age <= UPDATED_MAX_AGE_MS) return { kind: 'updated', at: fetched };
  return { kind: 'unknown' };
}

/** Free-space count that may be shown, or null when it must read "Bilinmiyor". */
export function visibleFree(p: Parking, now: Date = new Date()): number | null {
  const f = getFreshness(p, now);
  return f.kind === 'unknown' || f.kind === 'noData' ? null : p.free;
}

export type OccupancyLevel = 'plenty' | 'few' | 'full' | 'unknown';

export function occupancyLevel(free: number | null, capacity: number | null): OccupancyLevel {
  if (free == null) return 'unknown';
  if (free <= 0) return 'full';
  if (capacity && capacity > 0 && free / capacity < 0.15) return 'few';
  if (free < 5) return 'few';
  return 'plenty';
}

export function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
