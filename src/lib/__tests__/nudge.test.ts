import type { Parking } from '@/data/types';
import {
  chooseNudge,
  dayKey,
  favFilling,
  favNearby,
  hardParking,
  meal,
  roundedCount,
  type Nudge,
  type NudgeMemory,
} from '@/lib/nudge';

const NOW = new Date(2026, 9, 23, 19, 30);
const HERE = { lat: 38.4361, lng: 27.1425 };
// ~111 m per 0.001 degree of latitude.
const north = (m: number) => ({ lat: HERE.lat + m / 111_000, lng: HERE.lng });

function park(id: string, at: { lat: number; lng: number }, free: number | null, capacity = 100) {
  return {
    id,
    name: `Otopark ${id}`,
    ...at,
    capacity,
    free,
    isIndoor: null,
    isOpen: true,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    address: null,
    source: 'izmir',
    updatedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    fetchedAt: NOW.toISOString(),
  } as unknown as Parking;
}

const MEMORY: NudgeMemory = { enabled: true, lastDay: null, lastKind: null, mutedUntil: null };
const MEAL: Nudge = { kind: 'meal', slot: 'evening', cat: 'fish', count: 12, here: HERE };
const NEAR: Nudge = { kind: 'favNearby', place: { id: 'r1', name: 'Öz Urfa', distanceM: 300 } };

describe('chooseNudge', () => {
  it('picks the most urgent suggestion', () => {
    expect(chooseNudge([MEAL, NEAR], MEMORY, NOW)).toBe(NEAR);
  });

  it('shows at most one a day', () => {
    expect(chooseNudge([MEAL], { ...MEMORY, lastDay: dayKey(NOW) }, NOW)).toBeNull();
    const tomorrow = new Date(NOW.getTime() + 24 * 3600_000);
    expect(chooseNudge([MEAL], { ...MEMORY, lastDay: dayKey(NOW) }, tomorrow)).toBe(MEAL);
  });

  it('never repeats yesterday’s kind, except a favourite car park filling up', () => {
    expect(chooseNudge([MEAL, NEAR], { ...MEMORY, lastKind: 'favNearby' }, NOW)).toBe(MEAL);
    expect(chooseNudge([MEAL], { ...MEMORY, lastKind: 'meal' }, NOW)).toBeNull();
    const filling: Nudge = {
      kind: 'favFilling',
      fav: { id: 'a', name: 'A', free: 2 },
      alt: { id: 'b', name: 'B', free: 40, distanceM: 200 },
    };
    expect(chooseNudge([filling], { ...MEMORY, lastKind: 'favFilling' }, NOW)).toBe(filling);
  });

  it('stays quiet when turned off or muted', () => {
    expect(chooseNudge([MEAL], { ...MEMORY, enabled: false }, NOW)).toBeNull();
    const muted = { ...MEMORY, mutedUntil: new Date(NOW.getTime() + 1000).toISOString() };
    expect(chooseNudge([MEAL], muted, NOW)).toBeNull();
    const over = { ...MEMORY, mutedUntil: new Date(NOW.getTime() - 1000).toISOString() };
    expect(chooseNudge([MEAL], over, NOW)).toBe(MEAL);
  });
});

describe('favFilling', () => {
  const fav = park('fav', north(100), 3);
  it('points from a filling favourite to a roomy car park close to it', () => {
    const list = [
      fav,
      park('far', north(1000), 80),
      park('alt', north(400), 41),
      park('tight', north(150), 4),
    ];
    const n = favFilling([{ id: 'fav' }], list, HERE, NOW);
    expect(n).toMatchObject({
      kind: 'favFilling',
      fav: { id: 'fav', free: 3 },
      alt: { id: 'alt', free: 41 },
    });
  });

  it('needs a live count, a user nearby and an alternative', () => {
    const alt = park('alt', north(300), 41);
    expect(favFilling([{ id: 'fav' }], [park('fav', north(100), 60), alt], HERE, NOW)).toBeNull();
    expect(favFilling([{ id: 'fav' }], [fav, alt], north(5000), NOW)).toBeNull();
    expect(favFilling([{ id: 'fav' }], [fav], HERE, NOW)).toBeNull();
    expect(favFilling([{ id: 'fav' }], [fav, alt], null, NOW)).toBeNull();
    const stale = {
      ...fav,
      updatedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
    } as Parking;
    expect(favFilling([{ id: 'fav' }], [stale, alt], HERE, NOW)).toBeNull();
  });
});

describe('favNearby', () => {
  it('names the closest saved restaurant within 400 m', () => {
    const places = [
      { id: 'a', name: 'A', ...north(350) },
      { id: 'b', name: 'B', ...north(120) },
      { id: 'c', name: 'C', ...north(900) },
    ];
    expect(favNearby(places, HERE)).toMatchObject({ place: { id: 'b' } });
    expect(favNearby([places[2]!], HERE)).toBeNull();
  });
});

describe('hardParking', () => {
  const station = { name: 'Çankaya', distanceM: 320, ...north(320) };
  it('suggests the station when every live car park around is tight', () => {
    const list = [park('a', north(100), 0), park('b', north(300), 3)];
    expect(hardParking(list, HERE, station, NOW)).toMatchObject({
      kind: 'hardParking',
      station: { name: 'Çankaya' },
    });
  });

  it('says nothing with room around, a single car park or no station', () => {
    const tight = [park('a', north(100), 0), park('b', north(300), 3)];
    expect(hardParking([...tight, park('c', north(200), 50)], HERE, station, NOW)).toBeNull();
    expect(hardParking([tight[0]!], HERE, station, NOW)).toBeNull();
    expect(hardParking(tight, HERE, null, NOW)).toBeNull();
  });
});

describe('meal', () => {
  it('suggests the category of the hour with the most places', () => {
    const counts: Record<string, number> = { fish: 4, meyhane: 9, meat: 2 };
    expect(meal(HERE, NOW, (c) => counts[c] ?? 0)).toMatchObject({
      slot: 'evening',
      cat: 'meyhane',
      count: 9,
    });
  });

  it('needs at least three places and a location', () => {
    expect(meal(HERE, NOW, () => 2)).toBeNull();
    expect(meal(null, NOW, () => 20)).toBeNull();
  });
});

describe('roundedCount', () => {
  it('rounds down above a handful, since categories are often guesses', () => {
    expect(roundedCount(4)).toEqual({ key: 'few', count: 4 });
    expect(roundedCount(12)).toEqual({ key: 'over', count: 10 });
    expect(roundedCount(27)).toEqual({ key: 'over', count: 20 });
    expect(roundedCount(140)).toEqual({ key: 'over', count: 50 });
  });
});
