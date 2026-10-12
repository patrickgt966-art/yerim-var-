import '@/i18n';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { FOOD_LEXICON, MODIFIERS } from '../foodLexicon';
import { IZMIR_DISTRICTS, parseQuery } from '../intent';
import { categoryForQuery } from '../restaurants';
import { fold } from '../search';
import { staticParkings } from '../staticParkings';
import izmirPlaces from '../../../data/places-izmir.json';

const deps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings: staticParkings(),
  t: (k) => k,
};

const reasonOf = (c: { kind: string }) => (c as { reason?: string }).reason;

describe('food lexicon', () => {
  it('is big and folded', () => {
    expect(FOOD_LEXICON.size).toBeGreaterThanOrEqual(400);
    for (const w of [...FOOD_LEXICON.keys(), ...MODIFIERS]) expect(fold(w)).toBe(w);
  });

  it('never names a district or a town', () => {
    const places = new Set([
      ...IZMIR_DISTRICTS.map((d) => fold(d.name)),
      ...(izmirPlaces as { items: { n: string; k: string }[] }).items
        .filter((p) => p.k === 'town')
        .map((p) => fold(p.n)),
    ]);
    expect([...FOOD_LEXICON.keys()].filter((w) => places.has(w))).toEqual([]);
  });

  it('reads a lone lexicon word as a category', () => {
    expect(categoryForQuery('musakka')).toBe('lokanta');
    expect(categoryForQuery('bezelye')).toBe('lokanta');
    expect(categoryForQuery('kolyoz')).toBe('fish');
    expect(categoryForQuery('sobiyet')).toBe('dessert');
    expect(categoryForQuery('sahlep')).toBe('cafe');
    expect(categoryForQuery('misir')).toBe('fast');
    expect(categoryForQuery('musakka', false, false)).toBeNull();
  });

  it('keeps the category lists first', () => {
    expect(categoryForQuery('menemen')).toBe('breakfast');
    expect(categoryForQuery('kebap')).toBe('meat');
  });
});

describe('dish phrases with a modifier in front', () => {
  const search = (q: string) => {
    const it = parseQuery(q);
    if (it.kind !== 'search') throw new Error(`${q}: ${it.kind}`);
    return it;
  };

  it('reads the phrase as the dish its last word names', () => {
    for (const [q, cat] of [
      ['cevizli baklava', 'dessert'],
      ['armut tatlısı', 'dessert'],
      ['fırın sütlaç', 'dessert'],
      ['porsiyon döner', 'fast'],
      ['kiremitte köfte', 'meat'],
      ['kiremitte tavuk', 'meat'],
      ['barbunya pilaki', 'lokanta'],
      ['patlıcan musakka', 'lokanta'],
      ['pirinç pilavı', 'lokanta'],
      ['çiftlik kebabı', 'meat'],
      ['piliç çevirme', 'meat'],
      ['kandil simidi', 'breakfast'],
    ] as const) {
      expect(search(q)).toMatchObject({ cat, dish: q, placeQuery: '', district: null });
    }
  });

  it('keeps a district in front of a dish a district', () => {
    expect(search('Bornova kebap')).toMatchObject({ cat: 'meat', district: { name: 'Bornova' } });
    expect(search('kemalpaşa lokanta')).toMatchObject({
      cat: 'lokanta',
      district: { name: 'Kemalpaşa' },
    });
    expect(search("Bornova'da cevizli baklava")).toMatchObject({
      cat: 'dessert',
      dish: 'cevizli baklava',
      district: { name: 'Bornova' },
      placeQuery: '',
    });
    expect(search('karşıyakada kiremitte köfte')).toMatchObject({
      cat: 'meat',
      dish: 'kiremitte köfte',
      district: { name: 'Karşıyaka' },
    });
  });

  it('does not take a word that says nothing as part of the dish', () => {
    expect(search('zzqxv köfte')).toMatchObject({
      cat: 'meat',
      dish: 'köfte',
      placeQuery: 'zzqxv',
    });
    expect(search('zzqxv pilaki')).toMatchObject({
      cat: 'lokanta',
      dish: 'pilaki',
      placeQuery: 'zzqxv',
    });
  });

  it('keeps a drink beside a dish out of the head', () => {
    expect(search('lahmacun ayran')).toMatchObject({ cat: 'fast', dish: 'lahmacun' });
  });

  it('keeps a whole place name a place when one of its words is a lexicon word', () => {
    expect(search('Pirinç Center')).toMatchObject({ cat: null, placeQuery: 'pirinc center' });
    expect(search('pirinç')).toMatchObject({ cat: 'lokanta', dish: 'pirinç' });
  });

  it('reads a district name as a district, not as food', () => {
    expect(search('kiraz')).toMatchObject({ cat: null, district: { name: 'Kiraz' } });
    expect(search('tire')).toMatchObject({ cat: null, district: { name: 'Tire' } });
  });
});

describe('a food question with a known category is never left empty', () => {
  it('shows the category for a dish only the lexicon knows', async () => {
    for (const q of ['musakka', 'bezelye', 'kolyoz', 'şöbiyet']) {
      const { reply } = await answer(q, emptyContext('food'), deps);
      expect(reply.text).toContain('chat.dishUnknown');
      expect(reply.cards.length).toBeGreaterThan(0);
      for (const c of reply.cards) expect(reasonOf(c)).toBeUndefined();
    }
  });

  it('shows the category when the words before the dish are unknown', async () => {
    for (const q of ['zzqxv köfte', 'zzqxv pilaki']) {
      const { reply } = await answer(q, emptyContext('food'), deps);
      expect(reply.text).not.toContain('chat.dishNotFound');
      expect(reply.text).not.toContain('chat.foodNone');
      expect(reply.cards.length).toBeGreaterThan(0);
    }
  });

  it('still asks when nothing says what the word is', async () => {
    const { reply } = await answer('zzqxv', emptyContext('food'), deps);
    expect(reply.cards).toHaveLength(0);
  });
});
