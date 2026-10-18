import { Alert } from 'react-native';

import { tariffFor } from '@/data/tariffs';
import type { Parking } from '@/data/types';
import i18n from '@/i18n';
import { openDirections } from '@/lib/directions';
import {
  cancelParkReminder,
  earlyReminderText,
  notificationsGranted,
  reminderText,
  scheduleParkReminder,
} from '@/lib/reminders';
import { useApp, type ActivePark, type ParkDestination } from '@/store/app';

/** Drive directions to the car park without a park record ("Yol tarifi"). */
export async function directionsOnly(p: Parking) {
  if ((await openDirections(p, p.name, 'drive')) === 'failed') {
    Alert.alert(i18n.t('results.mapsFailed'));
  }
}

/** "Arabama dön": walking directions to the running park. */
export async function backToCar(active: ActivePark) {
  if ((await openDirections(active, active.name, 'walk')) === 'failed') {
    Alert.alert(i18n.t('food.openFailed'));
  }
}

/**
 * When the user used a reminder before and notifications are already allowed, the new park gets
 * the same reminder. Never asks for permission here.
 */
async function autoReminder(active: ActivePark) {
  const minutes = useApp.getState().lastReminderMin;
  if (!minutes || !(await notificationsGranted())) return;
  const t = i18n.t.bind(i18n);
  const reminder = await scheduleParkReminder(
    minutes,
    reminderText(active, minutes, t),
    new Date(),
    earlyReminderText(active, t),
  );
  if (!reminder) return;
  // The park may have ended, been replaced or got a reminder of its own in the meantime.
  const now = useApp.getState().active;
  if (now?.startedAt !== active.startedAt || now.reminder) void cancelParkReminder(reminder);
  else useApp.getState().setParkReminder(reminder);
}

function startTimer(p: Parking, destination?: ParkDestination) {
  const active: ActivePark = {
    parkingId: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    startedAt: new Date().toISOString(),
    hourly: tariffFor(p.id)?.hourly ?? null,
    ...(destination ? { destination } : {}),
  };
  useApp.getState().startPark(active);
  void autoReminder(active);
}

/**
 * "Buraya park et": starts the local parking timer and hands off to the map app. Only replacing a
 * different running park asks first; for the park that is already running, only the directions open.
 */
export function parkHere(p: Parking, destination?: ParkDestination) {
  const t = i18n.t.bind(i18n);
  const current = useApp.getState().active;
  const go = () => {
    startTimer(p, destination);
    void directionsOnly(p);
  };
  if (current?.parkingId === p.id) {
    // Already parked here: keep the running timer, reminder and destination.
    void directionsOnly(p);
    return;
  }
  if (!current) {
    go();
    return;
  }
  Alert.alert(t('results.parkConfirmTitle'), t('results.parkReplaceBody', { name: current.name }), [
    { text: t('results.parkReplaceYes'), onPress: go },
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
