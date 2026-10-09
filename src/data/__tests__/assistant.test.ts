import '@/i18n';

import { answer, emptyContext, refine, type AssistantDeps } from '../assistant';
import { visibleFree } from '../freshness';
import { staticParkings } from '../staticParkings';

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
          a.kind === 'refine' &&
          (a.patch as { requireParking?: boolean }).requireParking === false,
      ),
    ).toBe(true);
  });

  it('puts the no-ratings note before the found text', async () => {
    const r = await answer('bornovadaki en iyi etçi', emptyContext('food'), deps);
    expect(r.reply.text.startsWith('chat.noRatings\n')).toBe(true);
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
    expect(r.reply.text.startsWith('chat.hello_')).toBe(true);
  });

  it('flags an unknown or named dish', async () => {
    const r = await answer('mantıcı', emptyContext('food'), deps);
    expect(
      r.reply.text.includes('chat.dishUnknown') || r.reply.text.includes('chat.dishNamed'),
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

  describe('with the AI layer', () => {
    type Ai = NonNullable<AssistantDeps['ai']>;
    const aiDeps = (ai: Partial<Ai>): AssistantDeps => ({
      ...deps,
      ai: {
        understand: async () => ({ ok: false, reason: 'error' }),
        narrate: async () => ({ ok: false, reason: 'error' }),
        quotaNotice: () => false,
        ...ai,
      },
    });

    it('narrates a grounded reply with real names', async () => {
      const plainRes = await answer('bornovadaki balıkçılar', emptyContext('food'), deps);
      const first = plainRes.reply.cards[0]!;
      const r = await answer(
        'bornovadaki balıkçılar',
        emptyContext('food'),
        aiDeps({ narrate: async () => ({ ok: true, value: 'Tabi hocam! {1} burada.', remaining: 4 }) }),
      );
      expect(r.reply.sparkle).toBe(true);
      expect(r.reply.text).toContain(first.name);
      expect(r.reply.text).not.toContain('{1}');
    });

    it('keeps the template when the narration is not grounded', async () => {
      const r = await answer(
        'bornovadaki balıkçılar',
        emptyContext('food'),
        aiDeps({ narrate: async () => ({ ok: true, value: 'Puanı 4.8!', remaining: 4 }) }),
      );
      expect(r.reply.text).toContain('chat.foodFound_');
      expect(r.reply.sparkle).toBeFalsy();
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

    it('never calls the AI for a greeting', async () => {
      const boom = async () => {
        throw new Error('ai must not be called');
      };
      const r = await answer(
        'selam',
        emptyContext('food'),
        aiDeps({ understand: boom, narrate: boom }),
      );
      expect(r.reply.text.startsWith('chat.hello_')).toBe(true);
    });
  });
});
