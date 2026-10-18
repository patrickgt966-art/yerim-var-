// What the buttons on a park notification do ("Yol tarifi", "15 dk uzat").
import * as Notifications from 'expo-notifications';

import i18n from '@/i18n';
import { openDirections } from '@/lib/directions';
import { reminderText, scheduleParkReminder } from '@/lib/reminders';
import { didHydrationFail, useApp } from '@/store/app';

// The cold-start read and the listener can both deliver the same response.
const handled = new Set<string>();

/** Moves the running park's reminder to `minutes` from now. */
export async function extendParkReminder(minutes: number): Promise<void> {
  const active = useApp.getState().active;
  if (!active) return;
  const t = i18n.t.bind(i18n);
  const next = await scheduleParkReminder(minutes, reminderText(active, minutes, t));
  // The park may have ended or changed while the permission check ran.
  if (next && useApp.getState().active?.startedAt === active.startedAt) {
    useApp.getState().setParkReminder(next);
  }
}

// A cold start delivers the response before the persisted park is read back.
function whenHydrated(fn: () => void) {
  if (useApp.persist.hasHydrated() || didHydrationFail()) fn();
  else {
    const off = useApp.persist.onFinishHydration(() => {
      off();
      fn();
    });
  }
}

export function handleParkResponse(response: Notifications.NotificationResponse): void {
  const { request } = response.notification;
  if ((request.content.data as { kind?: unknown } | undefined)?.kind !== 'park') return;
  const key = `${request.identifier}|${response.actionIdentifier}`;
  if (handled.has(key)) return;
  handled.add(key);
  if (response.actionIdentifier === 'walk') {
    whenHydrated(() => {
      const active = useApp.getState().active;
      if (active) void openDirections(active, active.name, 'walk');
    });
  } else if (response.actionIdentifier === 'extend') {
    whenHydrated(() => void extendParkReminder(15));
  }
  // A plain tap just opens the app on the home screen, which shows the running park.
}

let listening = false;

/** Listens for taps and buttons on park notifications, including the one that launched the app. */
export function listenParkNotifications(): void {
  if (listening) return;
  listening = true;
  Notifications.addNotificationResponseReceivedListener(handleParkResponse);
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handleParkResponse(response);
    })
    .catch(() => {});
}
