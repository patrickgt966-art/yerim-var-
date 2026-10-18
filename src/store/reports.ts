import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const REPORT_KINDS = ['closed', 'location', 'info'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

type State = {
  /** This device's reports, by place id. A place it reported closed is hidden here at once. */
  mine: Record<string, { kind: ReportKind; at: number }>;
  /** Places hidden for everyone (the server's /hidden), by city, with when they were fetched. */
  server: Record<string, { ids: string[]; at: number }>;
  addMine: (placeId: string, kind: ReportKind, now?: number) => void;
  /** Takes back this device's report ("it is open after all"). */
  removeMine: (placeId: string) => void;
  setServer: (city: string, ids: string[], now?: number) => void;
};

export const useReports = create<State>()(
  persist(
    (set) => ({
      mine: {},
      server: {},
      addMine: (placeId, kind, now = Date.now()) =>
        set((s) => ({ mine: { ...s.mine, [placeId]: { kind, at: now } } })),
      removeMine: (placeId) =>
        set((s) => {
          const { [placeId]: _gone, ...mine } = s.mine;
          return { mine };
        }),
      setServer: (city, ids, now = Date.now()) =>
        set((s) => ({ server: { ...s.server, [city]: { ids, at: now } } })),
    }),
    {
      name: 'yerim-var/reports',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persisted data may be corrupt: keep only well-typed values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const rec = (v: unknown) =>
          typeof v === 'object' && v !== null && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : {};
        const mine: State['mine'] = {};
        for (const [id, v] of Object.entries(rec(p.mine))) {
          const r = rec(v);
          if (REPORT_KINDS.includes(r.kind as ReportKind) && typeof r.at === 'number')
            mine[id] = { kind: r.kind as ReportKind, at: r.at };
        }
        const server: State['server'] = {};
        for (const [city, v] of Object.entries(rec(p.server))) {
          const r = rec(v);
          if (Array.isArray(r.ids) && typeof r.at === 'number')
            server[city] = {
              ids: r.ids.filter((x): x is string => typeof x === 'string'),
              at: r.at,
            };
        }
        return { ...current, mine, server };
      },
      partialize: ({ mine, server }) => ({ mine, server }),
    },
  ),
);

let memo: { mine: State['mine']; server: State['server']; ids: ReadonlySet<string> } | null = null;

/**
 * Every place id hidden on this device: the ones it reported closed and the ones the server
 * hides. The same Set object until either changes, so it works as a memo key.
 */
export function hiddenPlaceIds(s: Pick<State, 'mine' | 'server'> = useReports.getState()) {
  if (memo && memo.mine === s.mine && memo.server === s.server) return memo.ids;
  const ids = new Set<string>();
  for (const [id, r] of Object.entries(s.mine)) if (r.kind === 'closed') ids.add(id);
  for (const c of Object.values(s.server)) for (const id of c.ids) ids.add(id);
  memo = { mine: s.mine, server: s.server, ids };
  return ids;
}

/** hiddenPlaceIds as a hook: a screen re-renders when a place is hidden or shown again. */
export function useHiddenPlaceIds(): ReadonlySet<string> {
  const mine = useReports((s) => s.mine);
  const server = useReports((s) => s.server);
  return hiddenPlaceIds({ mine, server });
}
