import { cityById, isInCityArea, setActiveCity } from '../cities';
import { CITY_CURATED_PLACES } from '../curatedPlaces';
import { searchPlacesStrict } from '../search';

describe('curated places of the other cities', () => {
  afterAll(() => setActiveCity('izmir'));

  it('lie inside their own city', () => {
    for (const [city, list] of Object.entries(CITY_CURATED_PLACES)) {
      for (const p of list)
        expect([city, p.name, isInCityArea(p, cityById(city))]).toEqual([city, p.name, true]);
    }
  });

  it.each([
    ['istanbul', 'Ortaköy', 41.047],
    ['istanbul', 'Bağdat Caddesi', 40.965],
    ['istanbul', 'Cevahir', 41.063],
    ['ankara', 'Atakule', 39.886],
    ['ankara', '7. Cadde', 39.923],
    ['bursa', 'Heykel', 40.183],
    ['bursa', 'Kapalı Çarşı', 40.184],
    ['antalya', 'Kaleiçi', 36.885],
    ['antalya', 'Hadrian Kapısı', 36.885],
    ['antalya', 'Konyaaltı Plajı', 36.863],
  ])('%s: "%s" is found where people mean it', (city, q, lat) => {
    setActiveCity(city);
    const h = searchPlacesStrict(q, 1)[0];
    expect(h?.lat).toBeCloseTo(lat, 2);
  });
});
