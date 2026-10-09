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
});
