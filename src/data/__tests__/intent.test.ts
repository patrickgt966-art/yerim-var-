import '@/i18n';

import { IZMIR_DISTRICTS, parseQuery } from '../intent';
import { categoryForQuery } from '../restaurants';

function search(q: string) {
  const r = parseQuery(q);
  if (r.kind !== 'search') throw new Error(`expected search for "${q}", got ${r.kind}`);
  return r;
}

describe('parseQuery', () => {
  it('detects greetings and abuse', () => {
    expect(parseQuery('selam nasılsın').kind).toBe('greeting');
    expect(parseQuery('ananı sikim').kind).toBe('abuse');
    expect(parseQuery('').kind).toBe('empty');
  });

  it('sends unknown words to the uncertain bucket', () => {
    const r = search('vay ananı doğranı sikim cevap ver');
    expect(r.cat).toBeNull();
    expect(r.uncertain).toBe(true);
  });

  it('drops abuse and filler around a category', () => {
    const r = search('aq bana köfteci bul');
    expect(r.cat).toBe('meat');
    expect(r.requireParking).toBe(false);
    expect(search('bana köfteci bul')).toMatchObject({ cat: 'meat', placeQuery: '' });
    expect(search('yakınımda balıkçı')).toMatchObject({ cat: 'fish', placeQuery: '' });
    expect(search('çorbacı var mı').cat).toBe('soup');
  });

  it('splits a place suffixed with an apostrophe', () => {
    expect(search("Alsancak'ta kahvaltı")).toMatchObject({
      cat: 'breakfast',
      placeQuery: 'alsancak',
    });
  });

  it('reads a long chatty sentence', () => {
    const r = search('nasılsın ben mendereste sağlam bir pirzola yemek istiyorum ne diyorsun hocam');
    expect(r.cat).toBe('meat');
    expect(r.dish).toBe('pirzola');
    expect(r.district?.name).toBe('Menderes');
    expect(r.quality).toBe(true);
    expect(r.requireParking).toBe(false);
  });

  it('requires parking only with a food category', () => {
    const r = search('mendereste pirzola otopark olmayan yeri seçme');
    expect(r.cat).toBe('meat');
    expect(r.dish).toBe('pirzola');
    expect(r.district?.name).toBe('Menderes');
    expect(r.requireParking).toBe(true);
    const b = search('Bornova otoparkı olan köfteci');
    expect(b.cat).toBe('meat');
    expect(b.district?.name).toBe('Bornova');
    expect(b.requireParking).toBe(true);
  });

  it('keeps place words for the name search', () => {
    expect(search('Bülent Börek').text).toContain('bulent');
    expect(search('megapol').cat).toBeNull();
    expect(search('megapol').placeQuery).toBe('megapol');
    expect(search('megapol').uncertain).toBe(false);
  });

  it('does not take the airport for the district', () => {
    expect(search('Adnan Menderes Havalimanı').district).toBeNull();
  });
});

describe('IZMIR_DISTRICTS', () => {
  it('lists the 30 districts', () => {
    expect(IZMIR_DISTRICTS).toHaveLength(30);
  });
});

describe('categoryForQuery stems', () => {
  it.each([
    ['kofteci', 'meat'],
    ['koftecide', 'meat'],
    ['balikcilar', 'fish'],
    ['corbaci', 'soup'],
    ['borekci', 'breakfast'],
    ['kebapci', 'meat'],
    ['lahmacuncu', 'fast'],
    ['tatlici', 'dessert'],
    ['kahvaltici', 'breakfast'],
    ['pideci', 'fast'],
    ['et', 'meat'],
  ])('%s -> %s', (q, cat) => {
    expect(categoryForQuery(q)).toBe(cat);
  });

  it('returns null for a single letter', () => {
    expect(categoryForQuery('a')).toBeNull();
  });
});
