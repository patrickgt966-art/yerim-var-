import * as Location from 'expo-location';

import type { LatLng } from '@/data/geo';

/**
 * Foreground location only. Returns null if permission is denied or lookup
 * fails. `timeoutMs` limits the position fix only, never the permission prompt.
 */
export async function currentLocation(ask = true, timeoutMs?: number): Promise<LatLng | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain)
      perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const fix = (async () => {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      return (
        last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
      );
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pos = timeoutMs
      ? await Promise.race([
          fix,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), timeoutMs);
          }),
        ]).finally(() => clearTimeout(timer))
      : await fix;
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** On-device geocoding (Apple on iOS). Biased to İzmir by appending the city. */
export async function geocode(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const withCity = /izmir|i̇zmir/i.test(q) ? q : `${q}, İzmir`;
    const [hit] = await Location.geocodeAsync(withCity);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

/** Street-level address for a point, or null when unavailable. */
export async function reverseStreet(
  loc: LatLng,
): Promise<{ street: string | null; name: string | null } | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: loc.lat, longitude: loc.lng });
    if (!a) return null;
    const street = a.street ? [a.street, a.streetNumber].filter(Boolean).join(' ') : null;
    return { street, name: null };
  } catch {
    return null;
  }
}
