import { Alert, Linking } from 'react-native';

import { appleMapsUrl } from '@/data/geo';
import { tariffFor } from '@/data/tariffs';
import type { Parking } from '@/data/types';
import i18n from '@/i18n';
import { useApp, type ParkDestination } from '@/store/app';

async function openMaps(p: Parking) {
  try {
    await Linking.openURL(appleMapsUrl(p, p.name));
  } catch {
    Alert.alert(i18n.t('results.mapsFailed'));
  }
}

/** "Buraya park et": optionally start the local parking timer, then hand off to Apple Maps. */
export function parkHere(p: Parking, destination?: ParkDestination) {
  const t = i18n.t.bind(i18n);
  Alert.alert(t('results.parkConfirmTitle'), t('results.parkConfirmBody'), [
    {
      text: t('results.parkConfirmYes'),
      onPress: () => {
        useApp.getState().startPark({
          parkingId: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          startedAt: new Date().toISOString(),
          hourly: tariffFor(p.id)?.hourly ?? null,
          ...(destination ? { destination } : {}),
        });
        void openMaps(p);
      },
    },
    { text: t('results.parkConfirmMapsOnly'), onPress: () => void openMaps(p) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
