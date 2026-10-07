import * as Location from 'expo-location';

import type { LatLng } from '@/data/geo';

/** Foreground location only. Returns null if permission is denied or lookup fails. */
export async function currentLocation(ask = true): Promise<LatLng | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain)
      perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const pos =
      last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
