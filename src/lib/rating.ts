import * as StoreReview from 'expo-store-review';

import { useApp } from '@/store/app';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Parks the user must have finished before the rating sheet is requested. */
const MIN_PARKS = 3;
/** Pause between two requests. Apple itself shows the sheet at most 3 times a year. */
const MIN_GAP_MS = 120 * DAY_MS;

/**
 * Asks for an App Store rating after a few finished parks, at most every 120 days. The system may
 * still decide not to show the sheet. Every error is swallowed.
 */
export async function maybeAskForRating(now: Date = new Date()): Promise<void> {
  try {
    const { parksDone, ratingAskedAt } = useApp.getState();
    if (parksDone < MIN_PARKS) return;
    if (ratingAskedAt) {
      const last = new Date(ratingAskedAt).getTime();
      if (!Number.isNaN(last) && now.getTime() - last <= MIN_GAP_MS) return;
    }
    if (!(await StoreReview.isAvailableAsync())) return;
    await StoreReview.requestReview();
    useApp.setState({ ratingAskedAt: now.toISOString() });
  } catch {
    // A rating prompt is never worth an error.
  }
}
