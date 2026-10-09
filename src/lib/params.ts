import type { LatLng } from '@/data/geo';

/** A route param can arrive as `?id=a&id=b` (array); take the first. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s : undefined;
}

function toCoord(v: string | string[] | undefined, limit: number): number | null {
  const s = firstParam(v)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** Coordinates from route params, or null if either is missing, blank or out of range. */
export function parseLatLng(
  lat: string | string[] | undefined,
  lng: string | string[] | undefined,
): LatLng | null {
  const la = toCoord(lat, 90);
  const ln = toCoord(lng, 180);
  return la == null || ln == null ? null : { lat: la, lng: ln };
}
