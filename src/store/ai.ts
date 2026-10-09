import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FREE_DAILY, todayIstanbul } from '@/lib/ai/protocol';

type State = {
  /** Quota key only, not personal. */
  deviceId: string;
  /** Istanbul day (YYYY-MM-DD) that `used` belongs to. */
  day: string;
  used: number;
  /** Last day the "out of quota" notice was shown. */
  noticeDay: string;
  remaining: (now?: Date) => number;
  /** The server is authoritative: store what it says is left. */
  setRemaining: (n: number, now?: Date) => void;
  markOut: (now?: Date) => void;
  /** True the first time per day, then false. */
  noticeOnce: (now?: Date) => boolean;
};

const newDeviceId = () => {
  let id = 'd-';
  for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 36).toString(36);
  return id;
};

export const useAi = create<State>()(
  persist(
    (set, get) => ({
      deviceId: newDeviceId(),
      day: '',
      used: 0,
      noticeDay: '',
      remaining: (now) => (get().day === todayIstanbul(now) ? FREE_DAILY - get().used : FREE_DAILY),
      setRemaining: (n, now) =>
        set({
          used: Math.min(FREE_DAILY, Math.max(0, FREE_DAILY - Math.round(n))),
          day: todayIstanbul(now),
        }),
      markOut: (now) => set({ used: FREE_DAILY, day: todayIstanbul(now) }),
      noticeOnce: (now) => {
        const today = todayIstanbul(now);
        if (get().noticeDay === today) return false;
        set({ noticeDay: today });
        return true;
      },
    }),
    {
      name: 'yerim-var/ai',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persisted data may be corrupt: keep only well-typed values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
        const used =
          typeof p.used === 'number' && Number.isFinite(p.used)
            ? Math.min(FREE_DAILY, Math.max(0, Math.round(p.used)))
            : 0;
        return {
          ...current,
          deviceId: typeof p.deviceId === 'string' && p.deviceId ? p.deviceId : current.deviceId,
          day: str(p.day, ''),
          used,
          noticeDay: str(p.noticeDay, ''),
        };
      },
      partialize: ({ deviceId, day, used, noticeDay }) => ({ deviceId, day, used, noticeDay }),
    },
  ),
);
