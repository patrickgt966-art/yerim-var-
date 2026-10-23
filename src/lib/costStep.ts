// The "price goes up soon" notification of a running park: one local notification, 10 minutes
// before the car park's tariff moves to the next band. Nothing leaves the phone.
import * as Notifications from 'expo-notifications';

import { nextPriceStep, tariffFor } from '@/data/tariffs';
import i18n from '@/i18n';
import { notificationsGranted } from '@/lib/reminders';
import type { ActivePark } from '@/store/app';

/** One at a time, so a new park or a reschedule simply replaces it. */
export const COST_STEP_ID = 'park-cost-step';
/** How long before the price step the notification comes. */
export const COST_STEP_LEAD_MIN = 10;

/** When to notify and what to say, or null: no banded tariff, or no step left to warn about. */
export function costStepPlan(
  active: Pick<ActivePark, 'parkingId' | 'startedAt'>,
  now: Date = new Date(),
): { at: Date; from: number; to: number } | null {
  const t = tariffFor(active.parkingId);
  const started = new Date(active.startedAt).getTime();
  if (!t || Number.isNaN(started)) return null;
  const elapsed = (now.getTime() - started) / 60_000;
  // A step whose warning time is already past (or under a minute away) is skipped.
  const step = nextPriceStep(t, elapsed + COST_STEP_LEAD_MIN + 1);
  if (!step) return null;
  return {
    at: new Date(started + (step.atMin - COST_STEP_LEAD_MIN) * 60_000),
    from: step.from,
    to: step.to,
  };
}

/**
 * Puts the notification in line with the running park: cancels the old one, then schedules the
 * next step. Only when notifications are already allowed (it never asks); never throws.
 */
export async function syncCostStep(active: ActivePark | null, now: Date = new Date()) {
  try {
    await Notifications.cancelScheduledNotificationAsync(COST_STEP_ID);
  } catch {
    // Nothing scheduled.
  }
  if (!active) return;
  const plan = costStepPlan(active, now);
  if (!plan || !(await notificationsGranted())) return;
  const t = i18n.t.bind(i18n);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: COST_STEP_ID,
      content: {
        title: t('park.costStepTitle', { minutes: COST_STEP_LEAD_MIN }),
        body: t('park.costStepBody', {
          name: active.name,
          minutes: COST_STEP_LEAD_MIN,
          from: plan.from,
          to: plan.to,
        }),
        sound: true,
        data: { kind: 'park' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.at },
    });
  } catch {
    // Not scheduled; the park itself is unaffected.
  }
}
