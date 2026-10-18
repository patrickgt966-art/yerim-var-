import '@/i18n';

import { fetchApplePlaces, searchApplePlaces, toAppleHits } from '../appleSearch';
import { activeCity } from '../cities';

const mockSearch = jest.fn();
jest.mock('../../../modules/yerim-mapkit', () => ({
  YerimMapKit: { searchPlacesAsync: (...args: unknown[]) => mockSearch(...args) },
}));

const row = {
  name: 'Sevil 2 İş Hanı',
  latitude: 38.4231,
  longitude: 27.1402,
  address: 'Fevzipaşa Blv. Konak',
  phone: '',
  url: '',
  category: '',
};

describe('Apple place search with the native module', () => {
  it('leaves out results outside the active city (the region only biases Apple)', () => {
    const ankara = { ...row, name: 'Kızılay', latitude: 39.9208, longitude: 32.8541 };
    expect(toAppleHits([ankara, row]).map((h) => h.name)).toEqual(['Sevil 2 İş Hanı']);
  });

  it('a failure is an error for the suggestion query, so it is not cached as "no results"', async () => {
    mockSearch.mockRejectedValueOnce(new Error('throttled'));
    await expect(fetchApplePlaces('Sevil 2 İş Hanı', activeCity().center)).rejects.toThrow();
    // The submit fallback still gets an empty list and goes on to the geocoder.
    mockSearch.mockRejectedValueOnce(new Error('offline'));
    await expect(searchApplePlaces('Sevil 2 İş Hanı')).resolves.toEqual([]);
    mockSearch.mockResolvedValueOnce([row]);
    await expect(searchApplePlaces('Sevil 2 İş Hanı')).resolves.toHaveLength(1);
  });
});
