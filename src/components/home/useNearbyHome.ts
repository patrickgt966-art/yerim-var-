import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { getFreshness } from '@/data/freshness';
import type { LatLng } from '@/data/geo';
import { rankRestaurants, restaurantsNear, type RestaurantRow } from '@/data/restaurants';
import { preferLive, rankByDistance, useParkings, type RankedParking } from '@/data/useParkings';
import { currentLocation } from '@/lib/location';
import { isClosedNow } from '@/lib/openNow';
import { buildRestaurantRows } from '@/lib/restaurantRows';
import { useHiddenPlaceIds } from '@/store/reports';

const PARK_RADIUS_M = 2000;
const FOOD_RADIUS_M = 1500;
const FOOD_LIMIT = 60;
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
  /** Places within the food radius, when the exact number is known (not cut off at the limit). */
  foodCount: number | null;
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
  const hidden = useHiddenPlaceIds();
  const { foods, foodCount } = useMemo(() => {
    if (!here || !hidden) return { foods: [], foodCount: null };
    const near = restaurantsNear(here, FOOD_RADIUS_M, FOOD_LIMIT);
    const rows = buildRestaurantRows(near, result?.parkings ?? [], here, new Date());
    // Without live data the park-ease order would jump once it arrives.
    return {
      foods: rankRestaurants(rows, placeholder ? 'distance' : 'parkEase').slice(0, PER_KIND),
      foodCount: near.length > 0 && near.length < FOOD_LIMIT ? near.length : null,
    };
  }, [here, result, placeholder, hidden]);

  const nearestFree = useMemo(
    () =>
      ranked.find((p) => {
        const f = getFreshness(p);
        return (
          !isClosedNow(p) &&
          (f.kind === 'live' || f.kind === 'updated') &&
          p.free != null &&
          p.free > 0
        );
      }) ?? null,
    [ranked],
  );

  // `ranked` puts live car parks first; the "nearest" line means the truly nearest one (an open
  // one when there is any).
  const nearestWalk = useMemo(() => {
    const open = ranked.filter((p) => !isClosedNow(p));
    const pool = open.length > 0 ? open : ranked;
    let best: RankedParking | null = null;
    for (const p of pool) if (!best || p.distance < best.distance) best = p;
    return best?.walk ?? null;
  }, [ranked]);

  return {
    here,
    needsPermission,
    canAsk,
    dismissed,
    dismiss: () => setDismissed(true),
    allow,
    parks,
    foods,
    foodCount,
    nearestFree,
    nearestWalk,
  };
}
