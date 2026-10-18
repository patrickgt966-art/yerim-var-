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

function startTimer(p: Parking, destination?: ParkDestination) {
  useApp.getState().startPark({
    parkingId: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    startedAt: new Date().toISOString(),
    hourly: tariffFor(p.id)?.hourly ?? null,
    ...(destination ? { destination } : {}),
  });
}

/** "Buraya park et": optionally start the local parking timer, then hand off to Apple Maps. */
export function parkHere(p: Parking, destination?: ParkDestination) {
  const t = i18n.t.bind(i18n);
  const current = useApp.getState().active;
  const body = current
    ? `${t('results.parkConfirmBody')}\n\n${t('results.parkReplaceBody', { name: current.name })}`
    : t('results.parkConfirmBody');
  Alert.alert(t('results.parkConfirmTitle'), body, [
    {
      text: t('results.parkConfirmYes'),
      onPress: () => {
        startTimer(p, destination);
        void openMaps(p);
      },
    },
    { text: t('results.parkConfirmMapsOnly'), onPress: () => void openMaps(p) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}

/**
 * "Buraya park ettim": the user is already there, so the timer starts without directions. Only
 * replacing a running park asks first.
 */
export function parkedHere(p: Parking) {
  const t = i18n.t.bind(i18n);
  const current = useApp.getState().active;
  if (!current) {
    startTimer(p);
    return;
  }
  Alert.alert(t('results.parkConfirmTitle'), t('results.parkReplaceBody', { name: current.name }), [
    { text: t('results.parkReplaceYes'), onPress: () => startTimer(p) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
