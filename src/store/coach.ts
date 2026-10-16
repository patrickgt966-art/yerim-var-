import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The home coach marks, in the order they are shown. */
export const COACH_STEPS = ['yerim', 'ai', 'city', 'search'] as const;
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

type State = {
  /** True once the tour was finished or skipped. Persisted: it never shows again. */
  coachDone: boolean;
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
      step: 0,
      next: (available) => {
        const current = resolveStep(get().step, available);
        const next = current == null ? null : resolveStep(current + 1, available);
        if (next == null) set({ coachDone: true });
        else set({ step: next });
      },
      skip: () => set({ coachDone: true }),
      reset: () => set({ coachDone: false, step: 0 }),
    }),
    {
      name: 'yerim-var/coach',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persisted data may be corrupt: only a real `true` counts as done.
      merge: (persisted, current) => ({
        ...current,
        coachDone: (persisted as { coachDone?: unknown } | null)?.coachDone === true,
      }),
      partialize: ({ coachDone }) => ({ coachDone }),
    },
  ),
);

const subscribe = (cb: () => void) => useCoach.persist.onFinishHydration(cb);
const get = () => useCoach.persist.hasHydrated();

/** True once `coachDone` has been read from AsyncStorage (before that it would flash for returning users). */
export function useCoachHydrated() {
  return useSyncExternalStore(subscribe, get, get);
}
