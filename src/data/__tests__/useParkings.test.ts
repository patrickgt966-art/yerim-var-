import { gridIndex, near } from '../geo';
import { staticParkings, withStatic } from '../staticParkings';
import type { Parking, ParkingResult } from '../types';
import { addStatic, STATIC_ONLY_PLACEHOLDER } from '../useParkings';

const live: Parking = {
  ...staticParkings()[0]!,
  id: 'live-1',
  source: 'izmir-open-data',
  free: 5,
  lat: 38.5,
  lng: 27.5,
};

describe('addStatic', () => {
  it('replaces sample data with the bundled car parks', () => {
    const mock: ParkingResult = {
      parkings: [{ ...live, id: 'mock-1', source: 'mock' }],
      source: 'mock',
      fetchedAt: '2026-10-07T10:00:00.000Z',
      fallbackReason: 'HTTP 500',
    };
    const out = addStatic(mock);
    expect(out.source).toBe('static-only');
    expect(out.fallbackReason).toBe('HTTP 500');
    expect(out.parkings.some((p) => p.source === 'mock')).toBe(false);
    expect(out.parkings).toHaveLength(staticParkings().length);
    // No invented counts.
    expect(out.parkings.every((p) => p.free === null)).toBe(true);
    // Merged once per result object.
    expect(addStatic(mock)).toBe(out);
  });
  it('adds static car parks to real data and keeps live ones first', () => {
    const real: ParkingResult = {
      parkings: [live],
      source: 'izmir-open-data',
      fetchedAt: '2026-10-07T10:00:00.000Z',
    };
    const out = addStatic(real);
    expect(out.source).toBe('izmir-open-data');
    expect(out.parkings[0]).toBe(live);
    expect(out.parkings.length).toBeGreaterThan(1);
    expect(addStatic(real)).toBe(out);
  });
  it('shows static car parks for the placeholder without claiming a failure', () => {
    const out = addStatic(STATIC_ONLY_PLACEHOLDER);
    expect(out.source).toBe('static-only');
    expect(out.fallbackReason).toBeUndefined();
    expect(out.parkings).toHaveLength(staticParkings().length);
  });
});

describe('grid lookup', () => {
  it('finds exactly the points within the radius', () => {
    const pts = [
      { lat: 38.4, lng: 27.1 },
      { lat: 38.4003, lng: 27.1 }, // ~33 m
      { lat: 38.4, lng: 27.1012 }, // ~104 m
      { lat: 38.41, lng: 27.1 },
    ];
    const idx = gridIndex(pts, 80);
    expect(near(idx, pts[0]!, 80)).toHaveLength(2);
    expect(near(idx, pts[0]!, 120)).toHaveLength(3);
    expect(near(idx, pts[0]!, 5000)).toHaveLength(4);
    expect(near(gridIndex([], 80), pts[0]!, 80)).toEqual([]);
    expect(near(idx, { lat: NaN, lng: 1 }, 80)).toEqual([]);
  });
  it('withStatic keeps a far static record and drops a near duplicate', () => {
    const s = staticParkings();
    const dup = { ...s[0]!, id: 'dup', lat: s[0]!.lat + 0.0002 };
    const far = { ...s[0]!, id: 'far', lat: s[0]!.lat + 0.01 };
    const base = { ...live, lat: s[0]!.lat, lng: s[0]!.lng };
    expect(withStatic([base], [dup, far]).map((p) => p.id)).toEqual(['live-1', 'far']);
  });
});
