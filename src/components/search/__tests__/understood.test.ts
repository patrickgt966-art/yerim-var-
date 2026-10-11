import { parseQuery, type QueryIntent } from '@/data/intent';

import { sectionFor, understoodChips, type UnderstoodLabels } from '../understood';

const labels: UnderstoodLabels = {
  cat: (c) => `cat:${c}`,
  nearMe: 'yakınımda',
  parking: 'otoparklı',
  exclude: (what) => `${what} hariç`,
};

const chips = (q: string) => understoodChips(parseQuery(q), q, labels);
const texts = (q: string) => chips(q).map((c) => `${c.emoji} ${c.label}`);

describe('understoodChips', () => {
  it('shows dish, district and parking for the mockup query', () => {
    expect(texts("bornova'da kuşbaşı otoparklı")).toEqual([
      '🍽️ kuşbaşı',
      '📍 Bornova',
      '🅿️ otoparklı',
    ]);
  });

  it('falls back to the category label when there is no dish word', () => {
    const intent = { ...parseQuery('balıkçı'), dish: null } as QueryIntent;
    expect(understoodChips(intent, 'balıkçı', labels)).toEqual([
      { key: 'cat', emoji: '🍽️', label: 'cat:fish' },
    ]);
  });

  it('shows near me', () => {
    expect(chips('bana en yakın tavuk pilavcı').map((c) => c.key)).toEqual(['dish', 'nearMe']);
  });

  it('shows the ruled-out category', () => {
    expect(texts('köfte değil balık, Karşıyaka')).toEqual([
      '🍽️ balık',
      '📍 Karşıyaka',
      '🚫 cat:meat hariç',
    ]);
  });

  it('shows a place that is not a district, with Turkish capitals', () => {
    expect(texts('kemeraltı otopark')).toEqual(['📍 Kemeraltı']);
  });

  it('does not claim words it could not place', () => {
    expect(texts("Konak'ta ücretsiz otopark")).toEqual(['📍 Konak']);
    expect(chips('xyzabc')).toEqual([]);
  });

  it('shows nothing for greetings, gibberish, empty and a bare food word', () => {
    expect(chips('selam')).toEqual([]);
    expect(chips('oo')).toEqual([]);
    expect(chips('')).toEqual([]);
    expect(chips('yemek')).toEqual([]);
  });
});

describe('sectionFor', () => {
  it('is food for food searches and park otherwise', () => {
    expect(sectionFor(parseQuery('lahmacun'))).toBe('food');
    expect(sectionFor(parseQuery('kemeraltı otopark'))).toBe('park');
    expect(sectionFor(parseQuery('selam'))).toBe('park');
  });
});
