import '@/i18n';

import { IZMIR_DISTRICTS, localPart, looksLikePlace, parseQuery } from '../intent';
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

  it('knows dishes that name a category', () => {
    expect(search('bornovada iskender')).toMatchObject({ cat: 'meat' });
    expect(search('bornovada iskender').district?.name).toBe('Bornova');
    expect(search('mantı').cat).toBe('lokanta');
    expect(search('balık ekmek')).toMatchObject({ cat: 'fish', placeQuery: '' });
  });

  it('strips the shortest suffix that leaves a place name', () => {
    expect(search('kordonda balık').placeQuery).toBe('kordon');
  });

  it('treats chatty verbs as filler', () => {
    expect(search('kahvaltı yapacak yer')).toMatchObject({ placeQuery: '', uncertain: false });
  });

  it('flags generic food without a category', () => {
    expect(search('nerede yemek yiyebilirim')).toMatchObject({
      cat: null,
      food: true,
      placeQuery: '',
      uncertain: false,
    });
    expect(search('ege üniversitesi yakınında yemek')).toMatchObject({
      food: true,
      placeQuery: 'ege universitesi',
    });
  });

  it('shows the dish with Turkish letters', () => {
    expect(parseQuery('bana köfteci bul')).toMatchObject({ dish: 'köfteci' });
    expect(parseQuery('çay bahçesi')).toMatchObject({ dish: 'çay bahçesi' });
  });
});

describe('locative -daki and district typos', () => {
  it('reads "bornovadaki en iyi çorbacı"', () => {
    const r = search('bornovadaki en iyi çorbacı');
    expect(r.cat).toBe('soup');
    expect(r.district?.name).toBe('Bornova');
    expect(r.quality).toBe(true);
  });

  it('tolerates a typo in the district', () => {
    const r = search('bornavadaki en iyi etçi');
    expect(r.cat).toBe('meat');
    expect(r.district?.name).toBe('Bornova');
    expect(r.quality).toBe(true);
    expect(search('bornava').district?.name).toBe('Bornova');
  });

  it('reads "karşıyakadaki balıkçı"', () => {
    const r = search('karşıyakadaki balıkçı');
    expect(r.cat).toBe('fish');
    expect(r.district?.name).toBe('Karşıyaka');
  });

  it('keeps exact districts and unknown names', () => {
    expect(search('konak').district?.name).toBe('Konak');
    expect(search('megapol').district).toBeNull();
  });
});

describe('food words are not places', () => {
  it('keeps tavuk pilavcı out of placeQuery', () => {
    const r = search('bana en yakın tavuk pilavcı bul');
    expect(r.cat).toBe('lokanta');
    expect(r.dish).toContain('pilav');
    expect(r.placeQuery).toBe('');
    expect(r.nearMe).toBe(true);
    expect(search('tavuk pilav').placeQuery).toBe('');
  });

  it('still reads real places', () => {
    expect(search('tavukçukuru').placeQuery).toBe('tavukcukuru');
    expect(search('karşıyaka').district?.name).toBe('Karşıyaka');
    expect(search('alsancak kahvaltı').placeQuery).toBe('alsancak');
    expect(search('kordonda balık').placeQuery).toBe('kordon');
  });

  it('stems a suffixed last word of a two-word phrase', () => {
    expect(categoryForQuery('tavuk pilavci')).toBe('lokanta');
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
    ['etci', 'meat'],
  ])('%s -> %s', (q, cat) => {
    expect(categoryForQuery(q)).toBe(cat);
  });

  it('returns null for a single letter', () => {
    expect(categoryForQuery('a')).toBeNull();
  });
});

describe('localPart', () => {
  it('is empty for chit-chat and a bare category', () => {
    expect(localPart('selam')).toBe('');
    expect(localPart('bana köfteci bul')).toBe('');
  });

  it('keeps only the place part when a category is present', () => {
    expect(localPart("Alsancak'ta kahvaltı")).toBe('alsancak');
  });

  it('keeps the raw text when there is no category', () => {
    expect(localPart('Konak')).toBe('Konak');
  });

  it('gives the district for a car-park text', () => {
    expect(localPart('konakta otopark')).toBe('Konak');
  });

  it('flags near-me and parking mentions', () => {
    expect(search('yakınımda balıkçı').nearMe).toBe(true);
    expect(search('Bornova balıkçı').nearMe).toBe(false);
    expect(parseQuery('burada yemek')).toMatchObject({ nearMe: false });
    const r = search('otoparklı olsun');
    expect(r).toMatchObject({ cat: null, placeQuery: '', mentionsParking: true });
  });

  it('treats address words as filler', () => {
    expect(parseQuery('selam dostum nasılsın').kind).toBe('greeting');
  });

  it('keeps a greeting with a real search as a search', () => {
    expect(search('selam bornova köfte')).toMatchObject({ cat: 'meat', district: { name: 'Bornova' } });
  });

  it('detects off-topic text but not places', () => {
    expect(parseQuery('galatasaray nasıl kazandı la öyle bugün').kind).toBe('offtopic');
    expect(parseQuery('hava nasıl').kind).toBe('offtopic');
    expect(parseQuery('göztepe otopark').kind).toBe('search');
    expect(parseQuery('karşıyaka balık').kind).toBe('search');
    expect(search('göztepe maç').placeQuery).toBe('goztepe');
  });

  it('uses iyi as a greeting only before akşamlar, günler, geceler', () => {
    expect(parseQuery('iyi akşamlar').kind).toBe('greeting');
    expect(search('en iyi köfteci')).toMatchObject({ cat: 'meat', quality: true });
  });

  it('maps stadium words to stadyum', () => {
    expect(search('stada yakın').placeQuery).toBe('stadyum');
  });
});

describe('looksLikePlace', () => {
  it('accepts short place names and rejects questions', () => {
    expect(looksLikePlace('karşıyaka çarşı')).toBe(true);
    expect(looksLikePlace('galatasaray nasıl kazandı')).toBe(false);
    expect(looksLikePlace('Kemeraltı')).toBe(true);
  });
});
