import { locative, slugify } from '../site/turkish';

describe('slugify', () => {
  it('folds Turkish letters to ascii and joins words with hyphens', () => {
    expect(slugify('Alsancak')).toBe('alsancak');
    expect(slugify('Kadıköy')).toBe('kadikoy');
    expect(slugify('İstinye')).toBe('istinye');
    expect(slugify('Çekirge')).toBe('cekirge');
    expect(slugify('Şişli')).toBe('sisli');
    expect(slugify('Eşrefpaşa')).toBe('esrefpasa');
    expect(slugify('Ümitköy')).toBe('umitkoy');
    expect(slugify('Dünya mutfağı')).toBe('dunya-mutfagi');
    expect(slugify('  et-ızgara ')).toBe('et-izgara');
  });
});

describe('locative', () => {
  it('follows vowel harmony and the voiceless-consonant rule', () => {
    expect(locative('Alsancak')).toBe("Alsancak'ta");
    expect(locative('Kadıköy')).toBe("Kadıköy'de");
    expect(locative('Bostanlı')).toBe("Bostanlı'da");
    expect(locative('Ümitköy')).toBe("Ümitköy'de");
    expect(locative('Çekirge')).toBe("Çekirge'de");
    expect(locative('Beşiktaş')).toBe("Beşiktaş'ta");
    expect(locative('Bornova')).toBe("Bornova'da");
    expect(locative('Taksim')).toBe("Taksim'de");
    expect(locative('Bilkent')).toBe("Bilkent'te");
    expect(locative('Kızılay')).toBe("Kızılay'da");
    expect(locative('Olimpos')).toBe("Olimpos'ta");
  });

  it('uses -nda / -nde for names that end in a possessive', () => {
    expect(locative('Konyaaltı')).toBe("Konyaaltı'nda");
    expect(locative('Kaleiçi')).toBe("Kaleiçi'nde");
    expect(locative('Beyoğlu')).toBe("Beyoğlu'nda");
  });

  it('matches the example locatives kept in cities.ts', () => {
    // CityExamples carries the hand-written forms; the helper must agree with them.
    const { CITIES } = jest.requireActual('@/data/cities') as typeof import('@/data/cities');
    for (const city of CITIES) {
      const e = city.examples;
      if (!e) continue;
      for (const k of ['a', 'b', 'c', 'd'] as const) {
        expect(locative(e[k])).toBe(e[`${k}Loc` as 'aLoc']);
      }
    }
  });
});
