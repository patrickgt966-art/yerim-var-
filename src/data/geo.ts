export type LatLng = { lat: number; lng: number };

const R = 6371000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
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
  return `http://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d${q}`;
}
