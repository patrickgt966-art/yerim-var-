import { cityById, isInCityArea, setActiveCity } from '../cities';
import { quarterInText, settleDistrict } from '../districtMatch';
import { CITY_QUARTERS } from '../quarters';
import { fold, searchPlacesStrict } from '../search';

describe('quarters', () => {
  afterAll(() => setActiveCity('izmir'));

  it('lie in a district of their city', () => {
    for (const [city, list] of Object.entries(CITY_QUARTERS)) {
      for (const q of list)
        expect([city, q.n, cityById(city).districts.includes(q.d)]).toEqual([city, q.n, true]);
    }
  });

  it('are found by the place search, inside the city', () => {
    const misses: string[] = [];
    for (const [city, list] of Object.entries(CITY_QUARTERS)) {
      setActiveCity(city);
      for (const q of list) {
        const h = searchPlacesStrict(q.n, 1)[0];
        if (
          !h ||
          !isInCityArea(h, cityById(city)) ||
          !fold(h.name).replace(/ /g, '').startsWith(fold(q.n).replace(/ /g, ''))
        )
          misses.push(`${city}: ${q.n} -> ${h?.name ?? 'nothing'}`);
      }
    }
    expect(misses).toEqual([]);
  });
});

describe('a quarter written bare', () => {
  const antalya = CITY_QUARTERS.antalya!;
  const search = (over: Record<string, unknown> = {}) =>
    ({
      kind: 'search',
      district: null,
      place: null,
      nearMe: true,
      dish: null,
      dishServes: null,
      clarify: null,
      ...over,
    }) as never;

  it.each([
    ['lara balık', 'Lara'],
    ["Lara'da balık", 'Lara'],
    ['larada kahvaltı', 'Lara'],
    ['hurmada pide', 'Hurma'],
    ['hurma tarafında pide', 'Hurma'],
  ])('"%s" names %s', (text, name) => {
    expect(quarterInText(text, antalya)?.n).toBe(name);
  });

  it.each(['hurma tatlısı', 'kalkan balığı', 'liman gibi bir yer', 'lahmacun'])(
    '"%s" names no quarter (an everyday word)',
    (text) => {
      expect(quarterInText(text, antalya)).toBeNull();
    },
  );

  it('becomes the place when the AI named none, not otherwise', () => {
    const d = cityById('antalya').districts;
    expect(settleDistrict(search(), 'lara balık', d, antalya)).toMatchObject({
      place: 'Lara',
      nearMe: false,
    });
    expect(settleDistrict(search({ place: 'Kaleiçi' }), 'lara balık', d, antalya)).toMatchObject({
      place: 'Kaleiçi',
    });
    // The AI asked which place was meant: the question stays.
    const asked = search({ clarify: { ask: 'place', text: null } });
    expect(settleDistrict(asked, 'lara balık', d, antalya)).toMatchObject({ place: null });
    // The dish the AI read is never a place.
    expect(settleDistrict(search({ dish: 'hurma' }), 'hurmada hurma', d, antalya)).toMatchObject({
      place: null,
    });
  });
});
