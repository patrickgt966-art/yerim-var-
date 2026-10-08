import '@/i18n';

import { mergeHits, searchApplePlaces, toAppleHits } from '../appleSearch';
import type { SearchHit } from '../search';

const row = {
  name: ' Sevil 2 İş Hanı ',
  latitude: 38.4231,
  longitude: 27.1402,
  address: 'Fevzipaşa Blv. Konak',
  phone: '',
  url: '',
  category: '',
};

describe('Apple place search', () => {
  it('returns nothing where the native module is missing (Expo Go, tests)', async () => {
    await expect(searchApplePlaces('Sevil 2 İş Hanı')).resolves.toEqual([]);
  });

  it('turns results into search hits with the address as subtitle', () => {
    expect(toAppleHits([row])).toEqual([
      {
        name: 'Sevil 2 İş Hanı',
        kind: 'apple',
        lat: 38.4231,
        lng: 27.1402,
        subtitle: 'Fevzipaşa Blv. Konak',
      },
    ]);
    expect(
      toAppleHits([
        { ...row, name: ' ' },
        { ...row, latitude: Number.NaN },
      ]),
    ).toEqual([]);
  });

  it('keeps local hits first and skips Apple duplicates of them', () => {
    const local: SearchHit[] = [{ name: 'Konak Pier', kind: 'mall', lat: 38.4245, lng: 27.1286 }];
    const apple = toAppleHits([
      { ...row, name: 'KONAK PİER', latitude: 38.4246, longitude: 27.1287 },
      row,
    ]);
    expect(mergeHits(local, apple).map((h) => h.name)).toEqual(['Konak Pier', 'Sevil 2 İş Hanı']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...row,
      name: `Yer ${i}`,
      latitude: 38 + i / 10,
    }));
    expect(mergeHits([], toAppleHits(many))).toHaveLength(8);
  });
});
