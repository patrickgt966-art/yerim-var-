import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CITY, isAvailableCity, setActiveCity } from '@/data/cities';
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

/** Recent searches kept in the store. */
export const MAX_RECENT_SEARCHES = 10;

const recentKey = (q: string) => q.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');

/** `q` first, an earlier copy of it (any case or spacing) dropped, at most MAX_RECENT_SEARCHES kept. */
export function addRecentSearch(list: string[], q: string): string[] {
  const text = q.trim().replace(/\s+/g, ' ');
  if (!text) return list;
  const key = recentKey(text);
  return [text, ...list.filter((x) => recentKey(x) !== key)].slice(0, MAX_RECENT_SEARCHES);
}

type State = {
  onboarded: boolean;
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: FavoriteParking[];
  favoriteRestaurants: string[];
  active: ActivePark | null;
  mode: ParkMode;
  city: string;
  /** Most recent first, deduped, at most MAX_RECENT_SEARCHES. */
  recentSearches: string[];
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  setCity: (id: string) => void;
  setOnboarded: (v: boolean) => void;
  setHome: (p: SavedPlace | null) => void;
  setWork: (p: SavedPlace | null) => void;
  toggleFavorite: (p: FavoriteParking) => void;
  toggleFavoriteRestaurant: (id: string) => void;
  /** Re-keys a saved favorite (e.g. after car park ids changed); never creates a duplicate. */
  replaceFavoriteId: (oldId: string, newId: string) => void;
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
      recentSearches: [],
      addRecentSearch: (q) =>
        set((s) => ({ recentSearches: addRecentSearch(s.recentSearches, q) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      // Unavailable or unknown cities are ignored. The data layer follows the store.
      // Recent searches name places of the old city, so a real switch drops them; favorites,
      // Ev/İş and a running park are the user's own and stay.
      setCity: (id) => {
        if (!isAvailableCity(id)) return;
        setActiveCity(id);
        set((s) => (s.city === id ? s : { city: id, recentSearches: [] }));
      },
      setOnboarded: (onboarded) => set({ onboarded }),
      setHome: (home) => set({ home }),
      setWork: (work) => set({ work }),
      toggleFavorite: (p) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.id === p.id)
            ? s.favorites.filter((f) => f.id !== p.id)
            : [...s.favorites, p],
        })),
      replaceFavoriteId: (oldId, newId) =>
        set((s) => {
          if (oldId === newId || !s.favorites.some((f) => f.id === oldId)) return s;
          const taken = s.favorites.some((f) => f.id === newId);
          return {
            favorites: taken
              ? s.favorites.filter((f) => f.id !== oldId)
              : s.favorites.map((f) => (f.id === oldId ? { ...f, id: newId } : f)),
          };
        }),
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
      // The data layer must know the stored city before the first screen reads it.
      merge: (persisted, current) => {
        const merged = { ...current, ...persistedData(persisted) };
        setActiveCity(merged.city);
        return merged;
      },
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
        recentSearches,
      }) => ({
        onboarded,
        home,
        work,
        favorites,
        favoriteRestaurants,
        active,
        mode,
        city,
        recentSearches,
      }),
    },
  ),
);

export const useIsFavorite = (id: string) => useApp((s) => s.favorites.some((f) => f.id === id));

export const useIsFavoriteRestaurant = (id: string) =>
  useApp((s) => s.favoriteRestaurants.includes(id));
