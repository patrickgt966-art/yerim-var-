import '@/i18n';
import { t as i18nT } from 'i18next';

import type { Parking } from '@/data/types';

import { metaLine, priceText } from '../format';

const t = i18nT;
const now = Date.now();
const park = (over: Partial<Parking>): Parking =>
  ({
    id: 'x',
    name: 'X',
    lat: 41,
    lng: 29,
    capacity: null,
    free: null,
    isIndoor: null,
    isOpen: null,
    isPaid: true,
    nonstop: null,
    openingHours: null,
    openingHoursText: null,
    address: null,
    operator: null,
    source: 'ispark',
    updatedAt: null,
    fetchedAt: new Date(now).toISOString(),
    occupancyKind: 'estimated',
    ...over,
  }) as Parking;

describe('priceText', () => {
  it('shows the 2-hour cost from the bands when the tariff has no first-hour band', () => {
    // ispark-1005: only "Tam Gün" 240; ispark-2147: 60 free minutes, then "1-2 Saat" 140.
    expect(priceText(park({ id: 'ispark-1005' }), t, 'twoHours')).toContain('240');
    expect(priceText(park({ id: 'ispark-2147' }), t, 'twoHours')).toContain('140');
    expect(priceText(park({ id: 'ispark-1005' }), t, 'now')).toBe(t('common.paid'));
  });

  it('prices a car at a per-vehicle İSPARK park from the car bands', () => {
    expect(priceText(park({ id: 'ispark-1189' }), t, 'twoHours')).toContain('70');
  });
});

describe('metaLine', () => {
  it('says closed only while the live flag is fresh, or when the hours agree', () => {
    const closed = park({ isOpen: false, openingHoursText: '00:00-00:00' });
    expect(metaLine(closed, t)).toContain(t('common.closed'));
    const stale = { ...closed, fetchedAt: new Date(now - 60 * 60_000).toISOString() };
    expect(metaLine(stale, t)).not.toContain(t('common.closed'));
  });
});
