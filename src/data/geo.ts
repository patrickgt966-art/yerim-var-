export type LatLng = { lat: number; lng: number };

const R = 6371000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Rough walking time. Straight-line distance × 1.3 detour factor at 80 m/min.
 * Always displayed with "~" because it is not a routed estimate.
 */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round((distanceMeters(a, b) * 1.3) / 80));
}

/** Apple Maps hand-off. The app itself never gives directions. */
export function appleMapsUrl(dest: LatLng, name?: string): string {
  const q = name ? `&q=${encodeURIComponent(name)}` : '';
  return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d${q}`;
}

/** Apple Maps walking directions between two points (no routing in the app). */
export function appleWalkingUrl(from: LatLng, to: LatLng, name?: string): string {
  const q = name ? `&q=${encodeURIComponent(name)}` : '';
  return `https://maps.apple.com/?saddr=${from.lat},${from.lng}&daddr=${to.lat},${to.lng}&dirflg=w${q}`;
}

/** Apple Maps walking directions from the user's current location (no saddr). */
export function appleWalkToUrl(dest: LatLng, name?: string): string {
  const q = name ? `&q=${encodeURIComponent(name)}` : '';
  return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=w${q}`;
}

const M_PER_DEG = 111_320;

export type GridIndex<T extends LatLng> = {
  cellLat: number;
  cellLng: number;
  cells: Map<string, T[]>;
};

function cellKey(i: number, j: number): string {
  return `${i}:${j}`;
}

/** Longitude degrees per metre at a latitude (clamped near the poles). */
function lngPerMeter(lat: number): number {
  return 1 / (M_PER_DEG * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
}

/**
 * Buckets points into a grid of roughly `cellMeters` so that `near` only looks
 * at a few cells instead of every point. Points with non-finite coordinates
 * are skipped.
 */
export function gridIndex<T extends LatLng>(points: T[], cellMeters: number): GridIndex<T> {
  const first = points.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const cellLat = cellMeters / M_PER_DEG;
  const cellLng = cellMeters * lngPerMeter(first?.lat ?? 0);
  const cells = new Map<string, T[]>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const key = cellKey(Math.floor(p.lat / cellLat), Math.floor(p.lng / cellLng));
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }
  return { cellLat, cellLng, cells };
}

/** Points of the index within `radius` metres of `p` (exact distance check). */
export function near<T extends LatLng>(index: GridIndex<T>, p: LatLng, radius: number): T[] {
  const out: T[] = [];
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return out;
  const dLat = Math.ceil(radius / M_PER_DEG / index.cellLat);
  const dLng = Math.ceil((radius * lngPerMeter(p.lat)) / index.cellLng);
  const ci = Math.floor(p.lat / index.cellLat);
  const cj = Math.floor(p.lng / index.cellLng);
  for (let i = ci - dLat; i <= ci + dLat; i++) {
    for (let j = cj - dLng; j <= cj + dLng; j++) {
      const bucket = index.cells.get(cellKey(i, j));
      if (!bucket) continue;
      for (const q of bucket) if (distanceMeters(p, q) <= radius) out.push(q);
    }
  }
  return out;
}
