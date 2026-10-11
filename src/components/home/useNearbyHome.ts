import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { getFreshness } from '@/data/freshness';
import type { LatLng } from '@/data/geo';
import { rankRestaurants, restaurantsNear, type RestaurantRow } from '@/data/restaurants';
import { preferLive, rankByDistance, useParkings, type RankedParking } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { buildRestaurantRows } from '@/lib/restaurantRows';

const PARK_RADIUS_M = 2000;
const FOOD_RADIUS_M = 1500;
/** Rows kept per kind; the card shows at most 4 in total. */
export const PER_KIND = 4;

export type NearbyHome = {
  here: LatLng | null;
  /** Location permission is missing: the card asks instead of listing. */
  needsPermission: boolean;
  canAsk: boolean;
  dismissed: boolean;
  dismiss: () => void;
  allow: () => Promise<void>;
  parks: RankedParking[];
  foods: RestaurantRow[];
  /** Nearest car park with a fresh, real free count above zero. */
  nearestFree: RankedParking | null;
  /** Walking minutes to the nearest car park of any kind, if known. */
  nearestWalk: number | null;
};

/**
 * The user's position plus the nearest car parks and restaurants for the home
 * screen. Same location rules as before: never prompts by itself, re-checks on
 * every focus, and falls back to a card that asks (or opens Settings).
 */
export function useNearbyHome(): NearbyHome {
  const q = useParkings();
  const result = q.data;
  const [here, setHere] = useState<LatLng | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [canAsk, setCanAsk] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const checkPermission = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      setNeedsPermission(!perm.granted);
      setCanAsk(perm.canAskAgain);
    } catch {
      setNeedsPermission(false);
    }
  }, []);

  const allow = useCallback(async () => {
    if (!canAsk) {
      void Linking.openSettings();
      return;
    }
    const loc = await currentLocation(true, 5000);
    if (loc) setHere(loc);
    await checkPermission();
  }, [canAsk, checkPermission]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      currentLocation(false, 5000).then((loc) => {
        if (!alive) return;
        setHere(loc);
        if (!loc) void checkPermission();
        else setNeedsPermission(false);
      });
      return () => {
        alive = false;
      };
    }, [checkPermission]),
  );

  const ranked = useMemo(
    () => (result && here ? preferLive(rankByDistance(result.parkings, here, PARK_RADIUS_M)) : []),
    [result, here],
  );
  const parks = useMemo(() => ranked.slice(0, PER_KIND), [ranked]);

  const placeholder = q.isPlaceholderData;
  const foods = useMemo(() => {
    if (!here) return [];
    const near = restaurantsNear(here, FOOD_RADIUS_M, 60);
    const rows = buildRestaurantRows(near, result?.parkings ?? [], here, new Date());
    // Without live data the park-ease order would jump once it arrives.
    return rankRestaurants(rows, placeholder ? 'distance' : 'parkEase').slice(0, PER_KIND);
  }, [here, result, placeholder]);

  const nearestFree = useMemo(
    () =>
      ranked.find((p) => {
        const f = getFreshness(p);
        return (f.kind === 'live' || f.kind === 'updated') && p.free != null && p.free > 0;
      }) ?? null,
    [ranked],
  );

  return {
    here,
    needsPermission,
    canAsk,
    dismissed,
    dismiss: () => setDismissed(true),
    allow,
    parks,
    foods,
    nearestFree,
    nearestWalk: ranked[0]?.walk ?? null,
  };
}
