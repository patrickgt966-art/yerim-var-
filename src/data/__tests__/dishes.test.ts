import '@/i18n';

import { DISHES, dishProfile, likelyServes } from '../dishes';
import { parseQuery } from '../intent';
import { categoryForQuery, FOOD_CATEGORIES } from '../restaurants';
import { fold } from '../search';

describe('dishProfile', () => {
  it('resolves exact dishes', () => {
    expect(dishProfile('tavuk pilav')?.cat).toBe('lokanta');
    expect(dishProfile('iskender')?.cat).toBe('meat');
    expect(dishProfile('lahmacun')?.label).toBe('pide-kebap salonu');
  });

  it('is tolerant of the seller ending', () => {
    expect(dishProfile('lahmacuncu')?.dish).toBe('lahmacun');
    expect(dishProfile('tavuk pilavci')?.dish).toBe('tavuk pilav');
    expect(dishProfile('kofteci')?.dish).toBe('kofte');
  });

  it('is tolerant of one typo in a word of 5+ characters', () => {
    expect(dishProfile('lahmcun')?.dish).toBe('lahmacun');
    expect(dishProfile('iskendr')?.dish).toBe('iskender');
  });

  it('returns null for words that are not a dish', () => {
    expect(dishProfile('araba')).toBeNull();
    expect(dishProfile('')).toBeNull();
    // Short words get no typo tolerance.
    expect(dishProfile('pidx')).toBeNull();
  });
});

describe('DISHES', () => {
  it('has a broad dictionary with unique, folded entries', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(DISHES.map((p) => p.dish)).size).toBe(DISHES.length);
    for (const p of DISHES) {
      expect(fold(p.dish)).toBe(p.dish);
      expect(FOOD_CATEGORIES).toContain(p.cat);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.serves.length).toBeGreaterThan(0);
      for (const w of p.serves) expect(fold(w)).toBe(w);
    }
  });

  it('never lists a generic place word as a dish keyword', () => {
    for (const p of DISHES) {
      for (const w of ['restoran', 'cafe', 'kafe', 'bar']) expect(p.serves).not.toContain(w);
    }
  });

  it('is read as food, in the same category, by parseQuery', () => {
    const bad: string[] = [];
    for (const p of DISHES) {
      const it = parseQuery(`${p.dish} yemek istiyorum`);
      const cat = it.kind === 'search' ? it.cat : null;
      if (cat !== p.cat) bad.push(`${p.dish}: want ${p.cat}, got ${cat}`);
      if (dishProfile(p.dish)?.dish !== p.dish) bad.push(`${p.dish}: does not resolve to itself`);
    }
    expect(bad).toEqual([]);
  });
});

describe('meat dishes', () => {
  it.each([
    'kusbasi',
    'sac kavurma',
    'et kavurma',
    'kavurma',
    'tandir',
    'kuzu tandir',
    'sis',
    'cop sis',
    'kuzu sis',
    'tavuk sis',
    'kanat',
    'pirzola',
    'kaburga',
    'antrikot',
    'bonfile',
    'ciger sis',
    'izgara kofte',
    'sucuk izgara',
    'karisik izgara',
    'testi kebabi',
    'cokertme',
    'kagit kebabi',
    'orman kebabi',
    'kebap cesitleri',
  ])('knows %s as meat', (dish) => {
    expect(dishProfile(dish)?.dish).toBe(dish);
    expect(dishProfile(dish)?.cat).toBe('meat');
    expect(categoryForQuery(dish)).toBe('meat');
  });

  it('knows etli pide as a pide', () => {
    expect(dishProfile('etli pide')?.cat).toBe('fast');
    expect(categoryForQuery('etli pide')).toBe('fast');
  });

  it('gives kuşbaşı name words of meat places, not generic words', () => {
    const p = dishProfile('kusbasi')!;
    expect(likelyServes(p, 'ates ocakbasi', [])).toBe(true);
    expect(likelyServes(p, 'et lokantasi nimet', [])).toBe(true);
    expect(likelyServes(p, 'sacit usta pastane', [])).toBe(false);
  });
});

describe('likelyServes', () => {
  const lahmacun = dishProfile('lahmacun')!;

  it('matches a serves word at a word start of the folded name', () => {
    expect(likelyServes(lahmacun, 'alsancak pide kebap', [])).toBe(true);
    expect(likelyServes(lahmacun, 'usta pideci', [])).toBe(true);
  });

  it('does not match inside a word', () => {
    expect(likelyServes(lahmacun, 'popeyes', [])).toBe(false);
    expect(likelyServes(dishProfile('steak')!, 'steakhouse nimet', [])).toBe(true);
    expect(likelyServes(dishProfile('kofte')!, 'nimet', [])).toBe(false);
  });

  it('matches an implying cuisine tag', () => {
    expect(likelyServes(lahmacun, 'x', ['pide_lahmacun'])).toBe(true);
    expect(likelyServes(lahmacun, 'x', ['burger'])).toBe(false);
  });
});
