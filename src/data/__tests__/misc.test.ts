import { appleMapsUrl, distanceMeters, walkMinutes } from '../geo';
import { loadParkings } from '../repository';
import { estimateCost, tariffFor } from '../tariffs';
import type { ParkingProvider } from '../types';

describe('geo', () => {
  it('computes plausible distances', () => {
    const d = distanceMeters({ lat: 38.4189, lng: 27.1287 }, { lat: 38.4381, lng: 27.1415 });
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2700);
    expect(walkMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(1);
  });

  it('builds an Apple Maps hand-off URL', () => {
    expect(appleMapsUrl({ lat: 38.1, lng: 27.2 }, 'A B')).toBe(
      'http://maps.apple.com/?daddr=38.1,27.2&dirflg=d&q=A%20B',
    );
  });
});

describe('tariffs', () => {
  it('never reports an unverified tariff as official', () => {
    const t = tariffFor('mock-alsancak-katli');
    expect(t?.priceKind).toBe('estimated');
    expect(tariffFor('nope')).toBeNull();
  });

  it('bills every started hour', () => {
    expect(estimateCost(60, 72)).toBe(120);
    expect(estimateCost(60, 0)).toBe(60);
    expect(estimateCost(null, 30)).toBeNull();
  });
});

describe('loadParkings', () => {
  it('falls back to sample data and says so', async () => {
    const failing: ParkingProvider = {
      source: 'izmir-open-data',
      list: () => Promise.reject(new Error('HTTP 403')),
    };
    const res = await loadParkings(failing);
    expect(res.source).toBe('mock');
    expect(res.fallbackReason).toBe('HTTP 403');
    expect(res.parkings.length).toBeGreaterThan(0);
    expect(res.parkings.every((p) => p.source === 'mock')).toBe(true);
  });
});
