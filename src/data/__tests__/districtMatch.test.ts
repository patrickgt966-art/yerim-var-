import { cityById } from '../cities';
import { districtInText, matchDistrict, settleDistrict } from '../districtMatch';
import type { Understanding } from '@/lib/ai/protocol';

const izmir = cityById('izmir').districts;
const istanbul = cityById('istanbul').districts;
const ankara = cityById('ankara').districts;
const antalya = cityById('antalya').districts;
const bursa = cityById('bursa').districts;

const search = (over: Partial<Extract<Understanding, { kind: 'search' }>>): Understanding => ({
  kind: 'search',
  district: null,
  cat: null,
  dish: null,
  place: null,
  food: true,
  requireParking: false,
  appleQuery: null,
  nearMe: false,
  dishServes: null,
  ...over,
});

describe('matchDistrict', () => {
  it('reads suffixes, missing Turkish letters and the city spelling', () => {
    expect(matchDistrict('karsiyakada', izmir)).toBe('Karşıyaka');
    expect(matchDistrict("Kadıköy'de", istanbul)).toBe('Kadıköy');
    expect(matchDistrict('golbasi', ankara)).toBe('Gölbaşı');
    expect(matchDistrict('Göl­başı', ankara)).toBe('Gölbaşı');
    expect(matchDistrict('inegolde', bursa)).toBe('İnegöl');
  });

  it('forgives one typo, two in a long name', () => {
    expect(matchDistrict('bornva', izmir)).toBe('Bornova');
    expect(matchDistrict('aalnya', antalya)).toBe('Alanya');
    expect(matchDistrict('snicanda', ankara)).toBe('Sincan');
    expect(matchDistrict('kciorende', ankara)).toBe('Keçiören');
    expect(matchDistrict('yenimahaalle', ankara)).toBe('Yenimahalle');
    expect(matchDistrict('kadikkoy', istanbul)).toBe('Kadıköy');
  });

  it('keeps short names exact, with their own letters', () => {
    expect(matchDistrict('kaşta', antalya)).toBe('Kaş');
    expect(matchDistrict('kas', antalya)).toBeNull();
    expect(matchDistrict('bucada', izmir)).toBe('Buca');
    expect(matchDistrict('mama', ankara)).toBeNull();
  });

  it('is not fooled by other words', () => {
    for (const w of [
      'kebap',
      'lahmacun',
      'yemek',
      'otopark',
      'karaköy',
      'kızılay',
      'akşam',
      'pizza',
    ]) {
      expect(matchDistrict(w, [...izmir, ...istanbul, ...ankara])).toBeNull();
    }
  });
});

describe('districtInText', () => {
  it('finds the district word, skipping the dish', () => {
    expect(districtInText('kardesim doner golbasi', ankara)).toBe('Gölbaşı');
    expect(districtInText('ya urlada baklava önerin varmı', izmir)).toBe('Urla');
    expect(districtInText('menemen yiyelim', izmir, ['menemen'])).toBeNull();
  });
});

describe('settleDistrict', () => {
  it('fixes a misspelt district to the city spelling', () => {
    const u = settleDistrict(search({ district: 'Bornva' }), 'bornvada kebap', izmir);
    expect(u).toMatchObject({ district: 'Bornova' });
  });

  it('moves a quarter that is not a district to place', () => {
    const u = settleDistrict(search({ district: 'Karaköy' }), 'karaköyde kokoreç', istanbul);
    expect(u).toMatchObject({ district: null, place: 'Karaköy' });
  });

  it('reads a district from the text when the AI left it out', () => {
    const u = settleDistrict(search({ dish: 'döner' }), 'kardesim doner golbasi', ankara);
    expect(u).toMatchObject({ district: 'Gölbaşı' });
  });

  it('takes a district the AI wrote into place', () => {
    const u = settleDistrict(search({ place: 'Bornova' }), 'bornova', izmir);
    expect(u).toMatchObject({ district: 'Bornova', place: null });
  });

  it('leaves near-me searches, a dish named like a district and chat alone', () => {
    expect(settleDistrict(search({ nearMe: true }), 'bornovaya yakın', izmir)).toMatchObject({
      district: null,
    });
    expect(settleDistrict(search({ dish: 'menemen' }), 'menemen yiyelim', izmir)).toMatchObject({
      district: null,
    });
    const chat: Understanding = { kind: 'chat', reply: 'Selam!', action: 'none' };
    expect(settleDistrict(chat, 'bornova', izmir)).toBe(chat);
  });
});
