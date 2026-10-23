import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** 'auto' follows the phone's light/dark setting. */
export type ThemePref = 'auto' | 'light' | 'dark';
export const THEME_PREFS: readonly ThemePref[] = ['auto', 'light', 'dark'];

type State = { theme: ThemePref; setTheme: (t: ThemePref) => void };

/** The look the user picked in Profil, on this device. */
export const useAppearance = create<State>()(
  persist((set) => ({ theme: 'auto', setTheme: (theme) => set({ theme }) }), {
    name: 'yerim-var/appearance',
    version: 1,
    // Its own small store (not the app store), so the theme module stays free of app imports.
    storage: createJSONStorage(() => AsyncStorage),
    merge: (persisted, current) => {
      const t = (persisted as { theme?: unknown } | null)?.theme;
      return {
        ...current,
        theme: THEME_PREFS.includes(t as ThemePref) ? (t as ThemePref) : 'auto',
      };
    },
    partialize: ({ theme }) => ({ theme }),
  }),
);
