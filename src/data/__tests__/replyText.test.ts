import i18n from '@/i18n';

import {
  capitalize,
  daypartOf,
  foodReply,
  foundNameReply,
  parkReply,
  type FoodFacts,
  type ParkFacts,
} from '../replyText';

const tr = i18n.getFixedT('tr') as (k: string, o?: Record<string, unknown>) => string;
const en = i18n.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;
/** Test translator: the key and the values it was given. */
const mock = (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k);

const food = (over: Partial<FoodFacts> = {}): FoodFacts => ({
  where: 'Alsancak',
  what: 'balık restoranı',
  count: 12,
  withPark: 8,
  requireParking: false,
  freeOnly: false,
  nearestWalkMin: null,
  freeParkCount: null,
  openNowCount: null,
  knownHoursCount: null,
  daypart: 'noon',
  ...over,
});

const park = (over: Partial<ParkFacts> = {}): ParkFacts => ({
  where: 'Alsancak',
  count: 6,
  nearestName: null,
  nearestWalkMin: null,
  nearestFree: null,
  liveCount: 0,
  freeOfChargeCount: 0,
  ...over,
});

const SEEDS = ['a', 'b', 'balıkçı', 'otoparklı kebap', 'konak', 'x1', 'y22', 'zeytin'];
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

const FOOD_SITUATIONS: [string, Partial<FoodFacts>][] = [
  ['normal', {}],
  ['no car park near any', { withPark: 0 }],
  ['parking required', { requireParking: true, count: 8 }],
  ['free parking only', { requireParking: true, freeOnly: true, freeParkCount: 4, count: 8 }],
  ['one place', { count: 1, withPark: 1 }],
  ['dish', { dish: 'patates kızartması' }],
  ['dish, no car park near', { dish: 'tavuk', withPark: 0 }],
  ['dish, parking required', { dish: 'köfte', requireParking: true, count: 8 }],
  [
    'dish, free parking only',
    { dish: 'köfte', requireParking: true, freeOnly: true, freeParkCount: 4, count: 8 },
  ],
  [
    'every fact known',
    {
      nearestWalkMin: 2,
      freeParkCount: 3,
      openNowCount: 4,
      knownHoursCount: 5,
      daypart: 'night',
    },
  ],
];

