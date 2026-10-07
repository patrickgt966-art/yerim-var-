import { getFreshness, occupancyLevel, visibleFree } from '../freshness';
import type { Parking } from '../types';

const now = new Date('2026-10-07T12:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

function p(over: Partial<Parking>): Parking {
  return {
    id: 'x',
    name: 'X',
    lat: 0,
    lng: 0,
    capacity: 10,
    free: 4,
    isIndoor: null,
    isOpen: true,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    address: null,
    source: 'izmir-open-data',
    updatedAt: null,
    fetchedAt: minsAgo(1),
    occupancyKind: 'estimated',
    ...over,
  };
}

describe('getFreshness', () => {
  it('never calls data without a source timestamp "live"', () => {
    expect(getFreshness(p({ fetchedAt: minsAgo(0) }), now).kind).toBe('updated');
  });

  it('shows "updated" up to 15 minutes after download', () => {
    expect(getFreshness(p({ fetchedAt: minsAgo(15) }), now).kind).toBe('updated');
    expect(getFreshness(p({ fetchedAt: minsAgo(16) }), now).kind).toBe('unknown');
  });

  it('is "live" only with a recent source measurement', () => {
    expect(getFreshness(p({ updatedAt: minsAgo(9) }), now).kind).toBe('live');
    expect(getFreshness(p({ updatedAt: minsAgo(12) }), now).kind).toBe('updated');
    expect(getFreshness(p({ updatedAt: minsAgo(30), fetchedAt: minsAgo(0) }), now).kind).toBe(
      'unknown',
    );
  });

  it('labels mock data as sample', () => {
    expect(getFreshness(p({ source: 'mock', updatedAt: minsAgo(0) }), now).kind).toBe('sample');
  });

  it('treats a missing count or bad dates as unknown', () => {
    expect(getFreshness(p({ free: null }), now).kind).toBe('unknown');
    expect(getFreshness(p({ fetchedAt: 'not a date' }), now).kind).toBe('unknown');
    expect(getFreshness(p({ fetchedAt: minsAgo(-5) }), now).kind).toBe('unknown');
  });
});

describe('visibleFree', () => {
  it('hides the count when stale', () => {
    expect(visibleFree(p({ fetchedAt: minsAgo(20) }), now)).toBeNull();
    expect(visibleFree(p({ fetchedAt: minsAgo(2) }), now)).toBe(4);
  });
});

describe('occupancyLevel', () => {
  it('buckets by count and ratio', () => {
    expect(occupancyLevel(null, 10)).toBe('unknown');
    expect(occupancyLevel(0, 10)).toBe('full');
    expect(occupancyLevel(3, 80)).toBe('few');
    expect(occupancyLevel(14, 60)).toBe('plenty');
    expect(occupancyLevel(6, 100)).toBe('few');
  });
});
