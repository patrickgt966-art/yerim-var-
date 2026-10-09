import { isInIzmirArea } from '../places';
import type { Parking } from '../types';
import { preferLive, promoteFree } from '../useParkings';

const NOW = new Date(2026, 9, 7, 12, 0);

describe('isInIzmirArea', () => {
  it.each([
    ['Konak', 38.4237, 27.1428],
    ['Çeşme', 38.3238, 26.3028],
    ['Alaçatı', 38.2823, 26.3743],
    ['Karaburun', 38.6385, 26.5126],
    ['Foça', 38.6702, 26.7576],
    ['Dikili', 39.0714, 26.8888],
    ['Bergama', 39.1205, 27.1803],
    ['Ödemiş', 38.2275, 27.9714],
    ['Tire', 38.0884, 27.7358],
    ['Kınık', 39.0884, 27.3844],
  ])('%s is inside', (_n, lat, lng) => {
    expect(isInIzmirArea({ lat, lng })).toBe(true);
  });

  it.each([
    ['sea west of Çeşme', 38.4, 26.3],
    ['Aegean', 38.5, 26.0],
    ['Lesbos', 39.1, 26.5],
    ['Ankara', 39.93, 32.86],
  ])('%s is outside', (_n, lat, lng) => {
    expect(isInIzmirArea({ lat, lng })).toBe(false);
  });
});

const r = (id: string, source: string, distance: number, extra: object = {}) => ({
  id,
  source,
  distance,
  ...extra,
});

describe('preferLive with closed car parks', () => {
  it('never promotes a closed live car park and sorts closed last', () => {
    const out = preferLive(
      [r('o1', 'osm', 50), r('l1', 'izmir-open-data', 200, { isOpen: false }), r('o2', 'osm', 300)],
      NOW,
    );
    expect(out.map((x) => x.id)).toEqual(['o1', 'o2', 'l1']);
  });

  it('skips a closed nearest when picking the reference', () => {
    const out = preferLive(
      [r('o1', 'osm', 50, { openingHoursText: '07:00–09:00' }), r('l1', 'izmir-open-data', 600)],
      NOW,
    );
    expect(out.map((x) => x.id)).toEqual(['l1', 'o1']);
  });
});

describe('promoteFree', () => {
  const live = (id: string, distance: number, extra: Partial<Parking> = {}) =>
    ({
      id,
      source: 'izmir-open-data',
      distance,
      free: 10,
      updatedAt: null,
      fetchedAt: NOW.toISOString(),
      ...extra,
    }) as unknown as Parking & { distance: number };
  const stat = (id: string, distance: number) =>
    ({ id, source: 'osm', distance, free: null }) as unknown as Parking & { distance: number };

  it('does not promote a free car park far beyond the nearest', () => {
    const list = [stat('a', 105), stat('b', 300), live('far', 1181)];
    expect(promoteFree(list, NOW)).toBe(list);
  });

  it('promotes one within the live preference distance', () => {
    const out = promoteFree([stat('a', 105), live('near', 400)], NOW);
    expect(out.map((p) => p.id)).toEqual(['near', 'a']);
  });

  it('never promotes a closed car park', () => {
    const list = [stat('a', 105), live('closed', 200, { isOpen: false })];
    expect(promoteFree(list, NOW)).toBe(list);
  });
});