describe('foodReply', () => {
  it.each(FOOD_SITUATIONS)('reads cleanly in both languages: %s', (_name, over) => {
    for (const seed of SEEDS) {
      for (const t of [tr, en]) {
        const text = foodReply(food(over), t, seed);
        expect(text).not.toMatch(/undefined|NaN|{{|chat\./);
        expect(sentences(text)).toBeLessThanOrEqual(2);
        expect(text).toContain('Alsancak');
      }
    }
  });

  it('uses the right lead for each situation', () => {
    expect(foodReply(food(), mock, 's')).toMatch(/^chat\.reply\.foodLead_\d /i);
    expect(foodReply(food({ withPark: 0 }), mock, 's')).toMatch(/^chat\.reply\.foodPlainLead_\d /i);
    expect(foodReply(food({ requireParking: true }), mock, 's')).toMatch(
      /^chat\.reply\.foodParkLead_\d /i,
    );
    expect(
      foodReply(food({ requireParking: true, freeOnly: true, freeParkCount: 2 }), mock, 's'),
    ).toMatch(/^chat\.reply\.foodFreeLead_\d /i);
  });

  describe('category versus dish wording', () => {
    const noun = 'balık restoranı';
    const dishCases: Partial<FoodFacts>[] = [
      { dish: 'patates kızartması' },
      { dish: 'patates kızartması', withPark: 0 },
      { dish: 'patates kızartması', requireParking: true },
      { dish: 'patates kızartması', requireParking: true, freeOnly: true, freeParkCount: 3 },
    ];

    it('names a category search by the category noun', () => {
      for (const seed of SEEDS) {
        for (const over of [{}, { withPark: 0 }, { requireParking: true }]) {
          const text = foodReply(food(over), tr, seed);
          expect(text).toContain(noun);
          expect(text).not.toContain('bulabileceğin');
        }
      }
    });

    it('names a dish search by what you can get, never by a shop type', () => {
      for (const over of dishCases) {
        for (const seed of SEEDS) {
          for (const t of [tr, en]) {
            const text = foodReply(food(over), t, seed);
            expect(text.toLocaleLowerCase('tr')).toContain('patates kızartması');
            // The category noun (or any shop-type label) is not in a dish reply.
            expect(text).not.toContain(noun);
            expect(text).not.toMatch(/restoranı|restaurants|fish|balıkçı|köfteci/);
            expect(text).toMatch(/\b\d+ (yer|place)/);
          }
        }
      }
    });

    it('uses the dish lead sets', () => {
      expect(foodReply(food({ dish: 'tavuk' }), mock, 's')).toMatch(
        /^chat\.reply\.foodDishLead_\d /i,
      );
      expect(foodReply(food({ dish: 'tavuk', withPark: 0 }), mock, 's')).toMatch(
        /^chat\.reply\.foodDishPlainLead_\d /i,
      );
      expect(foodReply(food({ dish: 'tavuk', requireParking: true }), mock, 's')).toMatch(
        /^chat\.reply\.foodDishParkLead_\d /i,
      );
      expect(
        foodReply(
          food({ dish: 'tavuk', requireParking: true, freeOnly: true, freeParkCount: 1 }),
          mock,
          's',
        ),
      ).toMatch(/^chat\.reply\.foodDishFreeLead_\d /i);
      expect(foodReply(food({ dish: null }), mock, 's')).toMatch(/^chat\.reply\.foodLead_\d /i);
    });

    it('never claims free parking in a dish reply without a free car park', () => {
      for (const seed of SEEDS) {
        const text = foodReply(
          food({ dish: 'tavuk', requireParking: true, freeOnly: true, freeParkCount: 0 }),
          mock,
          seed,
        );
        expect(text).not.toContain('FreeLead');
        expect(text).not.toContain('hlFreePark');
      }
    });
  });

  it('carries the count, the place and the park count', () => {
    const text = foodReply(food(), mock, 's');
    expect(text).toContain('"where":"Alsancak"');
    expect(text).toContain('"count":12');
    expect(text).toContain('"withPark":8');
  });

  it('gives the same text for the same seed and varies with the seed', () => {
    for (const seed of SEEDS) {
      expect(foodReply(food(), tr, seed)).toBe(foodReply(food(), tr, seed));
    }
    const variants = new Set(
      SEEDS.map((s) => foodReply(food(), mock, s).split(' ')[0]!.toLowerCase()),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('keeps the dish sentence before the lead', () => {
    const text = foodReply(food({ dishPrefix: 'Adında "lahmacun" geçen 2 yer buldum. ' }), tr, 's');
    expect(text.startsWith('Adında "lahmacun"')).toBe(true);
  });

  describe('highlight', () => {
    it('has none when no fact is known', () => {
      const text = foodReply(food(), mock, 's');
      expect(text).not.toContain('chat.reply.hl');
    });

    it('walk: only when the first car park is 3 min away or less', () => {
      expect(foodReply(food({ nearestWalkMin: 3 }), mock, 's')).toContain(
        'chat.reply.hlWalk {"n":3}',
      );
      expect(foodReply(food({ nearestWalkMin: 1 }), mock, 's')).toContain('"n":1');
      expect(foodReply(food({ nearestWalkMin: 4 }), mock, 's')).not.toContain('hlWalk');
      expect(foodReply(food({ nearestWalkMin: null }), mock, 's')).not.toContain('hlWalk');
    });

    it('free parking: only when at least one shown card has a free car park', () => {
      expect(foodReply(food({ freeParkCount: 2 }), mock, 's')).toContain('chat.reply.hlFreePark');
      expect(foodReply(food({ freeParkCount: 0 }), mock, 's')).not.toContain('hlFreePark');
      expect(foodReply(food({ freeParkCount: null }), mock, 's')).not.toContain('hlFreePark');
    });

    it('walk comes before free parking, free parking before opening hours', () => {
      const all = {
        nearestWalkMin: 2,
        freeParkCount: 3,
        openNowCount: 4,
        knownHoursCount: 5,
        daypart: 'night' as const,
      };
      expect(foodReply(food(all), mock, 's')).toContain('hlWalk');
      expect(foodReply(food({ ...all, nearestWalkMin: 9 }), mock, 's')).toContain('hlFreePark');
      expect(foodReply(food({ ...all, nearestWalkMin: 9, freeParkCount: 0 }), mock, 's')).toContain(
        'hlOpen',
      );
    });

    it('open now: needs 3 known hours, an open place and an evening or night', () => {
      const base = { openNowCount: 2, knownHoursCount: 4 };
      expect(foodReply(food({ ...base, daypart: 'night' }), mock, 's')).toContain('hlOpen');
      expect(foodReply(food({ ...base, daypart: 'evening' }), mock, 's')).toContain('hlOpen');
      expect(foodReply(food({ ...base, daypart: 'noon' }), mock, 's')).not.toContain('hlOpen');
      expect(foodReply(food({ ...base, daypart: 'morning' }), mock, 's')).not.toContain('hlOpen');
      expect(
        foodReply(food({ ...base, knownHoursCount: 2, daypart: 'night' }), mock, 's'),
      ).not.toContain('hlOpen');
      expect(
        foodReply(food({ ...base, openNowCount: 0, daypart: 'night' }), mock, 's'),
      ).not.toContain('hlOpen');
      expect(
        foodReply(food({ openNowCount: null, knownHoursCount: null, daypart: 'night' }), mock, 's'),
      ).not.toContain('hlOpen');
      expect(foodReply(food({ ...base, daypart: null }), mock, 's')).not.toContain('hlOpen');
    });

    it('never shows a free-parking claim when no card has a free car park', () => {
      for (const freeParkCount of [0, null]) {
        for (const seed of SEEDS) {
          for (const over of [
            {},
            { requireParking: true },
            { requireParking: true, freeOnly: true },
            { nearestWalkMin: 2 },
          ]) {
            const text = foodReply(food({ ...over, freeParkCount }), mock, seed);
            expect(text).not.toContain('hlFreePark');
            expect(text).not.toContain('foodFreeLead');
          }
        }
      }
    });

    it('does not repeat the free-parking claim after a free-parking lead', () => {
      const text = foodReply(
        food({ requireParking: true, freeOnly: true, freeParkCount: 5 }),
        mock,
        's',
      );
      expect(text).toContain('foodFreeLead');
      expect(text).not.toContain('hlFreePark');
    });
  });
});

describe('parkReply', () => {
  it('reads cleanly in both languages', () => {
    const cases: Partial<ParkFacts>[] = [
      {},
      { nearestName: 'Kültürpark Otoparkı', nearestWalkMin: 4 },
      { nearestName: 'Kültürpark Otoparkı', nearestWalkMin: 4, nearestFree: 17, liveCount: 3 },
      { count: 1, nearestName: 'Tek Otopark', nearestWalkMin: 1, nearestFree: 1, liveCount: 1 },
    ];
    for (const over of cases) {
      for (const seed of SEEDS) {
        for (const t of [tr, en]) {
          const text = parkReply(park(over), t, seed);
          expect(text).not.toMatch(/undefined|NaN|{{|chat\./);
          expect(sentences(text)).toBeLessThanOrEqual(2);
          expect(text).toContain('Alsancak');
        }
      }
    }
  });

  it('carries the count and the place', () => {
    const text = parkReply(park(), mock, 's');
    expect(text).toMatch(/^chat\.reply\.parkLead_\d /i);
    expect(text).toContain('"count":6');
    expect(text).toContain('"where":"Alsancak"');
  });

  it('gives the same text for the same seed', () => {
    for (const seed of SEEDS) {
      expect(parkReply(park(), tr, seed)).toBe(parkReply(park(), tr, seed));
    }
    expect(
      new Set(SEEDS.map((s) => parkReply(park(), mock, s).split(' ')[0]!.toLowerCase())).size,
    ).toBeGreaterThan(1);
  });

  it('has no highlight without a nearest car park and its walk', () => {
    expect(parkReply(park(), mock, 's')).not.toContain('chat.reply.hl');
    expect(parkReply(park({ nearestName: 'X' }), mock, 's')).not.toContain('chat.reply.hl');
    expect(parkReply(park({ nearestWalkMin: 3 }), mock, 's')).not.toContain('chat.reply.hl');
  });

  it('names the nearest car park and the walk', () => {
    const text = parkReply(park({ nearestName: 'Kültürpark', nearestWalkMin: 4 }), mock, 's');
    expect(text).toContain('chat.reply.hlPark {"name":"Kültürpark","min":4}');
  });

  it('says live free spots only with fresh live data', () => {
    const base = { nearestName: 'Kültürpark', nearestWalkMin: 4 };
    // Not fresh: the caller passes no free count (visibleFree is null), and no car park is live.
    expect(parkReply(park({ ...base, nearestFree: null, liveCount: 0 }), mock, 's')).not.toContain(
      'hlParkLive',
    );
    expect(parkReply(park({ ...base, nearestFree: 9, liveCount: 0 }), mock, 's')).not.toContain(
      'hlParkLive',
    );
    expect(parkReply(park({ ...base, nearestFree: null, liveCount: 2 }), mock, 's')).not.toContain(
      'hlParkLive',
    );
    const live = parkReply(park({ ...base, nearestFree: 9, liveCount: 2 }), mock, 's');
    expect(live).toContain('hlParkLive');
    expect(live).toContain('"free":9');
  });
});

describe('foundNameReply', () => {
  it('has three wordings, stable per seed, with the name and the count', () => {
    for (const seed of SEEDS) {
      for (const t of [tr, en]) {
        for (const count of [1, 3]) {
          const text = foundNameReply('Bülent Börek', count, t, seed);
          expect(text).toContain('Bülent Börek');
          expect(text).not.toMatch(/undefined|NaN|{{|chat\./);
          expect(foundNameReply('Bülent Börek', count, t, seed)).toBe(text);
        }
      }
    }
    const keys = new Set(
      SEEDS.map((s) => foundNameReply('N', 2, mock, s).split(' ')[0]!.toLowerCase()),
    );
    expect(keys.size).toBeGreaterThan(1);
    expect([...keys].every((k) => /^chat\.foundname_[012]$/.test(k))).toBe(true);
  });
});

describe('daypartOf', () => {
  it('splits the Istanbul day', () => {
    expect(daypartOf(7 * 60)).toBe('morning');
    expect(daypartOf(12 * 60)).toBe('noon');
    expect(daypartOf(19 * 60)).toBe('evening');
    expect(daypartOf(23 * 60)).toBe('night');
    expect(daypartOf(2 * 60)).toBe('night');
  });
});

describe('capital letters', () => {
  it('capitalizes by the language: Turkish i becomes İ, English stays normal', () => {
    expect(capitalize('patates kızartması için 12 yer', 'tr')).toBe(
      'Patates kızartması için 12 yer',
    );
    expect(capitalize('izmir civarında 3 yer', 'tr')).toBe('İzmir civarında 3 yer');
    expect(capitalize('ılıca civarında 3 yer', 'tr')).toBe('Ilıca civarında 3 yer');
    expect(capitalize('izmir area', 'en')).toBe('Izmir area');
    expect(capitalize('', 'tr')).toBe('');
    expect(capitalize('12 yer', 'tr')).toBe('12 yer');
  });

  it('starts every reply with a capital, even when the place or dish is lowercase', () => {
    for (const seed of SEEDS) {
      for (const [t, lang] of [
        [tr, 'tr'],
        [en, 'en'],
      ] as const) {
        const texts = [
          foodReply(food({ where: 'izmir', dish: 'incir tatlısı' }), t, seed, lang),
          foodReply(food({ where: 'izmir', dish: 'incir tatlısı', withPark: 0 }), t, seed, lang),
          foodReply(
            food({ where: 'izmir', dish: 'incir tatlısı', requireParking: true }),
            t,
            seed,
            lang,
          ),
          foodReply(food({ where: 'izmir' }), t, seed, lang),
          parkReply(park({ where: 'izmir' }), t, seed, lang),
          foundNameReply('bülent börek', 2, t, seed, lang),
        ];
        for (const text of texts) {
          expect(text.charAt(0)).not.toMatch(/\p{Ll}/u);
        }
      }
    }
    // Turkish: a lowercase i at the start is İ, not I.
    const texts = SEEDS.map((s) => foodReply(food({ where: 'izmir' }), tr, s, 'tr'));
    expect(texts.some((x) => x.startsWith('İzmir'))).toBe(true);
    expect(texts.some((x) => x.startsWith('Izmir'))).toBe(false);
  });
});
