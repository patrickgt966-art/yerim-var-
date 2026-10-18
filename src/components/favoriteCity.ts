import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { activeCity, CITIES, cityAt, type City } from '@/data/cities';
import { foodFile, foodOvertureFile } from '@/data/cityData';
import type { LatLng } from '@/data/geo';
import { getRestaurant, toRestaurant, type Restaurant } from '@/data/restaurants';

/**
 * Favourites stay when the city changes, but each screen only reads the active city's data.
 * These helpers find which city a favourite belongs to and switch to it before opening it.
 */

/** The open city a saved place lies in, if any. */
export const cityOfPlace = (p: LatLng): City | undefined => cityAt(p);

// Other cities' restaurants by id, built only when a favourite needs them. An Overture id
// ("ov-...") is only in the Overture file, every other id only in the OpenStreetMap file.
const byCity = new Map<string, Map<string, Restaurant>>();
function lookup(cityId: string, overture: boolean, id: string): Restaurant | null {
  const key = `${cityId}|${overture ? 'ov' : 'osm'}`;
  let map = byCity.get(key);
  if (!map) {
    const file = overture ? foodOvertureFile(cityId) : foodFile(cityId);
    map = new Map((file.items ?? []).map((r) => [r.id, toRestaurant(r)]));
    byCity.set(key, map);
  }
  return map.get(id) ?? null;
}

/** A saved restaurant with its city: the active city first, then the other open cities. */
export function findFavoriteRestaurant(id: string): { r: Restaurant; city: City } | null {
  const here = activeCity();
  const r = getRestaurant(id);
  if (r) return { r, city: here };
  const overture = id.startsWith('ov-');
  for (const city of CITIES) {
    if (!city.available || city.id === here.id) continue;
    const hit = lookup(city.id, overture, id);
    if (hit) return { r: hit, city };
  }
  return null;
}

/**
 * Opens a favourite: at once in the active city; for another city the user is asked to switch
 * to it first (its data is what the detail screen reads), or can stay.
 */
export function openInCity(
  city: City | undefined,
  name: string,
  t: TFunction,
  setCity: (id: string) => void,
  open: () => void,
): void {
  if (!city || city.id === activeCity().id) return open();
  Alert.alert(
    t('favorites.otherCityTitle', { name }),
    t('favorites.otherCityBody', { city: city.name, cityLoc: city.locative }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('favorites.switchCity', { city: city.name }),
        onPress: () => {
          setCity(city.id);
          open();
        },
      },
    ],
  );
}
