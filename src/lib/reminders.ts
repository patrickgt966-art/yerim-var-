// Park reminders: one local notification on this device ("time to go back to the car"). Nothing
// leaves the phone; there is no push server.
import * as Notifications from 'expo-notifications';

/** The choices offered on the active park card, in minutes from now. */
export const REMINDER_CHOICES = [30, 60, 120, 180] as const;

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
}

export type Reminder = { id: string; at: string };

/**
 * Schedules the reminder `minutes` from `now`; null when notifications are not allowed (the user
 * said no, now or before) or scheduling failed.
 */
export async function scheduleParkReminder(
  minutes: number,
  text: { title: string; body: string },
  now: Date = new Date(),
): Promise<Reminder | null> {
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return null;
    const at = new Date(now.getTime() + minutes * 60_000);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: text.title, body: text.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    return { id, at: at.toISOString() };
  } catch {
    return null;
  }
}

/** Cancels a scheduled reminder; a reminder that already fired or is gone is fine. */
export async function cancelParkReminder(id: string | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing to cancel.
  }
}
