import '@/i18n';

import { answer, emptyContext, refine, type AssistantDeps } from '../assistant';
import { visibleFree } from '../freshness';
import { allRestaurants, matchesCategory } from '../restaurants';
import { fold } from '../search';
import { staticParkings } from '../staticParkings';
import type { Parking } from '../types';

const parkings = staticParkings();
const deps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings,
  t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k),
};

describe('assistant', () => {
  it('greets without cards', async () => {
    const r = await answer('selam', emptyContext('food'), deps);
    expect(r.reply.text.startsWith('chat.hello_')).toBe(true);
    expect(r.reply.cards).toEqual([]);
  });

  it('keeps context across follow-ups', async () => {
    const c1 = await answer('bornovadaki en iyi etçi', emptyContext('food'), deps);
    expect(c1.ctx.place?.label).toBe('Bornova');
    expect(c1.ctx.cat).toBe('meat');
    expect(c1.reply.cards.length).toBeGreaterThan(0);
    expect(c1.reply.cards.every((c) => c.kind === 'restaurant')).toBe(true);
    expect(c1.reply.text).toContain('chat.noRatings');

    const c2 = await answer('peki balık?', c1.ctx, deps);
    expect(c2.ctx.place?.label).toBe('Bornova');
    expect(c2.ctx.cat).toBe('fish');

    const c3 = await answer('otoparklı olsun', c2.ctx, deps);
    expect(c3.ctx.requireParking).toBe(true);
    expect(c3.ctx.cat).toBe('fish');
    expect(c3.ctx.place?.label).toBe('Bornova');
    expect(
      c3.reply.actions.some(
        (a) =>
          a.kind === 'refine' && (a.patch as { requireParking?: boolean }).requireParking === false,
      ),
    ).toBe(true);
  });

  it('puts the no-ratings note before the found text', async () => {
    const r = await answer('bornovadaki en iyi etçi', emptyContext('food'), deps);
    expect(r.reply.text.startsWith('chat.noRatings\n')).toBe(true);
  });

  it('treats an unknown dish as a dish, not a place', async () => {
    const hasSushi = allRestaurants().some(
      (r) =>
        fold(r.name).includes('sushi') ||
        r.cuisines.some((c) => fold(c.replace(/_/g, ' ')).includes('sushi')),
    );
    const r = await answer('yakınımda sushi', emptyContext('food'), deps);
    expect(r.reply.text.includes(hasSushi ? 'chat.dishNamed' : 'chat.dishNotFound')).toBe(true);
    expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(false);
  });

  it('shows the dish as typed in the not-found reply', async () => {
    const r = await answer('bana en yakın hünkar beğendi bul', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(false);
    if (r.reply.text.startsWith('chat.dishNotFound')) {
      expect(r.reply.text).toContain('Hünkar beğendi');
    }
  });

  it('still says place-not-found for an unknown word that could be a place', async () => {
    const r = await answer('xqzvu', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(true);
    expect(r.reply.text).toContain('"q":"xqzvu"');
  });

  it('keeps the place when the user says "burada"', async () => {
    const c = await answer('Konak', emptyContext('park'), deps);
    const r = await answer('burada yemek', c.ctx, deps);
    expect(r.ctx.place?.label).toBe(c.ctx.place?.label);
    expect(r.ctx.section).toBe('food');
  });

  it('treats a parking word with a place as a car-park search', async () => {
    const c = await answer('bornova balık', emptyContext('food'), deps);
    const r = await answer('Alsancak otopark', c.ctx, deps);
    expect(r.ctx.section).toBe('park');
    expect(r.ctx.requireParking).toBe(false);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.cards.every((x) => x.kind === 'parking')).toBe(true);
  });

  it('offers to widen when no restaurant has parking close by', async () => {
    const m = await answer('menderes pirzola otoparklı olsun', emptyContext('food'), deps);
    expect(m.reply.text.startsWith('chat.foodNoParking')).toBe(true);
    expect(
      m.reply.actions.some(
        (a) => a.kind === 'refine' && (a.patch as { parkM?: number }).parkM === 500,
      ),
    ).toBe(true);
    const dropped = await refine(m.ctx, { requireParking: false }, deps);
    expect(dropped.reply.cards.length).toBeGreaterThan(0);
  });

  it('lists car parks for a district in the park section', async () => {
    const r = await answer('Konak', emptyContext('park'), deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
    expect(r.reply.text.startsWith('chat.parkFound_')).toBe(true);
  });

  it('offers the map picker for unknown text', async () => {
    const r = await answer('asdfgh qwerty', emptyContext('park'), deps);
    const first = r.reply.actions[0];
    expect(first?.kind).toBe('open');
    expect(first?.kind === 'open' && first.pathname).toBe('/konum-sec');
  });

  it('switches to food near the user', async () => {
    const r = await answer('bana köfteci bul', emptyContext('park'), deps);
    expect(r.ctx.section).toBe('food');
    expect(r.ctx.place).toBeNull();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('never shows a free count the freshness rules hide', async () => {
    const r = await answer('Konak', emptyContext('park'), deps);
    for (const c of r.reply.cards) {
      if (c.kind !== 'parking') continue;
      const p = parkings.find((x) => x.id === c.id)!;
      expect(c.free).toBe(visibleFree(p));
    }
  });

  it('finds a restaurant by name', async () => {
    const r = await answer('Bülent Börek', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.foundName')).toBe(true);
    expect(r.reply.cards[0]?.name.startsWith('Bülent Börek')).toBe(true);
  });

  it('answers off-topic text with place examples', async () => {
    const r = await answer('galatasaray nasıl kazandı la öyle bugün', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.offTopic_')).toBe(true);
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.actions[0]?.label).toBe('chat.exStadium');
  });

  it('greets through address words', async () => {
    const r = await answer('selam dostum nasılsın', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.greet.fine_')).toBe(true);
  });

  it('flags an unknown or named dish', async () => {
    const r = await answer('mantıcı', emptyContext('food'), deps);
    expect(
      ['chat.dishUnknown', 'chat.dishNamed', 'chat.dishLikely'].some((k) =>
        r.reply.text.includes(k),
      ),
    ).toBe(true);
  });

  it('does not call a plain category word an unknown dish', async () => {
    const r = await answer('yakınımda kahve', emptyContext('food'), deps);
    expect(r.reply.text).not.toContain('chat.dishUnknown');
  });

  it('does not take a food word for a neighbourhood', async () => {
    const r = await answer('bana en yakın tavuk pilavcı bul', emptyContext('park'), deps);
    expect(r.ctx.place).toBeNull();
    expect(r.reply.text).not.toContain('Tavukçukuru');
  });

  describe('dish search', () => {
    const reasonOf = (c: { kind: string }) =>
      c.kind === 'restaurant' ? (c as { reason?: string }).reason : undefined;

    it('shows places that serve a lahmacun, not the whole fast-food category', async () => {
      const r = await answer('lahmacun yemek istiyorum', emptyContext('food'), deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) {
        expect(c.name).not.toMatch(/popeyes|burger king|mcdonald/i);
        expect(reasonOf(c)).toBeTruthy();
      }
      // Named places come before the likely ones.
      const reasons = r.reply.cards.map(reasonOf);
      const firstLikely = reasons.findIndex((x) => x?.startsWith('chat.reasonLikely'));
      if (firstLikely >= 0) {
        expect(reasons.slice(firstLikely).some((x) => x?.startsWith('chat.reasonNamed'))).toBe(
          false,
        );
      }
    });

    it('finds tavuk pilav places for "en yakın", nearest first, near me', async () => {
      const r = await answer('bana en yakın tavuk pilavcı bul', emptyContext('food'), deps);
      expect(r.reply.text.startsWith('chat.noRatings')).toBe(false);
      expect(r.ctx.place).toBeNull();
      expect(r.ctx.cat).toBe('lokanta');
      expect(r.ctx.sort).toBe('distance');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      // Distance order; an unverified (Overture) row counts 250 m farther, like the ranking does.
      const eff = r.reply.cards.map(
        (c) => c.distanceM + (c.kind === 'restaurant' && c.unverified ? 250 : 0),
      );
      expect(eff).toEqual([...eff].sort((a, b) => a - b));
    });

    it('also finds kebab houses filed under meat for a lahmacun', async () => {
      // Stand at a verified kebab house and ask nearest-first, so the 5 cards are not decided
      // by the park-ease order or the unverified-row penalty.
      const house = allRestaurants().find(
        (r) =>
          r.verified &&
          matchesCategory(r, 'meat') &&
          !matchesCategory(r, 'fast') &&
          /(^| )(kebap|ocakbasi)/.test(fold(r.name)),
      )!;
      expect(house).toBeDefined();
      const there: AssistantDeps = {
        ...deps,
        here: async () => ({ lat: house.lat, lng: house.lng }),
      };
      const r = await answer('en yakın lahmacun yemek istiyorum', emptyContext('food'), there);
      const card = r.reply.cards.find((c) => c.id === house.id);
      expect(card).toBeDefined();
      expect(reasonOf(card!)).toContain('chat.reasonLikely');
    });

    it('finds döner places filed under fast for an iskender', async () => {
      const r = await answer('canım iskender çekti', emptyContext('food'), deps);
      expect(r.ctx.cat).toBe('meat');
      expect(r.reply.text).not.toContain('chat.dishNotFound');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) expect(reasonOf(c)).toBeTruthy();
      const fastOnly = r.reply.cards.filter((c) => {
        const rest = allRestaurants().find((x) => x.id === c.id)!;
        return matchesCategory(rest, 'fast') && !matchesCategory(rest, 'meat');
      });
      expect(fastOnly.length).toBeGreaterThan(0);
    });

    it('lists only named or likely places for mantı', async () => {
      const r = await answer('mantı yemek istiyorum', emptyContext('food'), deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) expect(reasonOf(c)).toBeTruthy();
    });

    it('says honestly when no place fits the dish', async () => {
      const r = await answer('biryani yemek istiyorum', emptyContext('food'), deps);
      expect(r.reply.text).toContain('chat.dishUnknown');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) expect(reasonOf(c)).toBeUndefined();
    });

    it('widens the search when few places are near', async () => {
      const far: AssistantDeps = { ...deps, here: async () => ({ lat: 38.3, lng: 26.9 }) };
      const r = await answer('mantı yemek istiyorum', emptyContext('food'), far);
      expect(r.reply.text).toContain('chat.dishWider');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) expect(reasonOf(c)).toBeTruthy();
    });
  });

  describe('notCat', () => {
    it('drops places of the ruled-out category', async () => {
      const r = await answer('köfte değil balık', emptyContext('food'), deps);
      expect(r.ctx.cat).toBe('fish');
      expect(r.ctx.notCat).toBe('meat');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) {
        const rest = allRestaurants().find((x) => x.id === c.id)!;
        expect(matchesCategory(rest, 'meat')).toBe(false);
      }
      expect(r.reply.text).toContain('chat.except');
    });

    it('searches general food minus the category when no category is named', async () => {
      const r = await answer('bornovada balık olmasın', emptyContext('food'), deps);
      expect(r.ctx.cat).toBeNull();
      expect(r.ctx.notCat).toBe('fish');
      expect(r.ctx.section).toBe('food');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      for (const c of r.reply.cards) {
        const rest = allRestaurants().find((x) => x.id === c.id)!;
        expect(matchesCategory(rest, 'fish')).toBe(false);
      }
    });

    it('keeps notCat across a follow-up and drops it when a new category is named', async () => {
      const c1 = await answer('bornovada balık olmasın', emptyContext('food'), deps);
      const c2 = await answer('başka var mı', c1.ctx, deps);
      expect(c2.ctx.notCat).toBe('fish');
      const c3 = await answer('peki balık?', c2.ctx, deps);
      expect(c3.ctx.cat).toBe('fish');
      expect(c3.ctx.notCat).toBeNull();
    });
  });

  describe('follow-ups with a previous search', () => {
    const prior = () => answer('bornovadaki balıkçılar', emptyContext('food'), deps);

    it('"daha yakın" sorts the same search by distance and says so', async () => {
      const c1 = await prior();
      const r = await answer('daha yakın olsun', c1.ctx, deps);
      expect(r.ctx.sort).toBe('distance');
      expect(r.ctx.cat).toBe('fish');
      expect(r.ctx.place?.label).toBe('Bornova');
      expect(r.reply.text.startsWith('chat.nearest')).toBe(true);
      const d = r.reply.cards.map((c) => c.distanceM);
      expect(d.length).toBeGreaterThan(1);
      expect(d).toEqual([...d].sort((a, b) => a - b));
    });

    it('does nothing special for "daha yakın" without a previous search', async () => {
      const r = await answer('daha yakın', emptyContext('food'), deps);
      expect(r.ctx.sort).toBe('parkEase');
    });

    it('"otopark ücretsiz" keeps only places whose nearest car park is free', async () => {
      const c1 = await prior();
      const first = allRestaurants().find((x) => x.id === c1.reply.cards[0]!.id)!;
      const free: Parking = {
        id: 'free-1',
        name: 'Free',
        lat: first.lat,
        lng: first.lng,
        capacity: 50,
        free: null,
        isIndoor: null,
        isOpen: true,
        isPaid: false,
        nonstop: null,
        openingHours: null,
        address: null,
        source: 'izmir-open-data',
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
        occupancyKind: 'estimated',
      };
      const withFree: AssistantDeps = { ...deps, parkings: [...parkings, free] };
      const r = await answer('otoparkı ücretsiz olsun', c1.ctx, withFree);
      expect(r.ctx.requireParking).toBe(true);
      expect(r.ctx.freeParking).toBe(true);
      expect(r.ctx.cat).toBe('fish');
      expect(r.reply.text.startsWith('chat.foodFoundFree')).toBe(true);
      expect(r.reply.cards.map((c) => c.id)).toContain(first.id);
      for (const c of r.reply.cards) {
        const rest = allRestaurants().find((x) => x.id === c.id)!;
        const near = withFree.parkings
          .map((p) => ({ p, d: Math.hypot(p.lat - rest.lat, p.lng - rest.lng) }))
          .sort((a, b) => a.d - b.d)[0]!;
        expect(near.p.isPaid).toBe(false);
      }
    });

    it('says so and offers to drop the condition when no free car park is near', async () => {
      const c1 = await prior();
      const allPaid: AssistantDeps = {
        ...deps,
        parkings: parkings.map((p) => ({ ...p, isPaid: true })),
      };
      const r = await answer('ücretsiz otopark', c1.ctx, allPaid);
      expect(r.reply.cards).toEqual([]);
      expect(r.reply.text.startsWith('chat.foodNoFreePark')).toBe(true);
      expect(
        r.reply.actions.some(
          (a) =>
            a.kind === 'refine' && (a.patch as { freeParking?: boolean }).freeParking === false,
        ),
      ).toBe(true);
    });

    it('"bir de X\'de bak" keeps the search and changes the place', async () => {
      const c1 = await answer('bornovada balık otoparklı', emptyContext('food'), deps);
      expect(c1.ctx.requireParking).toBe(true);
      const r = await answer("bir de Karşıyaka'da bak", c1.ctx, deps);
      expect(r.ctx.place?.label).toBe('Karşıyaka');
      expect(r.ctx.cat).toBe('fish');
      expect(r.ctx.requireParking).toBe(true);
      expect(r.ctx.section).toBe('food');
    });

    it('"X\'de de" keeps the search and changes the place', async () => {
      const c1 = await prior();
      const r = await answer("Konak'ta da", c1.ctx, deps);
      expect(r.ctx.place?.label).toBe('Konak');
      expect(r.ctx.cat).toBe('fish');
      expect(r.reply.cards.every((c) => c.kind === 'restaurant')).toBe(true);
    });

    it('"başka var mı" widens the same search', async () => {
      const c1 = await prior();
      expect(c1.ctx.wide).toBe(false);
      const r = await answer('başka var mı', c1.ctx, deps);
      expect(r.ctx.wide).toBe(true);
      expect(r.ctx.cat).toBe('fish');
      expect(r.ctx.place?.label).toBe('Bornova');
      expect(r.reply.text.startsWith('chat.wideNow')).toBe(true);
      const again = await answer('başka', r.ctx, deps);
      expect(again.reply.text.startsWith('chat.wideAlready')).toBe(true);
    });
  });

  describe('with the AI layer', () => {
    type Ai = NonNullable<AssistantDeps['ai']>;
    const aiDeps = (ai: Partial<Ai>): AssistantDeps => ({
      ...deps,
      ai: {
        understand: async () => ({ ok: false, reason: 'error' }),
        quotaNotice: () => false,
        ...ai,
      },
    });

    it('answers off-topic text with the AI reply', async () => {
      const r = await answer(
        'galatasaray nasıl kazandı',
        emptyContext('park'),
        aiDeps({
          understand: async () => ({
            ok: true,
            value: { kind: 'offtopic', reply: 'Maçı izleyemedim 😄' },
            remaining: 4,
          }),
        }),
      );
      expect(r.reply.text).toBe('Maçı izleyemedim 😄');
      expect(r.reply.sparkle).toBe(true);
    });

    it('shows the quota notice only once', async () => {
      const notices = [true, false];
      const d = aiDeps({
        understand: async () => ({ ok: false, reason: 'quota' }),
        quotaNotice: () => notices.shift() ?? false,
      });
      const first = await answer('galatasaray nasıl kazandı', emptyContext('park'), d);
      expect(first.reply.text.startsWith('chat.offTopic_')).toBe(true);
      expect(first.reply.notice).toBe('chat.sparkleOut');
      const second = await answer('galatasaray nasıl kazandı', emptyContext('park'), d);
      expect(second.reply.notice).toBeUndefined();
    });

    it('notes the last ✨ on an off-topic AI reply', async () => {
      const r = await answer(
        'galatasaray nasıl kazandı',
        emptyContext('park'),
        aiDeps({
          understand: async () => ({
            ok: true,
            value: { kind: 'offtopic', reply: 'Maçı izleyemedim 😄' },
            remaining: 0,
          }),
          quotaNotice: () => true,
        }),
      );
      expect(r.reply.text).toBe('Maçı izleyemedim 😄');
      expect(r.reply.notice).toBe('chat.sparkleLast');
    });

    it('asks the AI about leftover unknown words and merges its answer', async () => {
      let calls = 0;
      const r = await answer(
        'akşam romantik bir yer',
        emptyContext('park'),
        aiDeps({
          understand: async () => {
            calls++;
            return {
              ok: true,
              value: {
                kind: 'search',
                district: 'Alsancak',
                cat: 'fish',
                dish: null,
                place: 'Alsancak',
                food: true,
                requireParking: false,
                appleQuery: null,
                nearMe: false,
                dishServes: null,
              },
              remaining: 4,
            };
          },
        }),
      );
      expect(calls).toBe(1);
      expect(r.ctx.cat).toBe('fish');
      expect(r.ctx.section).toBe('food');
      expect(r.reply.cards.length).toBeGreaterThan(0);
    });

    it('keeps the rule-found district and category when the AI disagrees', async () => {
      const r = await answer(
        'bornovada romantik köfteci',
        emptyContext('food'),
        aiDeps({
          understand: async () => ({
            ok: true,
            value: {
              kind: 'search',
              district: 'Konak',
              cat: 'fish',
              dish: null,
              place: null,
              food: true,
              requireParking: true,
              appleQuery: null,
              nearMe: false,
              dishServes: null,
            },
            remaining: 4,
          }),
        }),
      );
      expect(r.ctx.place?.label).toBe('Bornova');
      expect(r.ctx.cat).toBe('meat');
      expect(r.ctx.requireParking).toBe(true);
    });

    it('does not call the AI when the rules understood everything', async () => {
      const boom = async () => {
        throw new Error('ai must not be called');
      };
      const r = await answer(
        'bornovada köfteci',
        emptyContext('food'),
        aiDeps({ understand: boom }),
      );
      expect(r.ctx.cat).toBe('meat');
      expect(r.reply.cards.length).toBeGreaterThan(0);
    });

    it('does not call the AI for a follow-up a rule handled', async () => {
      const boom = async () => {
        throw new Error('ai must not be called');
      };
      const c1 = await answer('bornovadaki balıkçılar', emptyContext('food'), deps);
      const d = aiDeps({ understand: boom });
      const r = await answer('daha yakın', c1.ctx, d);
      expect(r.ctx.sort).toBe('distance');
      const r2 = await answer('başka var mı', c1.ctx, d);
      expect(r2.ctx.wide).toBe(true);
    });

    it('never calls the AI for a greeting', async () => {
      const boom = async () => {
        throw new Error('ai must not be called');
      };
      const r = await answer('selam', emptyContext('food'), aiDeps({ understand: boom }));
      expect(r.reply.text.startsWith('chat.hello_')).toBe(true);
    });

    it('searches an unknown dish through the names the AI says serve it', async () => {
      const search = (dishServes: string[], dish = 'çiğ börek') =>
        aiDeps({
          understand: async () => ({
            ok: true,
            value: {
              kind: 'search',
              district: null,
              cat: 'breakfast',
              dish,
              place: null,
              food: true,
              requireParking: false,
              appleQuery: null,
              nearMe: true,
              dishServes,
            },
            remaining: 4,
          }),
        });
      const r = await answer(
        'zırtapoz',
        emptyContext('food'),
        search(['çiğ börekçi', 'börekçi', 'restoran', 'lokanta']),
      );
      expect(r.ctx.dish).toBe('çiğ börek');
      expect(r.ctx.dishServes).toEqual(['çiğ börekçi', 'börekçi', 'restoran', 'lokanta']);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      const cards = r.reply.cards.filter((c) => c.kind === 'restaurant');
      expect(cards.every((c) => c.reason !== undefined)).toBe(true);
      expect(r.reply.text.startsWith('chat.dishWider') || r.reply.text.includes('chat.dish')).toBe(
        true,
      );

      // Tier 2: no name carries the dish, but names with "börekçi" very likely serve it.
      const tier2 = await answer(
        'zırtapoz',
        emptyContext('food'),
        search(['börekçi'], 'zırtapozlu börek'),
      );
      expect(tier2.reply.text).toContain('chat.dishLikely');
      expect(tier2.reply.cards.length).toBeGreaterThan(0);
      for (const c of tier2.reply.cards) {
        expect(fold(c.name)).toContain('borekci');
        expect(c.kind === 'restaurant' && c.reason).toContain('chat.reasonLikely');
      }

      // Generic words alone give no ad-hoc profile: only tier 1 (names with both words) remain.
      const generic = await answer(
        'zırtapoz',
        emptyContext('food'),
        search(['restoran', 'lokanta', 'yemek', 'mutfak', 'cafe'], 'zırtapozlu börek'),
      );
      for (const c of generic.reply.cards) {
        if (c.kind === 'restaurant' && c.reason) expect(c.reason).toContain('chat.reasonNamed');
      }
      expect(generic.reply.text).not.toContain('chat.dishLikely');
    });

    it('maps nearMe from the AI to the current location', async () => {
      const c1 = await answer('Konak', emptyContext('park'), deps);
      const r = await answer(
        'zırtapoz buralarda',
        c1.ctx,
        aiDeps({
          understand: async () => ({
            ok: true,
            value: {
              kind: 'search',
              district: null,
              cat: 'fish',
              dish: null,
              place: null,
              food: true,
              requireParking: false,
              appleQuery: null,
              nearMe: true,
              dishServes: null,
            },
            remaining: 4,
          }),
        }),
      );
      expect(r.ctx.place).toBeNull();
    });
  });

  describe('rule fallback for unknown words', () => {
    it('treats a word that starts restaurant names as a dish', async () => {
      const has = allRestaurants().some((r) => fold(r.name).startsWith('pisi'));
      const r = await answer('pişi', emptyContext('food'), deps);
      if (has) {
        expect(r.ctx.dish).toBe('pişi');
        expect(r.reply.cards.length).toBeGreaterThan(0);
        expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(false);
      } else {
        expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(false);
      }
    });

    it('does not treat "pişiricisi" names as "pişi"', async () => {
      const r = await answer('pişi', emptyContext('food'), deps);
      expect(r.ctx.dish).toBe('pişi');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      // Pişi is a known dish now: kahvaltı salonu names may follow as "likely" places.
      const named = r.reply.cards.map((c) => fold(c.name).split(' '));
      expect(named.some((words) => words.includes('pisi'))).toBe(true);
      for (const words of named) expect(words).not.toContain('pisiricisi');
    });

    it('still matches seller-suffixed names ("kumru" / "kumrucu" -> "Kumrucu Hüseyin")', async () => {
      for (const q of ['kumru', 'kumrucu']) {
        const r = await answer(q, emptyContext('food'), deps);
        expect(r.reply.cards.map((c) => c.name)).toContain('Kumrucu Hüseyin');
      }
    });

    it('asks whether an invented word is a dish or a place', async () => {
      const r = await answer('zırtapoz', emptyContext('food'), deps);
      expect(r.reply.text.startsWith('chat.dishOrPlace')).toBe(true);
      expect(r.reply.text).toContain('zırtapoz');
      const act = r.reply.actions.find((a) => a.kind === 'refine');
      expect(act).toMatchObject({
        label: 'chat.actAsDish',
        patch: { section: 'food', dish: 'zırtapoz', place: null },
      });
      expect(r.reply.actions.some((a) => a.kind === 'open')).toBe(true);
    });

    it('keeps place-not-found for clear place words', async () => {
      const r = await answer('zırtapoz mahallesi', emptyContext('food'), deps);
      expect(r.reply.text.startsWith('chat.dishOrPlace')).toBe(false);
    });
  });
});

describe('assistant: chat bugs from the phone', () => {
  const sections = ['park', 'food'] as const;

  describe.each(sections)('section %s', (section) => {
    it('finds kuşbaşı as a dish, with reasons', async () => {
      const r = await answer('kuşbaşı', emptyContext(section), deps);
      expect(r.reply.text).toContain('chat.dishLikely');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(r.reply.cards.every((c) => c.kind === 'restaurant' && !!c.reason)).toBe(true);
      expect(r.ctx.section).toBe('food');
      expect(r.ctx.cat).toBe('meat');
    });

    it('finds kuşbaşı around a named place', async () => {
      const r = await answer('kemeraltında kuşbaşı', emptyContext(section), deps);
      expect(r.reply.text.startsWith('chat.placeNotFound')).toBe(false);
      expect(r.ctx.place?.label).toBe('Kemeraltı');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(r.reply.cards.every((c) => c.kind === 'restaurant' && !!c.reason)).toBe(true);
    });

    it('reads "X derken yemekten kast etmiştim" as a search for X', async () => {
      const plain = await answer('kuşbaşı', emptyContext(section), deps);
      const r = await answer('Kuşbaşı derken yemekten kast etmiştim', emptyContext(section), deps);
      expect(r.ctx.dish).toBe('kuşbaşı');
      expect(r.ctx.cat).toBe('meat');
      expect(r.reply.cards.map((c) => c.name)).toEqual(plain.reply.cards.map((c) => c.name));
      expect(r.reply.text).not.toContain('NotFound');
    });

    it.each(['Selamin aleykum', 'selamün aleyküm'])('greets back "%s"', async (q) => {
      const r = await answer(q, emptyContext(section), deps);
      expect(r.reply.text.startsWith('chat.greet.salam_')).toBe(true);
      expect(r.reply.cards).toEqual([]);
    });

    it.each(['Oo', 'aa', 'xd', 'hmm'])(
      'answers "%s" with the guide, no search, no AI',
      async (q) => {
        const understand = jest.fn(async () => ({ ok: false as const, reason: 'error' as const }));
        const r = await answer(q, emptyContext(section), {
          ...deps,
          ai: { understand, quotaNotice: () => false },
        });
        expect(r.reply.text.startsWith('chat.unknown_')).toBe(true);
        expect(r.reply.cards).toEqual([]);
        expect(r.ctx).toEqual(emptyContext(section));
        expect(understand).not.toHaveBeenCalled();
      },
    );
  });

  it('never calls the AI for a greeting', async () => {
    const understand = jest.fn(async () => ({ ok: false as const, reason: 'error' as const }));
    const r = await answer('selamın aleyküm', emptyContext('park'), {
      ...deps,
      ai: {
        understand,
        quotaNotice: () => false,
      },
    });
    expect(r.reply.text.startsWith('chat.greet.salam_')).toBe(true);
    expect(understand).not.toHaveBeenCalled();
  });

  it('asks dish-or-place in the park section for a text that is not place-like', async () => {
    const r = await answer('nasıl zırtapoz', emptyContext('park'), deps);
    expect(r.reply.text.startsWith('chat.dishOrPlace')).toBe(true);
    const short = await answer('xqzvu', emptyContext('park'), deps);
    expect(short.reply.text.startsWith('chat.placeNotFound')).toBe(true);
  });

  it('routes an AI dish to the food search even in the park section', async () => {
    const r = await answer('bi şey yesem', emptyContext('park'), {
      ...deps,
      ai: {
        understand: async () => ({
          ok: true,
          remaining: 3,
          value: {
            kind: 'search',
            district: null,
            cat: null,
            dish: 'kuşbaşı',
            place: null,
            food: false,
            requireParking: false,
            appleQuery: null,
            nearMe: false,
            dishServes: null,
          },
        }),
        quotaNotice: () => false,
      },
    });
    expect(r.ctx.section).toBe('food');
    expect(r.reply.cards.every((c) => c.kind === 'restaurant')).toBe(true);
  });
});

describe('a district plus a word that is no dish, name or place', () => {
  type Ai = NonNullable<AssistantDeps['ai']>;
  const withAi = (ai: Partial<Ai>): AssistantDeps => ({
    ...deps,
    ai: {
      understand: async () => ({ ok: false, reason: 'error' }),
      quotaNotice: () => false,
      ...ai,
    },
  });
  const search = (over: Record<string, unknown>) =>
    ({
      ok: true,
      remaining: 4,
      value: {
        kind: 'search',
        district: null,
        cat: null,
        dish: null,
        place: null,
        food: false,
        requireParking: false,
        appleQuery: null,
        nearMe: false,
        dishServes: null,
        ...over,
      },
    }) as const;

  it.each([
    ['food', "Bornova'da zortlama", "Bornova'da", 'zortlama'],
    ['park', "Bornova'da zortlama", "Bornova'da", 'zortlama'],
    ['food', "Karşıyaka'da hışhış", "Karşıyaka'da", 'hışhış'],
    ['food', "Konak'ta zortlama", "Konak'ta", 'zortlama'],
    ['food', "Çiğli'de zortlama", "Çiğli'de", 'zortlama'],
  ] as const)('says so, with no cards, for "%s" chat: %s', async (section, q, inD, word) => {
    const r = await answer(q, emptyContext(section), deps);
    expect(r.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(r.reply.text).toContain(JSON.stringify(inD).slice(1, -1));
    expect(r.reply.text).toContain(`"q":"${word}"`);
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.text).not.toContain('chat.foodFound');
    expect(r.ctx).toEqual(emptyContext(section));
    // Two ways on: look for it as a dish, or the district's restaurants.
    expect(r.reply.actions.map((a) => a.label.split(' ')[0])).toEqual([
      'chat.actAsDish',
      'chat.actDistrictFood',
    ]);
  });

  it('offers "as a dish": the district restaurants with the honest dish-unknown text', async () => {
    const r = await answer("Bornova'da zortlama", emptyContext('food'), deps);
    const [asDish, plainFood] = r.reply.actions;
    expect(asDish).toMatchObject({ kind: 'refine' });
    const dish = await refine(r.ctx, (asDish as { patch: Partial<typeof r.ctx> }).patch, deps);
    expect(dish.ctx).toMatchObject({ section: 'food', cat: null, dish: 'zortlama' });
    expect(dish.ctx.place?.label).toBe('Bornova');
    expect(dish.reply.text).toContain('chat.dishUnknown');
    expect(dish.reply.cards.length).toBeGreaterThan(0);
    expect(plainFood).toMatchObject({ kind: 'refine' });
    expect(JSON.stringify(plainFood)).toContain("Bornova'daki");
    const food = await refine(r.ctx, (plainFood as { patch: Partial<typeof r.ctx> }).patch, deps);
    expect(food.ctx).toMatchObject({ section: 'food', cat: null, dish: null });
    expect(food.ctx.place?.label).toBe('Bornova');
    expect(food.reply.text).toContain('chat.foodFound');
    expect(food.reply.cards.length).toBeGreaterThan(0);
  });

  it('offers the map instead of "as a dish" for a street-like word', async () => {
    const r = await answer("Bornova'da Zeybek Sokak", emptyContext('food'), deps);
    expect(r.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.actions[0]).toMatchObject({ kind: 'open', pathname: '/konum-sec' });
  });

  it('keeps the known readings: a dish, a category, a restaurant name, a place', async () => {
    const dish = await answer("Bornova'da kebap", emptyContext('food'), deps);
    expect(dish.reply.text).not.toContain('chat.districtUnknownThing');
    expect(dish.reply.cards.length).toBeGreaterThan(0);
    const sushi = await answer("Bornova'da sushi", emptyContext('food'), deps);
    expect(sushi.reply.text).not.toContain('chat.districtUnknownThing');
    expect(sushi.reply.cards.length).toBeGreaterThan(0);
    // A dish that is new to the dictionary is a dish now, not an unknown word.
    for (const q of ["Bornova'da kibbe", "Bornova'da sirken", "Bornova'da şinitzel"]) {
      const r = await answer(q, emptyContext('food'), deps);
      expect(r.reply.text).not.toContain('chat.districtUnknownThing');
      expect(r.reply.cards.length).toBeGreaterThan(0);
    }
    // One place's full name stays a place (the mall): the district is not searched on its own.
    const mall = await answer("Bornova'da Forum", emptyContext('food'), deps);
    expect(mall.ctx.place?.label).toBe('Forum Bornova');
    expect(mall.reply.cards.length).toBeGreaterThan(0);
  });

  it('shows the restaurants named after the word, in or near the district', async () => {
    for (const [q, name] of [
      ["Bornova'da Mado", 'mado'],
      ["Bornova'da Özsüt", 'ozsut'],
      ["Bornova'da Sakura", 'sakura'],
    ] as const) {
      const r = await answer(q, emptyContext('food'), deps);
      expect(r.reply.text).not.toContain('chat.districtUnknownThing');
      expect(r.reply.text).toContain('chat.dishNamed');
      expect(r.ctx.place?.label).toBe('Bornova');
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(fold(r.reply.cards[0]!.name)).toContain(name);
    }
  });

  it.each([
    'romantik',
    'ucuz',
    'ne yenir',
    'güzel bir yer',
    'en iyi',
    'yemek',
    'bir yer',
    'akşam yemeği',
    'öğle yemeği',
    'aile',
    'manzaralı',
    'açık',
  ])(
    'answers the qualifier request "Bornova\'da %s" with the district food, not "not found"',
    async (w) => {
      for (const section of ['food', 'park'] as const) {
        const r = await answer(`Bornova'da ${w}`, emptyContext(section), deps);
        expect(r.reply.text).not.toContain('chat.districtUnknownThing');
        expect(r.reply.cards.length).toBeGreaterThan(0);
      }
      // With the AI layer on and unable to help, still the district answer.
      const understand = jest.fn(async () => ({ ok: false as const, reason: 'error' as const }));
      const ai = await answer(`Bornova'da ${w}`, emptyContext('food'), withAi({ understand }));
      expect(ai.reply.text).not.toContain('chat.districtUnknownThing');
      expect(ai.reply.cards.length).toBeGreaterThan(0);
    },
  );

  it('keeps a real unknown word next to a qualifier unknown', async () => {
    const r = await answer("Bornova'da romantik zortlama", emptyContext('food'), deps);
    expect(r.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(r.reply.text).toContain('"q":"zortlama"');
  });

  it('prefers a known place whose full name is the words over a partial restaurant name', async () => {
    const uni = await answer("Bornova'da Ege Üniversitesi", emptyContext('food'), deps);
    expect(uni.ctx.place?.label).toBe('Ege Üniversitesi');
    expect(uni.reply.text).not.toContain('chat.dishNamed');
    expect(uni.reply.cards.length).toBeGreaterThan(0);
    // An exact restaurant name still wins.
    const mado = await answer("Bornova'da Mado", emptyContext('food'), deps);
    expect(mado.ctx.place?.label).toBe('Bornova');
    expect(mado.reply.text).toContain('chat.dishNamed');
    expect(fold(mado.reply.cards[0]!.name)).toBe('mado');
  });

  it('searches around a known place near the district', async () => {
    const r = await answer("Bornova'da Erzene", emptyContext('food'), deps);
    expect(r.reply.text).not.toContain('chat.districtUnknownThing');
    expect(r.ctx.place?.label).toBe('Erzene');
    expect(r.reply.cards.length).toBeGreaterThan(0);
    const park = await answer("Bornova'da Erzene", emptyContext('park'), deps);
    expect(park.ctx.place?.label).toBe('Erzene');
  });

  it('asks the AI first when it is available, and uses its answer', async () => {
    const understand = jest.fn(async () =>
      search({ cat: 'lokanta', dish: 'zortlama', dishServes: ['lokanta'], food: true }),
    );
    const r = await answer("Bornova'da zortlama", emptyContext('food'), withAi({ understand }));
    expect(understand).toHaveBeenCalledTimes(1);
    expect(r.reply.text).not.toContain('chat.districtUnknownThing');
    expect(r.ctx.place?.label).toBe('Bornova');
    expect(r.ctx.dish).toBe('zortlama');
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('falls back to the honest reply when the AI cannot place the word either', async () => {
    const nothing = jest.fn(async () => search({}));
    const a = await answer(
      "Bornova'da zortlama",
      emptyContext('food'),
      withAi({ understand: nothing }),
    );
    expect(nothing).toHaveBeenCalledTimes(1);
    expect(a.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(a.reply.cards).toEqual([]);

    const failing = jest.fn(async () => ({ ok: false as const, reason: 'error' as const }));
    const b = await answer(
      "Bornova'da zortlama",
      emptyContext('food'),
      withAi({ understand: failing }),
    );
    expect(failing).toHaveBeenCalledTimes(1);
    expect(b.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(b.reply.cards).toEqual([]);
  });

  it('says so too, with the out-of-quota notice, when the daily AI uses are gone', async () => {
    const r = await answer(
      "Bornova'da zortlama",
      emptyContext('food'),
      withAi({
        understand: async () => ({ ok: false, reason: 'quota' }),
        quotaNotice: () => true,
      }),
    );
    expect(r.reply.text.startsWith('chat.districtUnknownThing')).toBe(true);
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.notice).toBe('chat.sparkleOut');
  });

  it('does not spend an AI use on a word that names a restaurant or a place', async () => {
    const boom = async () => {
      throw new Error('ai must not be called');
    };
    const mado = await answer(
      "Bornova'da Mado",
      emptyContext('food'),
      withAi({ understand: boom }),
    );
    expect(mado.reply.text).toContain('chat.dishNamed');
    const erzene = await answer(
      "Bornova'da Erzene",
      emptyContext('food'),
      withAi({ understand: boom }),
    );
    expect(erzene.ctx.place?.label).toBe('Erzene');
  });
});
