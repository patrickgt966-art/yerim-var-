import '@/i18n';

import { t } from 'i18next';

import { mapsLink, placeShareText, planShareText } from '../share';

describe('share texts', () => {
  const place = {
    name: 'Köfteci Yusuf & Oğulları',
    address: 'Kıbrıs Şehitleri Cd. 12',
    lat: 38.43,
    lng: 27.14,
  };

  it('a place: name, address, a maps link that encodes the name, the footer', () => {
    expect(mapsLink(place, place.name)).toBe(
      'https://maps.apple.com/?ll=38.43,27.14&q=K%C3%B6fteci%20Yusuf%20%26%20O%C4%9Fullar%C4%B1',
    );
    expect(placeShareText(place, t).split('\n')).toEqual([
      'Köfteci Yusuf & Oğulları · Kıbrıs Şehitleri Cd. 12',
      mapsLink(place, place.name),
      'Yerim Var ile bulundu 📍',
    ]);
    expect(placeShareText({ ...place, address: null }, t).split('\n')[0]).toBe(place.name);
  });

  it('a plan: numbered steps, the reason, the car park link', () => {
    const plan = {
      steps: ['Konak Otoparkı’na park et', '3 dk yürü', 'Köfteci Yusuf’ta ye'],
      why: 'Neden: otopark yakın.',
      dest: { name: 'Konak Otoparkı', lat: 38.41, lng: 27.12 },
    };
    const lines = planShareText(plan, t).split('\n');
    expect(lines.slice(1, 5)).toEqual([
      '1. Konak Otoparkı’na park et',
      '2. 3 dk yürü',
      '3. Köfteci Yusuf’ta ye',
      'Neden: otopark yakın.',
    ]);
    expect(lines[5]).toContain('maps.apple.com/?ll=38.41,27.12');
    expect(planShareText({ ...plan, why: null }, t)).not.toContain('Neden');
  });
});
