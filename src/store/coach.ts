import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The first-launch tour Yerim gives, in order: the home screen's main jobs, then the map tab and
 * the Yerim button. The other tabs get a one-line hint on their first visit (`seenHints`).
 */
export const COACH_STEPS = ['search', 'park', 'food', 'map', 'yerim'] as const;
export type CoachKey = (typeof COACH_STEPS)[number];

/**
 * Index (>= `from`) of the first step whose target is on screen, or null when none is left.
 * A target can be missing: the ✨ pill is hidden without AI consent.
 */
export function resolveStep(from: number, available: readonly CoachKey[]): number | null {
  for (let i = Math.max(0, from); i < COACH_STEPS.length; i++) {
    const key = COACH_STEPS[i];
    if (key && available.includes(key)) return i;
  }
  return null;
}

/** Tabs that get a one-line hint from Yerim on their first visit. */
export const TAB_HINTS = ['favoriler', 'profil'] as const;
export type TabHintKey = (typeof TAB_HINTS)[number];

type State = {
  /** True once the tour was finished or skipped. Persisted: it never shows again. */
  coachDone: boolean;
  /** First-visit hints already shown. Persisted. */
  seenHints: TabHintKey[];
  seeHint: (key: TabHintKey) => void;
  /** Index into COACH_STEPS. Not persisted: an interrupted tour starts over. */
  step: number;
  /** To the next step with a target in `available`; after the last one sets `coachDone`. */
  next: (available: readonly CoachKey[]) => void;
  skip: () => void;
  /** Tests and dev only. */
  reset: () => void;
};

export const useCoach = create<State>()(
  persist(
    (set, get) => ({
      coachDone: false,
      seenHints: [],
      seeHint: (key) => {
        if (!get().seenHints.includes(key)) set({ seenHints: [...get().seenHints, key] });
      },
      step: 0,
      next: (available) => {
        const current = resolveStep(get().step, available);
        const next = current == null ? null : resolveStep(current + 1, available);
        if (next == null) set({ coachDone: true });
        else set({ step: next });
      },
      skip: () => set({ coachDone: true }),
      reset: () => set({ coachDone: false, step: 0, seenHints: [] }),
    }),
    {
      name: 'yerim-var/coach',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persisted data may be corrupt: only a real `true` counts as done.
      merge: (persisted, current) => {
        const p = persisted as { coachDone?: unknown; seenHints?: unknown } | null;
        const hints = Array.isArray(p?.seenHints) ? p.seenHints : [];
        return {
          ...current,
          coachDone: p?.coachDone === true,
          seenHints: TAB_HINTS.filter((k) => hints.includes(k)),
        };
      },
      partialize: ({ coachDone, seenHints }) => ({ coachDone, seenHints }),
    },
  ),
);

const subscribe = (cb: () => void) => useCoach.persist.onFinishHydration(cb);
const get = () => useCoach.persist.hasHydrated();

/** True once `coachDone` has been read from AsyncStorage (before that it would flash for returning users). */
export function useCoachHydrated() {
  return useSyncExternalStore(subscribe, get, get);
}
