import AsyncStorage from '@react-native-async-storage/async-storage';

import { addRecentSearch, MAX_RECENT_SEARCHES, useApp } from '../app';

const KEY = 'yerim-var/app';

describe('addRecentSearch', () => {
  it('puts the newest first', () => {
    expect(addRecentSearch(['b', 'a'], 'c')).toEqual(['c', 'b', 'a']);
  });

  it('moves a repeated search to the front instead of duplicating it', () => {
    expect(addRecentSearch(['b', 'a', 'c'], 'c')).toEqual(['c', 'b', 'a']);
  });

  it('dedupes ignoring case, spacing and Turkish casing', () => {
    expect(addRecentSearch(['Kemeraltı  otopark', 'x'], 'kemeraltı otopark')).toEqual([
      'kemeraltı otopark',
      'x',
    ]);
    expect(addRecentSearch(['Işık'], 'ışık')).toEqual(['ışık']);
  });

  it('trims the text and ignores blank input', () => {
    expect(addRecentSearch(['a'], '  b  ')).toEqual(['b', 'a']);
    const list = ['a'];
    expect(addRecentSearch(list, '   ')).toBe(list);
  });

  it('keeps at most 10, dropping the oldest', () => {
    let list: string[] = [];
    for (let i = 1; i <= 12; i++) list = addRecentSearch(list, `q${i}`);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe('q12');
    expect(list[9]).toBe('q3');
  });
});

describe('recent searches in the app store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useApp.setState({ recentSearches: [] });
  });

  it('adds and clears', () => {
    useApp.getState().addRecentSearch('lahmacun');
    useApp.getState().addRecentSearch('Konak');
    expect(useApp.getState().recentSearches).toEqual(['Konak', 'lahmacun']);
    useApp.getState().clearRecentSearches();
    expect(useApp.getState().recentSearches).toEqual([]);
  });

  it('restores valid persisted searches', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ state: { recentSearches: ['a', 'b'] }, version: 3 }),
    );
    await useApp.persist.rehydrate();
    expect(useApp.getState().recentSearches).toEqual(['a', 'b']);
  });

  it('repairs corrupt persisted values', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ state: { recentSearches: ['a', 3, '', null, 'b'] }, version: 3 }),
    );
    await useApp.persist.rehydrate();
    expect(useApp.getState().recentSearches).toEqual(['a', 'b']);
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { recentSearches: 'x' }, version: 3 }));
    await useApp.persist.rehydrate();
    expect(useApp.getState().recentSearches).toEqual([]);
  });

  it('keeps the default when an older save has no recent searches', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { city: 'izmir' }, version: 2 }));
    await useApp.persist.rehydrate();
    expect(useApp.getState().recentSearches).toEqual([]);
  });
});
