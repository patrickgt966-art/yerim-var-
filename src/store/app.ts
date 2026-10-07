import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LatLng } from '@/data/geo';

export type SavedPlace = { label: string } & LatLng;
export type FavoriteParking = { id: string; name: string } & LatLng;
export type ActivePark = {
  parkingId: string;
  name: string;
  startedAt: string;
  hourly: number | null;
  note?: string;
} & LatLng;
export type ParkMode = 'now' | 'twoHours';

type State = {
  onboarded: boolean;
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: FavoriteParking[];
  active: ActivePark | null;
  mode: ParkMode;
  setOnboarded: (v: boolean) => void;
  setHome: (p: SavedPlace | null) => void;
  setWork: (p: SavedPlace | null) => void;
  toggleFavorite: (p: FavoriteParking) => void;
  startPark: (p: ActivePark) => void;
  endPark: () => void;
  setMode: (m: ParkMode) => void;
};

export const useApp = create<State>()(
  persist(
    (set) => ({
      onboarded: false,
      home: null,
      work: null,
      favorites: [],
      active: null,
      mode: 'now',
      setOnboarded: (onboarded) => set({ onboarded }),
      setHome: (home) => set({ home }),
      setWork: (work) => set({ work }),
      toggleFavorite: (p) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.id === p.id)
            ? s.favorites.filter((f) => f.id !== p.id)
            : [...s.favorites, p],
        })),
      startPark: (active) => set({ active }),
      endPark: () => set({ active: null }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'yerim-var/app',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboarded, home, work, favorites, active, mode }) => ({
        onboarded,
        home,
        work,
        favorites,
        active,
        mode,
      }),
    },
  ),
);

export const useIsFavorite = (id: string) => useApp((s) => s.favorites.some((f) => f.id === id));
