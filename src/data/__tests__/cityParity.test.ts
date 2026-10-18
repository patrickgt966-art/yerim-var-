import '@/i18n';

import { setActiveCity } from '../cities';
import { parseQuery } from '../intent';
import { searchPlaces } from '../search';

/** What works for İzmir works for every open city: district typos and district search. */
describe('the same rules in every city', () => {
  afterAll(() => setActiveCity('izmir'));

  it.each([
    ['istanbul', 'kadikoyde kebap', 'Kadıköy'],
    ['istanbul', 'besiktsta pizza', 'Beşiktaş'],
    ['ankara', 'cankyada lahmacun', 'Çankaya'],
    ['bursa', 'nilufrde pide', 'Nilüfer'],
    ['antalya', 'muratpsada balık', 'Muratpaşa'],
  ])('%s: "%s" reads the district %s', (city, text, district) => {
    setActiveCity(city);
    const it = parseQuery(text);
    expect(it.kind === 'search' && it.district?.name).toBe(district);
  });

  it.each([
    ['istanbul', 'Kadıköy'],
    ['ankara', 'Çankaya'],
    ['bursa', 'Nilüfer'],
    ['antalya', 'Kemer'],
  ])('%s: searching "%s" lands on the district itself', (city, name) => {
    setActiveCity(city);
    expect(searchPlaces(name, 1)[0]).toMatchObject({ name, kind: 'town' });
  });
});
