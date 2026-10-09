import { appleWalkingUrl, appleWalkToUrl } from '@/data/geo';
import { currentLocationLabel, needsStillParkedPrompt } from '@/lib/park';
import { migrateAppState, persistedData, sanitizeAppState } from '@/store/migrate';

/** A start time that is always inside the 30 day window. */
const recent = new Date(Date.now() - 3600_000).toISOString();

describe('appleWalkingUrl', () => {
  it('builds walking directions from park to destination', () => {
    const url = appleWalkingUrl({ lat: 38.4, lng: 27.1 }, { lat: 38.41, lng: 27.12 }, 'Çiğ Köfte');
    expect(url).toBe(
      'https://maps.apple.com/?saddr=38.4,27.1&daddr=38.41,27.12&dirflg=w&q=%C3%87i%C4%9F%20K%C3%B6fte',
    );
  });
  it('omits the query without a name', () => {
    expect(appleWalkingUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toBe(
      'https://maps.apple.com/?saddr=1,2&daddr=3,4&dirflg=w',
    );
  });
});

describe('migrateAppState', () => {
  it('adds an empty restaurant favourites list to v1 state', () => {
    expect(migrateAppState({ onboarded: true, favorites: [] }, 1)).toEqual({
      onboarded: true,
      favorites: [],
      favoriteRestaurants: [],
    });
  });
  it('keeps existing v2 data', () => {
    const s = { favoriteRestaurants: ['a'] };
    expect(migrateAppState(s, 2)).toEqual(s);
  });
  it('passes through non-objects', () => {
    expect(migrateAppState(null, 1)).toBeNull();
  });
});

describe('migrateAppState validation', () => {
  it('coerces non-array favourites to empty lists', () => {
    const s = migrateAppState({ favorites: 'x', favoriteRestaurants: null }, 2) as Record<
      string,
      unknown
    >;
    expect(s.favorites).toEqual([]);
    expect(s.favoriteRestaurants).toEqual([]);
  });
  it('drops an active park with an invalid start', () => {
    const s = migrateAppState(
      { active: { startedAt: 'nope', name: 'a', lat: 1, lng: 2 } },
      2,
    ) as Record<string, unknown>;
    expect(s.active).toBeNull();
    const n = migrateAppState({ active: 'junk' }, 2) as Record<string, unknown>;
    expect(n.active).toBeNull();
  });
  it('keeps a valid active park', () => {
    const active = { startedAt: recent, name: 'a', lat: 1, lng: 2 };
    expect((migrateAppState({ active }, 2) as { active: unknown }).active).toEqual(active);
  });
});

describe('appleWalkToUrl', () => {
  it('walks from the current location', () => {
    expect(appleWalkToUrl({ lat: 1, lng: 2 }, 'A B')).toBe(
      'https://maps.apple.com/?daddr=1,2&dirflg=w&q=A%20B',
    );
  });
});

describe('park helpers', () => {
  const start = '2026-01-01T00:00:00.000Z';
  const t0 = new Date(start).getTime();
  const H = 3600_000;
  it('prompts only after 12 h', () => {
    expect(needsStillParkedPrompt({ startedAt: start }, t0 + 11 * H)).toBe(false);
    expect(needsStillParkedPrompt({ startedAt: start }, t0 + 13 * H)).toBe(true);
  });
  it('confirmation restarts the clock', () => {
    const confirmedAt = new Date(t0 + 12 * H).toISOString();
    expect(needsStillParkedPrompt({ startedAt: start, confirmedAt }, t0 + 13 * H)).toBe(false);
    expect(needsStillParkedPrompt({ startedAt: start, confirmedAt }, t0 + 25 * H)).toBe(true);
  });
  it('labels the current location', () => {
    const fb = (t: string) => `Konumum (${t})`;
    const d = new Date(2026, 0, 1, 9, 5);
    expect(currentLocationLabel({ street: 'Mithatpaşa Cd. 4' }, d, fb)).toBe('Mithatpaşa Cd. 4');
    expect(currentLocationLabel(null, d, fb)).toBe('Konumum (09:05)');
  });
});

describe('sanitizeAppState', () => {
  const good = { lat: 38, lng: 27, label: 'x' };
  it('nulls invalid home/work and keeps valid ones', () => {
    const s = sanitizeAppState({ home: { lat: NaN, lng: 1, label: 'a' }, work: good }) as Record<
      string,
      unknown
    >;
    expect(s.home).toBeNull();
    expect(s.work).toEqual(good);
  });
  it('drops an active park with bad coordinates or name', () => {
    const base = { name: 'P', startedAt: recent, lat: 1, lng: 2 };
    expect(
      (sanitizeAppState({ active: { ...base, lat: 'x' } }) as { active: unknown }).active,
    ).toBeNull();
    expect(
      (sanitizeAppState({ active: { ...base, name: 3 } }) as { active: unknown }).active,
    ).toBeNull();
    expect((sanitizeAppState({ active: base }) as { active: unknown }).active).toEqual(base);
  });
  it('resets an unknown mode', () => {
    expect((sanitizeAppState({ mode: 'weird' }) as { mode: string }).mode).toBe('now');
    expect((sanitizeAppState({ mode: 'twoHours' }) as { mode: string }).mode).toBe('twoHours');
  });
});

describe('persistedData', () => {
  it('drops corrupt favourite entries and non-string restaurant ids', () => {
    const out = persistedData({
      favorites: [null, { id: 1 }, { id: 'a', name: 'A', lat: 38.4, lng: 27.1 }],
      favoriteRestaurants: ['osm-1', 5, null],
    });
    expect(out.favorites).toEqual([{ id: 'a', name: 'A', lat: 38.4, lng: 27.1 }]);
    expect(out.favoriteRestaurants).toEqual(['osm-1']);
  });

  it('keeps only data keys, so a stray key cannot replace an action', () => {
    const out = persistedData({ setHome: 'x', mode: 'now', onboarded: true });
    expect(out).toEqual({ mode: 'now', onboarded: true });
  });

  it('returns an empty object for missing or invalid input', () => {
    expect(persistedData(null)).toEqual({});
    expect(persistedData('abc')).toEqual({});
  });
});

describe('active park sanitising', () => {
  const base = { name: 'P', startedAt: recent, lat: 1, lng: 2, hourly: 20, parkingId: 'x' };
  const clean = (active: unknown) =>
    (sanitizeAppState({ active }) as { active: Record<string, unknown> | null }).active;
  const dest = { kind: 'restaurant', id: 'r1', name: 'R', lat: 38.4, lng: 27.1 };

  it('keeps a valid destination and drops only a bad one', () => {
    expect(clean({ ...base, destination: dest })?.destination).toEqual(dest);
    for (const bad of [
      { ...dest, kind: 'other' },
      { ...dest, lat: NaN },
      { ...dest, id: 3 },
      'junk',
    ]) {
      const a = clean({ ...base, destination: bad });
      expect(a).not.toBeNull();
      expect(a).not.toHaveProperty('destination');
    }
  });
  it('turns an invalid hourly price into unknown', () => {
    expect(clean({ ...base, hourly: -5 })?.hourly).toBeNull();
    expect(clean({ ...base, hourly: 'abc' })?.hourly).toBeNull();
    expect(clean({ ...base, hourly: null })?.hourly).toBeNull();
    expect(clean({ ...base, hourly: 0 })?.hourly).toBe(0);
  });
  it('clamps a slightly-future start to now and drops a far-future or old one', () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const fixed = clean({ ...base, startedAt: soon })?.startedAt as string;
    expect(new Date(fixed).getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      clean({ ...base, startedAt: new Date(Date.now() + 3 * 86400_000).toISOString() }),
    ).toBeNull();
    expect(
      clean({ ...base, startedAt: new Date(Date.now() - 31 * 86400_000).toISOString() }),
    ).toBeNull();
  });
  it('drops a confirmedAt in the future or unparsable', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(clean({ ...base, confirmedAt: future })).not.toHaveProperty('confirmedAt');
    expect(clean({ ...base, confirmedAt: 'nope' })).not.toHaveProperty('confirmedAt');
    expect(clean({ ...base, confirmedAt: recent })?.confirmedAt).toBe(recent);
  });
  it('dedupes favourites and restaurant ids, and coerces onboarded', () => {
    const f = { id: 'a', name: 'A', lat: 38.4, lng: 27.1 };
    const out = sanitizeAppState({
      favorites: [{ id: 'a' }, f, { ...f, name: 'again' }],
      favoriteRestaurants: ['r', 'r', 's'],
      onboarded: 'yes',
    }) as Record<string, unknown>;
    expect(out.favorites).toEqual([f]);
    expect(out.favoriteRestaurants).toEqual(['r', 's']);
    expect(out.onboarded).toBe(false);
    expect((sanitizeAppState({ onboarded: true }) as { onboarded: boolean }).onboarded).toBe(true);
  });
});

describe('city', () => {
  const city = (v: unknown) => (sanitizeAppState({ city: v }) as { city: string }).city;
  it('keeps an available city', () => {
    expect(city('izmir')).toBe('izmir');
  });
  it('falls back to izmir for unknown, unavailable or non-string cities', () => {
    expect(city('atlantis')).toBe('izmir');
    expect(city('istanbul')).toBe('izmir');
    expect(city(5)).toBe('izmir');
    expect(city(null)).toBe('izmir');
  });
  it('is a persisted data key and absent when not stored', () => {
    expect(persistedData({ city: 'ankara' })).toEqual({ city: 'izmir' });
    expect(persistedData({ onboarded: true })).toEqual({ onboarded: true });
  });
});
