import {
  bareNameWordsOf,
  displayName,
  editDistance,
  fuzzyNameStart,
  nameWordsOf,
} from '../nameMatch';

describe('the words around a name', () => {
  it('drops the question words, and the generic nouns too for the bare name', () => {
    expect(nameWordsOf('ozlem restoran nerede')).toEqual(['ozlem', 'restoran']);
    expect(bareNameWordsOf('ozlem restoran nerede')).toEqual(['ozlem']);
    expect(bareNameWordsOf('where is ozlem restaurant')).toEqual(['is', 'ozlem']);
    expect(bareNameWordsOf('ozlem lokanta nerde')).toEqual(['ozlem']);
  });

  it('shows the name as typed words in capitals, ø as ö', () => {
    expect(displayName('Øzlem restoran nerede')).toBe('Özlem Restoran');
    expect(displayName('parga BALIK nerde')).toBe('Parga Balık');
  });
});

describe('typing slips in a name', () => {
  it('counts an insert, a delete, a replace and a swap as one edit', () => {
    expect(editDistance('balik', 'baliik')).toBe(1);
    expect(editDistance('balik', 'blaik')).toBe(1);
    expect(editDistance('balik', 'balix')).toBe(1);
    expect(editDistance('balik', 'bali')).toBe(1);
    expect(editDistance('balik', 'kebap')).toBeGreaterThan(2);
  });

  it('forgives one slip from 4 letters, two from 8, and a doubled letter', () => {
    expect(fuzzyNameStart('parga balik', ['parga', 'baliik'])).toBe(true);
    expect(fuzzyNameStart('parga balik', ['parga', 'blaik'])).toBe(true);
    expect(fuzzyNameStart('aklan unlu mamulleri', ['aklan', 'unlu', 'mamullerri'])).toBe(true);
    expect(fuzzyNameStart('kardes balikcilik', ['kardes', 'balikciilk'])).toBe(true);
    expect(fuzzyNameStart('aklan unlu mamulleri', ['aklan', 'unlu', 'mamuxlrri'])).toBe(true);
    // Three letters or fewer: no slip is forgiven.
    expect(fuzzyNameStart('ada bar', ['ada', 'bat'])).toBe(false);
    // Two slips in a 5-letter word are too many.
    expect(fuzzyNameStart('parga balik', ['parga', 'bxlxk'])).toBe(false);
  });

  it('needs the first word to start the name exactly, and two words, and a name at least as long', () => {
    expect(fuzzyNameStart('parga balik', ['parka', 'balik'])).toBe(false);
    expect(fuzzyNameStart('parga balik', ['parga'])).toBe(false);
    expect(fuzzyNameStart('parga', ['parga', 'balik'])).toBe(false);
  });

  it('lets the last typed word be the start of the name word', () => {
    expect(fuzzyNameStart('parga balikci', ['parga', 'baliik'])).toBe(true);
  });
});
