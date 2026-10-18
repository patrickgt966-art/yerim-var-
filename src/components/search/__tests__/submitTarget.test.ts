import { setActiveCity } from '@/data/cities';
import { parseQuery } from '@/data/intent';
import { allRestaurants, type Restaurant } from '@/data/restaurants';
import type { SearchHit } from '@/data/search';

import { submitTarget } from '../submitTarget';

const place = (name: string, kind: SearchHit['kind'] = 'area'): SearchHit => ({
  name,
  kind,
  lat: 38.43,
  lng: 27.14,
});
const restaurant = (id: string, name: string) =>
  ({ id, name, lat: 38.43, lng: 27.14 }) as Restaurant;

const target = (q: string, restaurants: Restaurant[] = [], places: SearchHit[] = []) =>
  submitTarget(q, parseQuery(q), restaurants, places);

const ALSANCAK = place('Alsancak');
const ALI_BABA = restaurant('r1', 'Ali Baba');

describe('submitTarget', () => {
  it('asks the chat for anything that is not a search (greeting, empty)', () => {
    expect(target('merhaba', [], [ALSANCAK])).toEqual({ kind: 'ask' });
    expect(target('   ', [ALI_BABA], [ALSANCAK])).toEqual({ kind: 'ask' });
  });

  it('asks the chat when the text wants more than a name', () => {
    // Category / dish / food.
    expect(target('alsancak balık', [], [ALSANCAK])).toEqual({ kind: 'ask' });
    expect(target('pizza', [ALI_BABA], [])).toEqual({ kind: 'ask' });
    // Near me.
    expect(target('kordon yakınımda', [], [place('Kordon')])).toEqual({ kind: 'ask' });
    // Quality.
    expect(target('en iyi balıkçı', [], [ALSANCAK])).toEqual({ kind: 'ask' });
    // Excluded category.
    expect(target('alsancak kebap olmasın', [], [ALSANCAK])).toEqual({ kind: 'ask' });
    // Words nothing could place.
    expect(target('xyz abc', [], [])).toEqual({ kind: 'ask' });
  });

  it('opens a bare place name as a place', () => {
    expect(target('alsancak', [], [ALSANCAK])).toEqual({ kind: 'place', hit: ALSANCAK });
  });

  it('a car-park word alone does not turn a place into a question', () => {
    expect(target('alsancak otopark', [], [ALSANCAK])).toEqual({ kind: 'place', hit: ALSANCAK });
  });

  it('opens the first place for a partial name', () => {
    const hits = [ALSANCAK, place('Alsancak Garı', 'station')];
    expect(target('alsan', [], hits)).toEqual({ kind: 'place', hit: ALSANCAK });
  });

  it('opens an exact restaurant name as a restaurant', () => {
    expect(target('Ali Baba', [ALI_BABA], [])).toEqual({ kind: 'restaurant', id: 'r1' });
  });

  it('matches names regardless of case and Turkish letters', () => {
    const r = restaurant('r2', 'Altın Park');
    expect(target('ALTIN park', [r], [])).toEqual({ kind: 'restaurant', id: 'r2' });
  });

  it('prefers the place when both a place and a restaurant are exact', () => {
    const r = restaurant('r3', 'Alsancak');
    expect(target('alsancak', [r], [ALSANCAK])).toEqual({ kind: 'place', hit: ALSANCAK });
  });

  it('prefers a restaurant that is exact over a place that only starts with the text', () => {
    const hits = [place('Ali Baba Sokağı', 'area')];
    expect(target('Ali Baba', [ALI_BABA], hits)).toEqual({ kind: 'restaurant', id: 'r1' });
  });

  it('opens an exact restaurant name even when it holds a food word', () => {
    setActiveCity('izmir');
    const real = allRestaurants().find((r) => r.name === 'Köfteci Yusuf');
    expect(real).toBeTruthy();
    // The name alone reads as a food request, but it is exactly the restaurant's name.
    expect(parseQuery('Köfteci Yusuf')).toMatchObject({ food: true });
    expect(target('Köfteci Yusuf', [real!], [])).toEqual({ kind: 'restaurant', id: real!.id });
    // A place with that exact name still comes first.
    expect(target('Köfteci Yusuf', [real!], [place('Köfteci Yusuf')])).toMatchObject({
      kind: 'place',
    });
  });

  it('still asks the chat for a bare food word, even if a restaurant name contains it', () => {
    const r = restaurant('r4', 'Köfteci Yusuf');
    expect(target('köfte', [r], [])).toEqual({ kind: 'ask' });
  });

  it('opens the first restaurant when every word is a whole word of its name', () => {
    expect(target('ali', [ALI_BABA], [])).toEqual({ kind: 'restaurant', id: 'r1' });
  });

  it('asks the chat when the words are only part of a word, or do not all match', () => {
    expect(target('bab', [ALI_BABA], [])).toEqual({ kind: 'ask' });
    expect(target('ali kemal', [ALI_BABA], [])).toEqual({ kind: 'ask' });
  });

  it('asks the chat when nothing was found', () => {
    expect(target('kuzey sokak', [], [])).toEqual({ kind: 'ask' });
  });
});
