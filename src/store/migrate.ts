import { DEFAULT_CITY, isAvailableCity } from '@/data/cities';

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

const DAY_MS = 24 * 60 * 60 * 1000;
/** A park older than this is stale data from long ago, not a car still parked. */
const MAX_ACTIVE_AGE_MS = 30 * DAY_MS;

function timeOf(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function validDestination(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return (
    o.kind === 'restaurant' &&
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    finite(o.lat) &&
    finite(o.lng)
  );
}

/**
 * Returns a safe active park, or null when it cannot be trusted. Repairs what
 * can be repaired: a bad destination or confirmation time is dropped, a bad
 * hourly price becomes unknown, a start time slightly in the future becomes now.
 */
function sanitizeActive(a: unknown, nowMs: number): Record<string, unknown> | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  if (!finite(o.lat) || !finite(o.lng) || typeof o.name !== 'string') return null;
  const started = timeOf(o.startedAt);
  if (started == null) return null;
  if (started > nowMs + DAY_MS || nowMs - started > MAX_ACTIVE_AGE_MS) return null;

  const out: Record<string, unknown> = { ...o };
  if (started > nowMs) out.startedAt = new Date(nowMs).toISOString();
  if ('hourly' in out && out.hourly != null && !(finite(out.hourly) && out.hourly >= 0))
    out.hourly = null;
  if ('confirmedAt' in out) {
    const confirmed = timeOf(out.confirmedAt);
    if (confirmed == null || confirmed > nowMs) delete out.confirmedAt;
  }
  if ('destination' in out && !validDestination(out.destination)) delete out.destination;
  return out;
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
    const valid = Array.isArray(s.favorites) ? s.favorites.filter(validFavorite) : [];
    s.favorites = valid.filter(
      (f, i) => valid.findIndex((g) => (g as { id: string }).id === (f as { id: string }).id) === i,
    );
  }
  if ('favoriteRestaurants' in s) {
    s.favoriteRestaurants = Array.isArray(s.favoriteRestaurants)
      ? s.favoriteRestaurants.filter(
          (id, i, all): id is string => typeof id === 'string' && all.indexOf(id) === i,
        )
      : [];
  }
  if ('active' in s && s.active != null) s.active = sanitizeActive(s.active, Date.now());
  if ('onboarded' in s && typeof s.onboarded !== 'boolean') s.onboarded = false;
  for (const key of ['home', 'work']) {
    if (key in s && s[key] != null && !validPlace(s[key])) s[key] = null;
  }
  if ('mode' in s && s.mode !== 'now' && s.mode !== 'twoHours') s.mode = 'now';
  if ('city' in s && !isAvailableCity(s.city)) s.city = DEFAULT_CITY;
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
  'city',
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
