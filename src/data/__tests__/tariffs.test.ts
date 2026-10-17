import { bandMinutes, estimateCost, tariffCost, type Tariff } from '../tariffs';

const ispark: Tariff = {
  parkingId: 'ispark-3068',
  hourly: 110,
  currency: 'TRY',
  bands: [
    { label: '0-1 Saat', price: 110 },
    { label: '1-2 Saat', price: 140 },
    { label: '2-4 Saat', price: 170 },
    { label: '4-8 Saat', price: 220 },
    { label: '8-12 Saat', price: 260 },
    { label: 'Tam Gün', price: 370 },
  ],
  priceKind: 'official',
  validFrom: null,
  source: 'İBB İSPARK',
  verifiedAt: '2026-10-17',
  freeMinutes: 15,
};

describe('banded tariffs', () => {
  it('reads band lengths from the labels', () => {
    expect(bandMinutes('0-1 Saat')).toBe(60);
    expect(bandMinutes('2-4 saat')).toBe(240);
    expect(bandMinutes('Tam Gün')).toBe(1440);
    expect(bandMinutes('Günlük')).toBe(1440);
    expect(bandMinutes('Gece')).toBeNull();
  });

  it('prices a stay by its band, not hourly rate x hours', () => {
    expect(tariffCost(ispark, 10)).toBe(0); // inside the free 15 minutes
    expect(tariffCost(ispark, 40)).toBe(110);
    expect(tariffCost(ispark, 120)).toBe(140);
    expect(tariffCost(ispark, 180)).toBe(170); // hourly x hours would say 330
    expect(estimateCost(110, 180)).toBe(330);
    expect(tariffCost(ispark, 13 * 60)).toBe(370);
    expect(tariffCost(ispark, 30 * 60)).toBe(740); // two started days
  });

  it('gives null when no band can be read, so the hourly estimate is used', () => {
    expect(tariffCost({ ...ispark, bands: [{ label: 'Gece', price: 50 }] }, 60)).toBeNull();
  });
});
