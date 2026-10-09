import '@/i18n';

import { fold, searchPlaces, splitPlaceAndCategory } from '../search';

describe('fold', () => {
  it('ignores case and Turkish letters', () => {
    expect(fold('İstinyePark İZMİR')).toBe('istinyepark izmir');
    expect(fold('Çiğli Şirinyer Göztepe Üçkuyular')).toBe('cigli sirinyer goztepe uckuyular');
    expect(fold('  Kemeraltı / Konak ')).toBe('kemeralti konak');
  });
});

describe('searchPlaces', () => {
  it('finds malls the address geocoder does not know', () => {
    for (const q of ['istinye', 'İstinye Park', 'istinyepark', 'ISTINYE']) {
      const [top] = searchPlaces(q);
      expect(top?.kind).toBe('mall');
      expect(top?.name).toMatch(/İstinye ?Park/);
    }
  });

  it('keeps same-named places that are far apart', () => {
    // Campus and metro station share the name; both must be offered.
    const kinds = searchPlaces('ege universitesi').map((h) => h.kind);
    expect(kinds).toContain('university');
    expect(kinds).toContain('station');
  });

  it('needs at least two letters', () => {
    expect(searchPlaces('k')).toEqual([]);
  });

  it('finds popular places without Turkish letters', () => {
    expect(searchPlaces('saat kulesi')[0]?.name).toBe('Saat Kulesi');
    expect(searchPlaces('kemeralti')[0]?.name).toBe('Kemeraltı');
  });

  it('finds named car parks by a partial name', () => {
    const hits = searchPlaces('konak katli');
    expect(hits.some((h) => h.name === 'Konak Katlı Otoparkı' && h.kind === 'parking')).toBe(true);
  });

  it('ignores spaces inside names', () => {
    expect(searchPlaces('saatkulesi')[0]?.name).toBe('Saat Kulesi');
  });

  it('never returns unnamed car parks', () => {
    expect(searchPlaces('otopark').every((h) => h.name !== 'Otopark')).toBe(true);
  });
});

describe('multi-word queries', () => {
  const first = (q: string) => searchPlaces(q)[0]?.name;

  it('matches every word against the name', () => {
    expect(first('alsancak limanı')).toBe('Alsancak');
    expect(first('liman')).toBe('Alsancak');
    expect(first('alsancak otopark')).toBe('Alsancak');
    expect(first('kemeraltı çarşısı')).toBe('Kemeraltı');
    expect(first('çarşı')).toBe('Kemeraltı');
    expect(first('kordon alsancak')).toBe('Kordon');
    expect(first('karşıyaka çarşı')).toMatch(/^Karşıyaka/);
    expect(first('izmir otogar')).toMatch(/Otogar/);
  });

  it('lists a place once, the İzmir one first', () => {
    const hits = searchPlaces('saat kulesi');
    expect(hits[0]?.name).toMatch(/Saat Kulesi/);
    expect(hits.every((h) => !h.far)).toBe(true);
    expect(hits[0]!.lat).toBeCloseTo(38.419, 1);
    const names = hits.map((h) => fold(h.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('ranks İzmir hits above far ones', () => {
    expect(searchPlaces('agora')[0]?.name).toMatch(/Agora Açık Hava/);
    const efes = searchPlaces('efes');
    expect(efes[0]?.far).toBeUndefined();
    expect(efes.some((h) => h.far)).toBe(true);
    const ege = searchPlaces('ege universitesi')[0]!;
    expect(ege.far).toBeUndefined();
  });

  it('adds a district to hits', () => {
    const hit = searchPlaces('alsancak gar')[0]!;
    expect(hit.district).toBeTruthy();
  });
});

describe('splitPlaceAndCategory', () => {
  it('splits place and food category', () => {
    const r = splitPlaceAndCategory('Bornova balık');
    expect(r?.cat).toBe('fish');
    expect(searchPlaces(r!.placeQuery)[0]?.name).toBe('Bornova');
    expect(splitPlaceAndCategory('kahvaltı Bostanlı')?.cat).toBe('breakfast');
    expect(splitPlaceAndCategory('Alsancak kelle paça')?.cat).toBe('soup');
  });

  it('does not split chain names or short leftovers', () => {
    expect(splitPlaceAndCategory('kahve dünyası')).toBeNull();
    expect(splitPlaceAndCategory('tavuk dünyası')).toBeNull();
    expect(splitPlaceAndCategory('et bar')).toBeNull();
  });

  it('returns null for a plain place or a lone category', () => {
    expect(splitPlaceAndCategory('Bornova')).toBeNull();
    expect(splitPlaceAndCategory('balık')).toBeNull();
    expect(splitPlaceAndCategory('Saat Kulesi')).toBeNull();
  });
});
