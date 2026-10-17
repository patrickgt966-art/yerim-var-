import { mealSlot, orderCravings } from '../home/cravingOrder';
import type { CravingId } from '../home/CravingIcon';

// Same order as CRAVING_IDS (CravingIcon.tsx), kept here so the test needs no SVG.
const IDS: CravingId[] = [
  'breakfast',
  'lahmacun',
  'kebab',
  'fish',
  'soup',
  'chickenRice',
  'world',
  'dessert',
  'coffee',
  'meyhane',
];

describe('mealSlot', () => {
  it('splits the day at 05, 11, 16 and 22', () => {
    expect([4, 5, 10, 11, 15, 16, 21, 22, 0].map(mealSlot)).toEqual([
      'night',
      'morning',
      'morning',
      'noon',
      'noon',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });
});

describe('orderCravings', () => {
  it('puts breakfast, coffee and soup first in the morning', () => {
    expect(orderCravings(IDS, 8)).toEqual([
      'breakfast',
      'coffee',
      'soup',
      'lahmacun',
      'kebab',
      'fish',
      'chickenRice',
      'world',
      'dessert',
      'meyhane',
    ]);
  });

  it('leads with lunch dishes at noon', () => {
    expect(orderCravings(IDS, 13).slice(0, 5)).toEqual([
      'chickenRice',
      'kebab',
      'lahmacun',
      'soup',
      'breakfast',
    ]);
  });

  it('leads with meyhane and fish in the evening', () => {
    expect(orderCravings(IDS, 20).slice(0, 5)).toEqual([
      'meyhane',
      'fish',
      'kebab',
      'world',
      'breakfast',
    ]);
  });

  it('leads with late-night dishes after 22', () => {
    expect(orderCravings(IDS, 23).slice(0, 4)).toEqual(['lahmacun', 'soup', 'dessert', 'kebab']);
    expect(orderCravings(IDS, 2)).toEqual(orderCravings(IDS, 23));
  });

  it('keeps every tile exactly once', () => {
    for (let h = 0; h < 24; h++) expect([...orderCravings(IDS, h)].sort()).toEqual([...IDS].sort());
  });

  it('skips a leading id that is not in the list', () => {
    expect(orderCravings(['kebab', 'coffee'], 8)).toEqual(['coffee', 'kebab']);
  });
});
