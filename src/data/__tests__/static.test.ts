import '@/i18n';

import { getFreshness, visibleFree } from '../freshness';
import { staticParkings, toParking, withStatic } from '../staticParkings';
import type { Parking } from '../types';
import { MAX_STATIC_RESULTS, rankByDistance } from '../useParkings';

const at = '2026-10-07T18:00:00.000Z';
const live = {
  id: 'CPS-TR-IZM-M1-01',
  name: 'Konak Katlı Otopark',
  lat: 38.415959,
  lng: 27.129392,
  free: 661,
  capacity: 888,
  source: 'izmir-open-data',
  updatedAt: null,
  fetchedAt: at,
} as Parking;

function osm(id: string, lat: number, lng: number, name: string | null = null) {
  return toParking(
    {
      id,
      name,
      lat,
      lng,
      capacity: null,
      isPaid: null,
      isIndoor: null,
      nonstop: null,
      openingHoursText: null,
      operator: null,
      address: null,
      access: null,
      source: 'osm',
    },
    at,
  );
}

describe('static parkings', () => {
  it('ships a bundled list covering the province', () => {
    const all = staticParkings();
    expect(all.length).toBeGreaterThan(100);
    expect(all.every((p) => p.source === 'osm' || p.source === 'izelman')).toBe(true);
  });

  it('never shows a free count for them', () => {
    const p = osm('osm-node-1', 38.42, 27.13);
    expect(getFreshness(p).kind).toBe('noData');
    expect(visibleFree({ ...p, free: 12 })).toBeNull();
  });

  it('names unnamed car parks after a nearby place when there is one', () => {
    const p = toParking(
      {
        id: 'osm-node-9',
        name: null,
        lat: 38.45,
        lng: 27.1,
        capacity: null,
        isPaid: null,
        isIndoor: null,
        nonstop: null,
        openingHoursText: null,
        operator: null,
        address: null,
        access: null,
        source: 'osm',
        near: 'Bostanlı',
      },
      at,
    );
    expect(p.name).toBe('Otopark · Bostanlı yakını');
    expect(p.genericName).toBe(true);
  });

  it('names unnamed car parks', () => {
    expect(osm('osm-node-1', 38.42, 27.13).name).toBe('Otopark');
  });

  it('drops a static record that duplicates a live car park', () => {
    const dup = osm('osm-way-1', 38.4161, 27.1294); // ~20 m away
    const other = osm('osm-way-2', 38.43, 27.14);
    expect(withStatic([live], [dup, other]).map((p) => p.id)).toEqual([live.id, other.id]);
  });

  it('caps static results but keeps every live one', () => {
    const many = Array.from({ length: MAX_STATIC_RESULTS + 20 }, (_, i) =>
      osm(`osm-node-${i}`, 38.4159 + i * 0.00001, 27.1293),
    );
    // Live car park is the farthest, so a plain slice would drop it.
    const farLive = { ...live, lat: 38.42, lng: 27.13 };
    const ranked = rankByDistance([...many, farLive], { lat: 38.4159, lng: 27.1293 });
    expect(ranked.filter((p) => p.source === 'osm')).toHaveLength(MAX_STATIC_RESULTS);
    expect(ranked.some((p) => p.id === live.id)).toBe(true);
  });
});
