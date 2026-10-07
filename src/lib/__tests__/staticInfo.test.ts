import '@/i18n';

import { t } from 'i18next';

import { isStatic, sourceLabel, staticHeadline } from '../staticInfo';

describe('static card copy', () => {
  it('marks only bundled car parks as static', () => {
    expect(isStatic({ source: 'osm' })).toBe(true);
    expect(isStatic({ source: 'izelman' })).toBe(true);
    expect(isStatic({ source: 'izmir-open-data' })).toBe(false);
    expect(isStatic({ source: 'mock' })).toBe(false);
  });

  it('leads with capacity, then walking time, never a free count', () => {
    expect(staticHeadline({ capacity: 888, walk: 3 }, t)).toEqual({
      value: '888',
      label: 'araç kapasitesi',
    });
    expect(staticHeadline({ capacity: null, walk: 3 }, t)).toEqual({
      value: '~3',
      label: 'dk yürüme',
    });
    expect(staticHeadline({ capacity: null }, t)).toBeNull();
  });

  it('names the source as a reason to trust it', () => {
    expect(sourceLabel({ source: 'izelman' }, t)).toBe('Belediye otoparkı');
    expect(sourceLabel({ source: 'osm' }, t)).toBe('Haritada kayıtlı');
    expect(sourceLabel({ source: 'izmir-open-data' }, t)).toBeNull();
  });
});
