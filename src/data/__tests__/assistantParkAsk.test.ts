// Parking is offered after the user picks a restaurant ("Yol tarifi" on a food card), not with every
// food result. Without a parking ask the food answers are about food; with one (a parking word, the
// "Sadece otoparklı" chip, a plan) everything stays as it was. Real Turkish strings.
import '@/i18n';
import i18n from 'i18next';

import { cardModel } from '@/components/chat/model';
import { ruleQuery } from '@/components/chat/ruleQuery';
import tr from '@/i18n/tr';

import {
  answer,
  askParking,
  emptyContext,
  refine,
  type AssistantDeps,
  type ChatCard,
  type ChatContext,
} from '../assistant';
import { distanceMeters } from '../geo';
import { getRestaurant } from '../restaurants';
import { staticParkings } from '../staticParkings';

/* eslint-disable import/no-named-as-default-member */
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;
const deps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings: staticParkings(),
  t,
};

type Food = Extract<ChatCard, { kind: 'restaurant' }>;
const foods = (cards: ChatCard[]): Food[] =>
  cards.filter((c): c is Food => c.kind === 'restaurant');

const PARKING_WORDS = /otopark|park/i;

/** A food answer, then "Yol tarifi" on its first card: Yerim's question. */
async function asked(text = 'Bornova köfteci') {
  const list = await answer(text, emptyContext('food'), deps);
  const card = foods(list.reply.cards)[0]!;
  return { list, card, question: askParking(card, list.ctx, deps) };
}

describe('a food answer without a parking ask is about food', () => {
  it.each(['Bornova köfteci', 'Alsancak balık', 'yakınımda kahvaltı', 'Karşıyaka lahmacun'])(
    '"%s": no parking words in the text, no parking line on the cards',
    async (text) => {
      const r = await answer(text, emptyContext('food'), deps);
      expect(foods(r.reply.cards).length).toBeGreaterThan(0);
      expect(r.reply.text).not.toMatch(PARKING_WORDS);
      for (const [i, card] of r.reply.cards.entries()) {
        expect((card as Food).parkAsked).toBeUndefined();
        const m = cardModel(card, i, r.ctx.sort, t);
        expect(m.pill).toBeNull();
        expect(m.pillMark).toBe(false);
        expect(m.label).not.toMatch(PARKING_WORDS);
      }
    },
  );

  it('keeps the chip that is the way to ask for parking', async () => {
    const r = await answer('Bornova köfteci', emptyContext('food'), deps);
    expect(r.reply.actions.map((a) => a.label)).toContain(tr.chat.actOnlyParking);
  });

  it('leaves parking out of the honest notes too', async () => {
    const r = await answer('Bornova en iyi köfteci', emptyContext('food'), deps);
    expect(r.reply.text).toContain(tr.chat.noRatingsPlain);
    expect(r.reply.text).not.toMatch(PARKING_WORDS);
    const price = await answer("Bornova'da romantik bir yer", emptyContext('food'), deps);
    expect(price.reply.text).toContain('bilgimiz yok');
    expect(price.reply.text).not.toMatch(PARKING_WORDS);
  });
});

describe('a food answer that asked for parking keeps the parking', () => {
  it.each(['Bornova otoparklı köfteci', 'Bornova ücretsiz otoparklı köfteci'])(
    '"%s": parking in the text and on the cards',
    async (text) => {
      const r = await answer(text, emptyContext('food'), deps);
      const cards = foods(r.reply.cards);
      expect(r.ctx.requireParking).toBe(true);
      expect(cards.length).toBeGreaterThan(0);
      expect(r.reply.text).toMatch(/otopark/i);
      for (const c of cards) expect(c.parkAsked).toBe(true);
      const m = cardModel(cards[0]!, 0, r.ctx.sort, t);
      expect(m.pill).not.toBeNull();
    },
  );

  it('the "Sadece otoparklı" chip brings the parking back', async () => {
    const list = await answer('Bornova köfteci', emptyContext('food'), deps);
    const chip = list.reply.actions.find((a) => a.label === tr.chat.actOnlyParking);
    if (chip?.kind !== 'refine') throw new Error('no chip');
    const r = await refine(list.ctx, chip.patch, deps);
    expect(r.reply.text).toMatch(/otopark/i);
    for (const c of foods(r.reply.cards)) expect(c.parkAsked).toBe(true);
  });
});

