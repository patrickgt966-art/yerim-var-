import '@/i18n';

import { changeLanguage, t } from 'i18next';

import { placeTypeLabel, toRestaurant } from '../restaurants';

const place = (k: string, n = 'Xyz', extra: Record<string, unknown> = {}) =>
  toRestaurant({ id: 'osm-t1', n, a: 38.4, o: 27.1, k, ...extra });

describe('placeTypeLabel', () => {
  it.each([
    ['restaurant', 'Restoran'],
    ['cafe', 'Kafe'],
    ['fast_food', 'Hızlı yemek'],
    ['bar', 'Bar'],
    ['bakery', 'Fırın'],
    ['pastry', 'Pastane'],
    ['ice_cream', 'Dondurmacı'],
  ])('names a %s from its kind', (kind, label) => {
    expect(placeTypeLabel(place(kind), t)).toBe(label);
  });

  it('says "Yemek yeri" for a kind it does not name, when no category says more', () => {
    expect(placeTypeLabel(place('mystery'), t)).toBe('Yemek yeri');
  });

  it('has the English equivalent', async () => {
    await changeLanguage('en');
    try {
      expect(placeTypeLabel(place('cafe'), t)).toBe('Café');
      expect(placeTypeLabel(place('mystery'), t)).toBe('Food place');
    } finally {
      await changeLanguage('tr');
    }
  });
});
