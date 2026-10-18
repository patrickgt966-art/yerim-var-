import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Alert, Linking } from 'react-native';

import { appleMapsUrl, type LatLng } from '@/data/geo';
import { MAP_APPS, type MapApp } from '@/data/mapApps';
import i18n from '@/i18n';
import { useApp } from '@/store/app';

export { MAP_APPS, type MapApp };
export type TravelMode = 'drive' | 'walk';
export type DirectionsResult = 'opened' | 'cancelled' | 'failed';

/** The URLs to try for a hand-off, in order: the app's own scheme first, then a universal link. */
export function directionsUrls(
  app: MapApp,
  dest: LatLng,
  name: string | undefined,
  mode: TravelMode,
): string[] {
  const ll = `${dest.lat},${dest.lng}`;
  const walk = mode === 'walk';
  switch (app) {
    case 'google':
      return [
        `comgooglemaps://?daddr=${ll}&directionsmode=${walk ? 'walking' : 'driving'}`,
        `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=${walk ? 'walking' : 'driving'}`,
      ];
    case 'yandex':
      return [
        walk
          ? `yandexmaps://maps.yandex.com/?rtext=~${ll}&rtt=pd`
          : `yandexnavi://build_route_on_map?lat_to=${dest.lat}&lon_to=${dest.lng}`,
        `https://yandex.com.tr/maps/?rtext=~${ll}&rtt=${walk ? 'pd' : 'auto'}`,
      ];
    case 'waze':
      // Waze has no walking mode.
      if (walk) return [appleMapsUrl(dest, name, mode)];
      return [`waze://?ll=${ll}&navigate=yes`, `https://waze.com/ul?ll=${ll}&navigate=yes`];
    default:
      return [appleMapsUrl(dest, name, mode)];
  }
}

const PROBE_SCHEMES: Record<Exclude<MapApp, 'apple'>, string[]> = {
  google: ['comgooglemaps://'],
  yandex: ['yandexnavi://', 'yandexmaps://'],
  waze: ['waze://'],
};

async function canOpen(schemes: string[]): Promise<boolean> {
  for (const scheme of schemes) {
    try {
      if (await Linking.canOpenURL(scheme)) return true;
    } catch {
      // Counts as not installed.
    }
  }
  return false;
}

/** Apple Maps always; the others only when the phone can open their scheme. */
export async function installedMapApps(): Promise<MapApp[]> {
  // Expo Go cannot see these schemes (its Info.plist is fixed), so offer everything there.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return [...MAP_APPS];
  const found: MapApp[] = ['apple'];
  for (const app of MAP_APPS) {
    if (app === 'apple') continue;
    if (await canOpen(PROBE_SCHEMES[app])) found.push(app);
  }
  return found;
}

function askApp(apps: MapApp[]): Promise<MapApp | null> {
  const t = i18n.t.bind(i18n);
  return new Promise((resolve) => {
    Alert.alert(t('directions.chooseTitle'), t('directions.chooseBody'), [
      ...apps.map((app) => ({ text: t(`directions.apps.${app}`), onPress: () => resolve(app) })),
      { text: t('common.cancel'), style: 'cancel' as const, onPress: () => resolve(null) },
    ]);
  });
}

async function tryUrls(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Try the next one.
    }
  }
  return false;
}

/**
 * Hands the destination to the user's map app. The first time (no saved choice) it asks which app,
 * unless Apple Maps is the only one installed, and remembers the answer.
 */
export async function openDirections(
  dest: LatLng,
  name?: string,
  mode: TravelMode = 'drive',
): Promise<DirectionsResult> {
  let app = useApp.getState().mapApp;
  if (!app) {
    const apps = (await installedMapApps()).filter((a) => mode !== 'walk' || a !== 'waze');
    if (apps.length <= 1) {
      app = 'apple';
    } else {
      const chosen = await askApp(apps);
      if (!chosen) return 'cancelled';
      useApp.getState().setMapApp(chosen);
      app = chosen;
    }
  }
  if (await tryUrls(directionsUrls(app, dest, name, mode))) return 'opened';
  if (app !== 'apple' && (await tryUrls(directionsUrls('apple', dest, name, mode))))
    return 'opened';
  return 'failed';
}