describe('"Yol tarifi" on a food card without a parking ask', () => {
  it('asks first: the question names the restaurant, two chips, nothing is opened', async () => {
    const { card, question } = await asked();
    expect(question.reply.text).toBe(
      `Arabayla mı gidiyorsun? ${card.name} yakınındaki otoparkları göstereyim mi?`,
    );
    expect(question.reply.actions.map((a) => a.label)).toEqual([
      'Evet, otopark göster',
      'Hayır, yol tarifini aç',
    ]);
    expect(question.reply.directions).toBeUndefined();
    expect(question.reply.cards).toEqual([]);
    expect(question.ctx.parkAsk).toMatchObject({ id: card.id, name: card.name });
  });

  it('Evet: the car parks near that restaurant, with its name in the reply', async () => {
    const { card, question } = await asked();
    const r = await answer(tr.chat.parkAskYes, question.ctx, deps);
    const rest = getRestaurant(card.id)!;
    expect(r.reply.text).toContain(card.name);
    expect(r.reply.directions).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
    for (const c of r.reply.cards) {
      expect(c.kind).toBe('parking');
      // The walk on the card is measured from the restaurant.
      const p = deps.parkings.find((x) => x.id === c.id)!;
      expect(c.distanceM).toBe(Math.round(distanceMeters(rest, p)));
      expect(cardModel(c, 0, undefined, t).subline).toMatch(/dk yürüme/);
    }
    expect(r.ctx.parkAsk).toBeUndefined();
    expect(r.ctx.section).toBe('park');
    expect(r.ctx.place).toMatchObject({ label: card.name, lat: rest.lat, lng: rest.lng });
  });

  it('Evet shows the live free spots of a fresh car park', async () => {
    const { card, question } = await asked();
    const rest = getRestaurant(card.id)!;
    const near = staticParkings()
      .map((p) => ({ p, d: distanceMeters(rest, p) }))
      .sort((a, b) => a.d - b.d)[0]!.p;
    const now = new Date();
    const live = {
      ...deps,
      now,
      parkings: deps.parkings.map((p) =>
        p.id === near.id
          ? {
              ...p,
              free: 17,
              updatedAt: now.toISOString(),
              fetchedAt: now.toISOString(),
              source: 'izmir-open-data' as const,
            }
          : p,
      ),
    } as AssistantDeps;
    const r = await answer('evet', question.ctx, live);
    const first = r.reply.cards[0]!;
    expect(first).toMatchObject({ kind: 'parking', id: near.id, free: 17 });
    expect(cardModel(first, 0, undefined, t).pill).toContain('17');
    expect(r.reply.text).toContain('17 boş');
    // An old reading is not shown as free spots.
    const stale = await answer('evet', question.ctx, {
      ...live,
      now: new Date(now.getTime() + 60 * 60 * 1000),
    });
    expect(stale.reply.cards[0]).toMatchObject({ id: near.id, free: null });
  });

  it('Hayır: directions to the restaurant at once, with a short send-off', async () => {
    const { card, question } = await asked();
    const rest = getRestaurant(card.id)!;
    const r = await answer(tr.chat.parkAskNo, question.ctx, deps);
    expect(r.reply.directions).toEqual({ lat: rest.lat, lng: rest.lng, name: rest.name });
    expect(r.reply.text).toMatch(/yolculuklar/i);
    expect(r.reply.text).toContain(rest.name);
    expect(r.reply.cards).toEqual([]);
    expect(r.ctx.parkAsk).toBeUndefined();
    // The food list stays what "sence" refers to.
    expect(r.ctx.lastCards).toBeDefined();
  });

  it.each(['evet', 'Evet!', 'olur', 'göster', 'tamam göster', 'arabayla gidiyorum', 'yes'])(
    'a typed "%s" works like the Evet chip',
    async (text) => {
      const { card, question } = await asked();
      const r = await answer(text, question.ctx, deps);
      expect(r.reply.directions).toBeUndefined();
      expect(r.reply.text).toContain(card.name);
      expect(r.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
    },
  );

  it.each(['hayır', 'yok', 'Hayır, yol tarifini aç', 'yürüyerek gidiyorum', 'istemiyorum', 'no'])(
    'a typed "%s" works like the Hayır chip',
    async (text) => {
      const { card, question } = await asked();
      const r = await answer(text, question.ctx, deps);
      expect(r.reply.directions).toMatchObject({ name: card.name });
    },
  );

  it('answers without a router call', async () => {
    const { question } = await asked();
    const understand = jest.fn(async () => ({ ok: false, reason: 'error' }));
    const ai = { understand, quotaNotice: () => true } as unknown as AssistantDeps['ai'];
    await answer('evet', question.ctx, { ...deps, ai });
    await answer('hayır', question.ctx, { ...deps, ai });
    expect(understand).not.toHaveBeenCalled();
  });

  it('something else is a new message: the question is dropped', async () => {
    const { question } = await asked();
    const r = await answer('Konak kahvaltı', question.ctx, deps);
    expect(r.ctx.parkAsk).toBeUndefined();
    expect(r.reply.directions).toBeUndefined();
    expect(foods(r.reply.cards).length).toBeGreaterThan(0);
    // A late "evet" after that answers nothing in particular.
    const late = await answer('evet', r.ctx, deps);
    expect(late.reply.directions).toBeUndefined();
  });

  it('the English chips are read as their Turkish twins', async () => {
    await i18n.changeLanguage('en');
    try {
      const { question } = await asked();
      expect(question.reply.actions.map((a) => a.label)).toEqual([
        'Yes, show car parks',
        'No, open directions',
      ]);
      expect(ruleQuery('Yes, show car parks')).toBe(tr.chat.parkAskYes);
      expect(ruleQuery('No, open directions')).toBe(tr.chat.parkAskNo);
    } finally {
      await i18n.changeLanguage('tr');
    }
  });
});

describe('a car park card is not asked about', () => {
  it('the park answer has no parkAsk and its cards are car parks', async () => {
    const r = await answer('Konak otopark', emptyContext('park'), deps);
    const ctx: ChatContext = r.ctx;
    expect(ctx.parkAsk).toBeUndefined();
    expect(r.reply.cards.every((c) => c.kind === 'parking')).toBe(true);
  });
});
