import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { dayKey, NUDGE_ORDER, type NudgeKind, type NudgeMemory } from '@/lib/nudge';

import { safeJSONStorage } from './app';

/** Two "Sonra" in a row: Yerim stays quiet this long. */
export const MUTE_MS = 7 * 24 * 60 * 60 * 1000;

type State = NudgeMemory & {
  /** "Sonra" taps in a row; an accepted suggestion resets it. */
  laters: number;
  setEnabled: (v: boolean) => void;
  /** A suggestion came on screen (even if the user never opened it): that was today's. */
  shown: (kind: NudgeKind, now?: Date) => void;
  accepted: () => void;
  later: (now?: Date) => void;
  /** Tests and dev only. */
  reset: () => void;
};

const INITIAL: NudgeMemory & { laters: number } = {
  enabled: true,
  lastDay: null,
  lastKind: null,
  mutedUntil: null,
  laters: 0,
};

/** What Yerim remembers about its daily suggestions, on this device only. */
export const useNudge = create<State>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      setEnabled: (enabled) => set({ enabled, laters: 0, mutedUntil: null }),
      shown: (kind, now = new Date()) => set({ lastDay: dayKey(now), lastKind: kind }),
      accepted: () => set({ laters: 0 }),
      later: (now = new Date()) => {
        const laters = get().laters + 1;
        if (laters >= 2)
          set({ laters: 0, mutedUntil: new Date(now.getTime() + MUTE_MS).toISOString() });
        else set({ laters });
      },
      reset: () => set(INITIAL),
    }),
    {
      name: 'yerim-var/nudge',
      version: 1,
      storage: safeJSONStorage(() => AsyncStorage),
      // Persisted data may be corrupt: keep only well-formed values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const iso = (v: unknown) =>
          typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? v : null;
        return {
          ...current,
          enabled: p.enabled !== false,
          lastDay:
            typeof p.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.lastDay)
              ? p.lastDay
              : null,
          lastKind: NUDGE_ORDER.includes(p.lastKind as NudgeKind)
            ? (p.lastKind as NudgeKind)
            : null,
          mutedUntil: iso(p.mutedUntil),
          laters: typeof p.laters === 'number' && p.laters >= 0 && p.laters < 2 ? p.laters : 0,
        };
      },
      partialize: ({ enabled, lastDay, lastKind, mutedUntil, laters }) => ({
        enabled,
        lastDay,
        lastKind,
        mutedUntil,
        laters,
      }),
    },
  ),
);

const subscribe = (cb: () => void) => useNudge.persist.onFinishHydration(cb);
const hydrated = () => useNudge.persist.hasHydrated();

/** True once the memory was read back: before that a suggestion could repeat today's. */
export function useNudgeHydrated() {
  return useSyncExternalStore(subscribe, hydrated, hydrated);
}
