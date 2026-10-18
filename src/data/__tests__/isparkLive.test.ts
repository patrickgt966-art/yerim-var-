import { cityById, isInCityArea } from '../cities';
import { getFreshness, visibleFree } from '../freshness';
import { normalizeIspark } from '../isparkProvider';

import capture from '../../../data/raw/fixtures/ispark-park-2026-10.json';

// Real capture, frozen: the first 20 live records of https://api.ibb.gov.tr/ispark/Park as
// fetched in October 2026. A committed copy, not data/raw/ispark-sample.json, which the
// data-refresh workflow rewrites with each new capture (or an { error } stub).
const records = capture.records as Record<string, unknown>[];

const now = new Date();
const fetchedAt = now.toISOString();
const list = normalizeIspark(records, fetchedAt);
const byId = (id: number) => list.find((p) => p.id === `ispark-${id}`);

describe('normalizeIspark on the live capture', () => {
  it('keeps all records', () => {
    expect(records).toHaveLength(20);
    expect(list).toHaveLength(records.length);
  });

  it('gives unique ids that start with ispark-', () => {
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    for (const p of list) expect(p.id).toMatch(/^ispark-/);
  });

  it('keeps every position inside İstanbul', () => {
    const city = cityById('istanbul');
    for (const p of list) expect(isInCityArea(p, city)).toBe(true);
  });

  it('never gives free > capacity', () => {
    for (const p of list) {
      if (p.free != null && p.capacity != null) expect(p.free).toBeLessThanOrEqual(p.capacity);
    }
  });

  it('marks KAPALI OTOPARK as indoor and leaves AÇIK OTOPARK unknown', () => {
    for (const r of records.filter((x) => x.parkType === 'KAPALI OTOPARK')) {
      expect(byId(r.parkID as number)?.isIndoor).toBe(true);
    }
    for (const r of records.filter((x) => x.parkType === 'AÇIK OTOPARK')) {
      expect(byId(r.parkID as number)?.isIndoor).toBeNull();
    }
  });

  it('turns "24 Saat" into nonstop', () => {
    const all = records.filter((x) => x.workHours === '24 Saat');
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) expect(byId(r.parkID as number)?.nonstop).toBe(true);
  });

  it('keeps "07:00-23:00" as openingHoursText', () => {
    expect(byId(3412)).toMatchObject({ openingHoursText: '07:00-23:00', nonstop: null });
  });

  it('shows the free count right after the fetch', () => {
    // Every record whose emptyCapacity is a valid count (not above its capacity) shows it right away.
    const valid = records.filter(
      (r) =>
        Number.isInteger(r.emptyCapacity) &&
        (r.emptyCapacity as number) >= 0 &&
        (r.emptyCapacity as number) <= (r.capacity as number),
    );
    expect(valid.length).toBeGreaterThan(0);
    for (const r of valid) {
      const p = byId(r.parkID as number)!;
      expect(p.free).toBe(r.emptyCapacity);
      expect(getFreshness(p, now)).toEqual({ kind: 'updated', at: now });
      expect(visibleFree(p, now)).toBe(r.emptyCapacity);
    }
  });
});
