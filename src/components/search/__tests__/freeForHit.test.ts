import type { Parking } from '@/data/types';

import { freeForHit } from '../freeForHit';

const now = new Date('2026-10-11T12:00:00Z');
const live = (over: Partial<Parking>) =>
  ({
    id: 'p',
    name: 'P',
    lat: 38.4,
    lng: 27.1,
    free: 7,
    source: 'izmir',
    updatedAt: '2026-10-11T11:58:00Z',
    fetchedAt: '2026-10-11T11:59:00Z',
    ...over,
  }) as Parking;
const hit = { kind: 'parking' as const, lat: 38.4, lng: 27.1 };

describe('freeForHit', () => {
  it('returns the fresh free count of the car park at the same spot', () => {
    expect(freeForHit(hit, [live({})], now)).toBe(7);
  });

  it('ignores non car park hits and far away car parks', () => {
    expect(freeForHit({ ...hit, kind: 'area' }, [live({})], now)).toBeNull();
    expect(freeForHit(hit, [live({ lat: 38.41 })], now)).toBeNull();
  });

  it('hides stale counts and prefers a fresh car park over a static one', () => {
    expect(freeForHit(hit, [live({ updatedAt: '2026-10-11T09:00:00Z' })], now)).toBeNull();
    expect(freeForHit(hit, [live({ source: 'osm', free: null }), live({ free: 3 })], now)).toBe(3);
  });

  it("never shows a neighbour's count when the hit's own count is stale", () => {
    const own = live({ id: 'a', updatedAt: '2026-10-11T11:30:00Z' });
    const neighbour = live({ id: 'b', lat: 38.4004, free: 37 });
    expect(freeForHit(hit, [own, neighbour], now)).toBeNull();
  });
});
