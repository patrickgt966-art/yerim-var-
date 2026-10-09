import { parsePurpose, pickedLabel, pickerParams } from '../pickPlace';

describe('pickPlace', () => {
  it('parses the purpose, defaulting to search', () => {
    expect(parsePurpose('home')).toBe('home');
    expect(parsePurpose('work')).toBe('work');
    expect(parsePurpose('x')).toBe('search');
    expect(parsePurpose(undefined)).toBe('search');
  });

  it('builds picker params without empty values', () => {
    expect(pickerParams({ purpose: 'search', q: '  ', food: false })).toEqual({
      purpose: 'search',
    });
    expect(pickerParams({ purpose: 'search', q: ' Foo ', food: true })).toEqual({
      purpose: 'search',
      q: 'Foo',
      mode: 'food',
    });
    expect(pickerParams({ purpose: 'search', food: true, cat: 'fish' })).toEqual({
      purpose: 'search',
      mode: 'food',
      cat: 'fish',
    });
  });

  it('prefers street, then typed text, then fallback', () => {
    expect(pickedLabel('Kordon 5', 'abc', 'Seçilen nokta')).toBe('Kordon 5');
    expect(pickedLabel(null, ' abc ', 'Seçilen nokta')).toBe('abc');
    expect(pickedLabel(' ', undefined, 'Seçilen nokta')).toBe('Seçilen nokta');
  });
});
