import '@/i18n';

import { distanceMeters } from '../geo';
import { CURATED_PLACES } from '../places';
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
    expect(first('alsancak limanı')).toBe('Alsancak Limanı');
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

describe('ranking of exact names', () => {
  const top = (q: string) => searchPlaces(q, 3).map((h) => `${h.name}|${h.kind}`);

  it('puts a town before its same-named neighbourhood and look-alikes', () => {
    expect(top('çeşme')[0]).toBe('Çeşme|town');
    expect(top('selçuk')[0]).toBe('Selçuk|town');
  });

  it('puts a landmark before street car parks', () => {
    expect(searchPlaces('efes')[0]?.name).toMatch(/^Efes/);
    expect(searchPlaces('efes')[0]?.kind).not.toBe('parking');
    expect(searchPlaces('hilton')[0]?.kind).not.toBe('parking');
    expect(searchPlaces('ephesus')[0]?.name).toBe('Efes Antik Kenti');
  });

  it('prefers a university for its name or abbreviation', () => {
    expect(searchPlaces('dokuz eylül')[0]?.kind).toBe('university');
    expect(searchPlaces('deü')[0]?.name).toBe('Dokuz Eylül Üniversitesi');
    expect(searchPlaces('ege tıp')[0]?.name).toBe('Ege Üniversitesi Hastanesi');
  });

  it('keeps hospitals reachable behind the area', () => {
    expect(searchPlaces('tepecik').some((h) => h.kind === 'hospital')).toBe(true);
    expect(searchPlaces('tepecik hastanesi')[0]?.kind).toBe('hospital');
  });

  it('marks far only outside the province', () => {
    expect(searchPlaces('selçuk')[0]?.far).toBeUndefined();
    expect(searchPlaces('izmir fuarı')[0]?.far).toBeUndefined();
  });
});

describe('curated places and aliases', () => {
  it.each([
    ['folkart', 'Folkart Towers'],
    ['manas bulvarı', 'Manas Bulvarı'],
    ['aassm', 'Ahmed Adnan Saygun Sanat Merkezi'],
    ['akm', 'Kültürpark'],
    ['alsancak limanı', 'Alsancak Limanı'],
    ['kruvaziyer terminali', 'Alsancak Limanı'],
    ['otogar', 'İzmir Otogarı'],
    ['bus station', 'İzmir Otogarı'],
    ['hisarönü', 'Hisarönü'],
    ['izmir fuarı', 'Kültürpark'],
    ['fuar', 'Kültürpark'],
    ['clock tower', 'Saat Kulesi'],
    ['old bazaar', 'Kemeraltı'],
    ['promenade', 'Kordon'],
    ['airport', 'Adnan Menderes Havalimanı'],
    ['pier', 'Konak Pier'],
  ])('%s finds %s first', (q, name) => {
    expect(searchPlaces(q)[0]?.name).toBe(name);
  });

  it('does not let "car park" match Çarşı', () => {
    expect(searchPlaces('car park').some((h) => /çarşı/i.test(h.name))).toBe(false);
    expect(searchPlaces('parking').some((h) => /çarşı/i.test(h.name))).toBe(false);
  });
});

describe('splitPlaceAndCategory with new food words', () => {
  it.each([
    ['buca çiğköfte', 'buca', 'fast'],
    ['alsancak kokoreç', 'alsancak', 'meat'],
    ['kemeraltı boyoz', 'kemeralti', 'breakfast'],
    ['bostanlı serpme kahvaltı', 'bostanli', 'breakfast'],
  ])('%s', (q, placeQuery, cat) => {
    expect(splitPlaceAndCategory(q)).toEqual({ placeQuery, cat });
  });
});

describe('curated places are listed once', () => {
  it.each(['efes', 'ephesus', 'liman', 'alsancak limanı', 'port', 'fuar', 'akm', 'kültürpark'])(
    '%s has no two hits within 150 m (car parks aside)',
    (q) => {
      // Only curated entries are checked: OSM itself holds near-twins (e.g. the
      // Alsancak metro and Alsancak Gar stations), which the data refresh may add.
      const curated = new Set(CURATED_PLACES.map((p) => p.name));
      const hits = searchPlaces(q, 10);
      for (const [i, a] of hits.entries())
        for (const b of hits.slice(i + 1))
          expect(
            (curated.has(a.name) || curated.has(b.name)) &&
              distanceMeters(a, b) <= 150 &&
              a.kind === b.kind &&
              a.kind !== 'parking',
          ).toBe(false);
    },
  );
});
