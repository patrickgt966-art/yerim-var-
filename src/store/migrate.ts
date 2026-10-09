const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validPlace(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return finite(o.lat) && finite(o.lng) && typeof o.label === 'string';
}

function validFavorite(f: unknown): boolean {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && finite(o.lat) && finite(o.lng);
}

function validActive(a: unknown): boolean {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  const t = o.startedAt;
  return (
    finite(o.lat) &&
    finite(o.lng) &&
    typeof o.name === 'string' &&
    (typeof t === 'string' || typeof t === 'number') &&
    !Number.isNaN(new Date(t).getTime())
  );
}

/**
 * Coerces corrupted persisted data to safe values: non-array favourites become
 * [], invalid active/home/work become null, unknown mode becomes 'now'.
 * Only keys that are present are touched. Used on migrate and on every rehydrate.
 */
export function sanitizeAppState(persisted: unknown): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const s = { ...(persisted as Record<string, unknown>) };
  if ('favorites' in s) {
    s.favorites = Array.isArray(s.favorites) ? s.favorites.filter(validFavorite) : [];
  }
  if ('favoriteRestaurants' in s) {
    s.favoriteRestaurants = Array.isArray(s.favoriteRestaurants)
      ? s.favoriteRestaurants.filter((id): id is string => typeof id === 'string')
      : [];
  }
  if ('active' in s && s.active != null && !validActive(s.active)) s.active = null;
  for (const key of ['home', 'work']) {
    if (key in s && s[key] != null && !validPlace(s[key])) s[key] = null;
  }
  if ('mode' in s && s.mode !== 'now' && s.mode !== 'twoHours') s.mode = 'now';
  return s;
}

const DATA_KEYS = [
  'onboarded',
  'home',
  'work',
  'favorites',
  'favoriteRestaurants',
  'active',
  'mode',
] as const;

/** Only the persisted data keys, sanitised: a stray key can never overwrite an action. */
export function persistedData(persisted: unknown): Record<string, unknown> {
  const clean = sanitizeAppState(persisted);
  if (!clean || typeof clean !== 'object') return {};
  const src = clean as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of DATA_KEYS) if (k in src) out[k] = src[k];
  return out;
}

/** Persisted-state migration. v1 had no restaurant favourites; v2 adds them; v3 sanitises. */
export function migrateAppState(persisted: unknown, version: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const s = { ...(persisted as Record<string, unknown>) };
  if (version < 2 && !Array.isArray(s.favoriteRestaurants)) s.favoriteRestaurants = [];
  return sanitizeAppState(s);
}
