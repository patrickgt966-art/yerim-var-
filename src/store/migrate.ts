/** Persisted-state migration. v1 had no restaurant favourites; v2 adds them. */
export function migrateAppState(persisted: unknown, version: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const s = { ...(persisted as Record<string, unknown>) };
  if (version < 2 && !Array.isArray(s.favoriteRestaurants)) s.favoriteRestaurants = [];
  return s;
}
