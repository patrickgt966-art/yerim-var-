import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CITY, isAvailableCity } from '@/data/cities';
import type { LatLng } from '@/data/geo';

import { migrateAppState, persistedData } from './migrate';

export type SavedPlace = { label: string } & LatLng;
export type FavoriteParking = { id: string; name: string } & LatLng;
export type ParkDestination = { kind: 'restaurant'; id: string; name: string } & LatLng;
export type ActivePark = {
  parkingId: string;
  name: string;
  startedAt: string;
  hourly: number | null;
  note?: string;
  /** Set when the user answered "still parked?" after a long park; restarts the 12 h clock. */
  confirmedAt?: string;
  /** Where the user is walking to after parking (set from a restaurant page). */
  destination?: ParkDestination;
} & LatLng;
export type ParkMode = 'now' | 'twoHours';

type State = {
  onboarded: boolean;
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: FavoriteParking[];
  favoriteRestaurants: string[];
  active: ActivePark | null;
  mode: ParkMode;
  city: string;
  setCity: (id: string) => void;
  setOnboarded: (v: boolean) => void;
  setHome: (p: SavedPlace | null) => void;
  setWork: (p: SavedPlace | null) => void;
  toggleFavorite: (p: FavoriteParking) => void;
  toggleFavoriteRestaurant: (id: string) => void;
  startPark: (p: ActivePark) => void;
  endPark: () => void;
  confirmPark: () => void;
  setMode: (m: ParkMode) => void;
};

export const useApp = create<State>()(
  persist(
    (set) => ({
      onboarded: false,
      home: null,
      work: null,
      favorites: [],
      favoriteRestaurants: [],
      active: null,
      mode: 'now',
      city: DEFAULT_CITY,
      // Unavailable or unknown cities are ignored.
      setCity: (id) => set((s) => (isAvailableCity(id) ? { city: id } : s)),
      setOnboarded: (onboarded) => set({ onboarded }),
      setHome: (home) => set({ home }),
      setWork: (work) => set({ work }),
      toggleFavorite: (p) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.id === p.id)
            ? s.favorites.filter((f) => f.id !== p.id)
            : [...s.favorites, p],
        })),
      toggleFavoriteRestaurant: (id) =>
        set((s) => ({
          favoriteRestaurants: s.favoriteRestaurants.includes(id)
            ? s.favoriteRestaurants.filter((x) => x !== id)
            : [...s.favoriteRestaurants, id],
        })),
      startPark: (active) => set({ active }),
      endPark: () => set({ active: null }),
      confirmPark: () =>
        set((s) =>
          s.active ? { active: { ...s.active, confirmedAt: new Date().toISOString() } } : {},
        ),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'yerim-var/app',
      version: 3,
      migrate: migrateAppState as never,
      // Same-version corrupt data never goes through migrate, so sanitise on every rehydrate.
      merge: (persisted, current) => ({ ...current, ...persistedData(persisted) }),
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        onboarded,
        home,
        work,
        favorites,
        favoriteRestaurants,
        active,
        mode,
        city,
      }) => ({
        onboarded,
        home,
        work,
        favorites,
        favoriteRestaurants,
        active,
        mode,
        city,
      }),
    },
  ),
);

export const useIsFavorite = (id: string) => useApp((s) => s.favorites.some((f) => f.id === id));

export const useIsFavoriteRestaurant = (id: string) =>
  useApp((s) => s.favoriteRestaurants.includes(id));
