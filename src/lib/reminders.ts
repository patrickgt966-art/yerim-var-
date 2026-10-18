// Park reminders: one local notification on this device ("time to go back to the car"). Nothing
// leaves the phone; there is no push server.
import type { TFunction } from 'i18next';
import * as Notifications from 'expo-notifications';

import { parkCost } from '@/data/tariffs';
import i18n from '@/i18n';
import { REMINDER_CHOICES } from '@/lib/reminderChoices';
import type { ActivePark } from '@/store/app';

export { REMINDER_CHOICES };

/** A reminder this far or more ahead also gets an early "10 minutes left" notification. */
const EARLY_MIN_MINUTES = 30;
const EARLY_LEAD_MINUTES = 10;
const PARK_CATEGORY = 'park';

/** The buttons under a park notification; both open the app (background JS is not reliable). */
export async function registerParkCategory(): Promise<void> {
  const t = i18n.t.bind(i18n);
  try {
    await Notifications.setNotificationCategoryAsync(PARK_CATEGORY, [
      {
        identifier: 'walk',
        buttonTitle: t('park.notifWalk'),
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'extend',
        buttonTitle: t('park.notifExtend'),
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // The notification still works, just without buttons.
  }
}

let handlerSet = false;

/** Shows a reminder that fires while the app is open, too (iOS hides it by default). */
export function setUpReminders(): void {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  void registerParkCategory();
}

/** What the notification says: the car park, and the estimated cost by then when known. */
export function reminderText(active: ActivePark, minutes: number, t: TFunction) {
  const elapsed = (Date.now() - new Date(active.startedAt).getTime()) / 60000;
  const cost = parkCost(active.parkingId, active.hourly, elapsed + minutes);
  return {
    title: t('park.reminderTitle'),
    body:
      cost != null
        ? t('park.reminderBodyCost', { name: active.name, price: cost })
        : t('park.reminderBody', { name: active.name }),
  };
}

/** The "10 minutes left" notification text. */
export function earlyReminderText(active: ActivePark, t: TFunction) {
  return {
    title: t('park.reminderSoonTitle'),
    body: t('park.reminderSoonBody', { name: active.name }),
  };
}

/** True when notifications are already allowed; never asks. */
export async function notificationsGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export type Reminder = { id: string; at: string; earlyId?: string };

/**
 * Schedules the reminder `minutes` from `now`; null when notifications are not allowed (the user
 * said no, now or before) or scheduling failed. With `earlyText` and a reminder 30 minutes or more
 * away, a second one is scheduled 10 minutes before.
 */
export async function scheduleParkReminder(
  minutes: number,
  text: { title: string; body: string },
  now: Date = new Date(),
  earlyText?: { title: string; body: string },
): Promise<Reminder | null> {
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return null;
    const at = new Date(now.getTime() + minutes * 60_000);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: text.title,
        body: text.body,
        sound: true,
        categoryIdentifier: PARK_CATEGORY,
        data: { kind: 'park' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    const reminder: Reminder = { id, at: at.toISOString() };
    if (earlyText && minutes >= EARLY_MIN_MINUTES) {
      try {
        reminder.earlyId = await Notifications.scheduleNotificationAsync({
          content: {
            title: earlyText.title,
            body: earlyText.body,
            sound: true,
            categoryIdentifier: PARK_CATEGORY,
            data: { kind: 'park' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(at.getTime() - EARLY_LEAD_MINUTES * 60_000),
          },
        });
      } catch {
        // The main reminder is still set.
      }
    }
    return reminder;
  } catch {
    return null;
  }
}

/** Cancels a scheduled reminder and its early one; one that already fired or is gone is fine. */
export async function cancelParkReminder(
  reminder: { id: string; earlyId?: string } | undefined,
): Promise<void> {
  if (!reminder) return;
  for (const id of [reminder.id, reminder.earlyId]) {
    if (!id) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Nothing to cancel.
    }
  }
}
