import '@/i18n';

import { t } from 'i18next';

import { mapsLink, placeShareText, planShareText, SHARE_BASE, shareLink } from '../share';

describe('share texts', () => {
  const place = {
    id: 'osm-n123',
    name: 'Köfteci Yusuf & Oğulları',
    address: 'Kıbrıs Şehitleri Cd. 12',
    lat: 38.43,
    lng: 27.14,
  };

  it('a share link: our page, the id and the values encoded, coordinates to 5 decimals', () => {
    expect(SHARE_BASE).toBe('https://yerimvar.app');
    expect(shareLink('r', place)).toBe(
      'https://yerimvar.app/r/osm-n123?n=K%C3%B6fteci%20Yusuf%20%26%20O%C4%9Fullar%C4%B1&ll=38.43,27.14&a=K%C4%B1br%C4%B1s%20%C5%9Eehitleri%20Cd.%2012',
    );
    const p = { id: 'apple-38.41234,27.12345', name: 'Konak', lat: 38.4123456, lng: 27.1 };
    expect(shareLink('p', p)).toBe(
      'https://yerimvar.app/p/apple-38.41234%2C27.12345?n=Konak&ll=38.41235,27.1',
    );
    const long = shareLink('p', { ...p, name: 'a'.repeat(90), address: 'b'.repeat(120) });
    expect(long).toContain(`n=${'a'.repeat(80)}&`);
    expect(long).toContain(`a=${'b'.repeat(100)}`);
    expect(long).not.toContain('b'.repeat(101));
  });

  it('a place: name, address, a share link, the footer', () => {
    expect(mapsLink(place, place.name)).toBe(
      'https://maps.apple.com/?ll=38.43,27.14&q=K%C3%B6fteci%20Yusuf%20%26%20O%C4%9Fullar%C4%B1',
    );
    expect(placeShareText('r', place, t).split('\n')).toEqual([
      'Köfteci Yusuf & Oğulları · Kıbrıs Şehitleri Cd. 12',
      shareLink('r', place),
      'Yerim Var ile bulundu 📍',
    ]);
    expect(placeShareText('p', { ...place, address: null }, t).split('\n')[0]).toBe(place.name);
    expect(placeShareText('p', { ...place, address: null }, t)).not.toContain('&a=');
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
    const known = { ...plan, dest: { ...plan.dest, id: 'ispark-12', kind: 'p' as const } };
    expect(planShareText(known, t).split('\n')[5]).toBe(
      'Otopark: https://yerimvar.app/p/ispark-12?n=Konak%20Otopark%C4%B1&ll=38.41,27.12',
    );
    expect(planShareText({ ...plan, why: null }, t)).not.toContain('Neden');
  });

  it('a plan with ids links to our pages for the car park and the place; maps only without an id', () => {
    const plan = {
      steps: ['1'],
      why: null,
      dest: { name: 'Konak Otoparkı', lat: 38.41, lng: 27.12 },
      place: { id: 'osm-n9', name: 'Köfteci Yusuf', lat: 38.42, lng: 27.13 },
    };
    const known = { ...plan, dest: { ...plan.dest, id: 'ispark-12', kind: 'p' as const } };
    const lines = planShareText(known, t).split('\n');
    expect(lines).toContain(`Otopark: ${shareLink('p', { ...known.dest, id: 'ispark-12' })}`);
    expect(lines).toContain(`Yer: ${shareLink('r', plan.place)}`);
    expect(planShareText(known, t)).toContain('https://yerimvar.app/p/ispark-12');
    expect(planShareText(known, t)).toContain('https://yerimvar.app/r/osm-n9');
    expect(planShareText(known, t)).not.toContain('maps.apple.com');
    // No car park id: the Apple Maps link stays as the fallback; the place still has our link.
    const noId = planShareText(plan, t);
    expect(noId).toContain('maps.apple.com/?ll=38.41,27.12');
    expect(noId).toContain('https://yerimvar.app/r/osm-n9');
    expect(noId).not.toContain('https://yerimvar.app/p/');
    // No place (a car-park-only plan): only the car park link.
    expect(planShareText({ ...known, place: undefined }, t)).not.toContain('/r/');
  });
});
