import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import type { ChatResponse, PickCandidate, Understanding } from '@/lib/ai/protocol';

import { walkMinFromMeters } from '@/lib/ai/verify';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { searchPlaces, searchPlacesStrict } from '../search';
import { staticParkings } from '../staticParkings';

const parkings = staticParkings();
// Keys with their options: the text says which template was used.
const keyDeps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings,
  t: (k, o) => (o ? `${k} ${JSON.stringify(o)}` : k),
};
// Real Turkish strings.
// eslint-disable-next-line import/no-named-as-default-member
const realDeps: AssistantDeps = { ...keyDeps, t: (k, o) => i18n.t(k, o) };

const offtopic = (reply: string): AiResult<Understanding> => ({
  ok: true,
  value: { kind: 'offtopic', reply },
  remaining: 8,
});

/** A mocked AI layer; `chat` is only present when given. */
function mockAi(
  fns: {
    understand?: () => unknown;
    pick?: (req: { candidates: PickCandidate[] }) => unknown;
    chat?: () => unknown;
  } = {},
) {
  const fail = async () => ({ ok: false, reason: 'error' });
  const ai = {
    understand: jest.fn(fns.understand ?? fail),
    pick: jest.fn(fns.pick ?? fail),
    plan: jest.fn(fail),
    pickPark: jest.fn(fail),
    ...(fns.chat ? { chat: jest.fn(fns.chat) } : {}),
  };
  const deps: AssistantDeps = {
    ...keyDeps,
    ai: { ...ai, quotaNotice: () => true } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { ai: ai as typeof ai & { chat: jest.Mock }, deps };
}

const closest = async (req: { candidates: PickCandidate[] }) => {
  const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
  return {
    ok: true,
    value: { pick: best.i, reasons: ['closest'], runnerUp: null, runnerUpWhy: null, tone: null },
    remaining: 5,
  };
};

describe('greeting replies match the greeting', () => {
  it.each([
    ['İyi günler', 'chat.greet.day_'],
    ['iyi akşamlar', 'chat.greet.evening_'],
    ['İyi geceler', 'chat.greet.night_'],
    ['Günaydın', 'chat.greet.morning_'],
    ['nasılsın', 'chat.greet.fine_'],
    ['naber', 'chat.greet.fine_'],
    ['ne haber', 'chat.greet.fine_'],
    ['selam', 'chat.hello_'],
    ['merhaba', 'chat.hello_'],
    ['sa', 'chat.greet.salam_'],
    ['selamün aleyküm', 'chat.greet.salam_'],
    ['hoşça kal', 'chat.greet.bye_'],
    ['görüşürüz', 'chat.greet.bye_'],
    ['teşekkürler', 'chat.greet.thanks_'],
    ['sağ ol', 'chat.greet.thanks_'],
  ])('"%s" -> %s', async (q, prefix) => {
    const r = await answer(q, emptyContext('park'), keyDeps);
    expect(r.reply.text.startsWith(prefix)).toBe(true);
    expect(r.reply.cards).toEqual([]);
  });

  it('answers "İyi günler" with "Size de iyi günler!", not with "İyiyim"', async () => {
    for (const q of ['İyi günler', 'iyi akşamlar', 'iyi geceler']) {
      const r = await answer(q, emptyContext('park'), realDeps);
      expect(r.reply.text).toMatch(/^Size de iyi (günler|akşamlar|geceler)! /);
      expect(r.reply.text).not.toContain('İyiyim');
    }
    expect((await answer('günaydın', emptyContext('park'), realDeps)).reply.text).toMatch(
      /^Günaydın! /,
    );
    expect((await answer('nasılsın', emptyContext('park'), realDeps)).reply.text).toMatch(
      /^İyiyim, sağ ol! /,
    );
    expect((await answer('selam', emptyContext('park'), realDeps)).reply.text).toMatch(/^Selam! /);
    expect((await answer('sa', emptyContext('park'), realDeps)).reply.text).toMatch(
      /^Aleykümselam! /,
    );
  });

  it('does not take a greeting word inside a real request for a greeting', async () => {
    const r = await answer('selam bornova köfte', emptyContext('food'), keyDeps);
    expect(r.reply.text.startsWith('chat.greet')).toBe(false);
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('transcript: "Bir yere gireceğime emin misin yani"', () => {
  const q = 'Bir yere gireceğime emin misin yani';

  it('AI off: the honest doubt reply, never a dish-or-place question', async () => {
    const r = await answer(q, emptyContext('food'), realDeps);
    expect(r.reply.text).toContain('Verim belediye ve OpenStreetMap');
    expect(r.reply.text).toContain("Yol tarifi'nden kontrol etmeni öneririm.");
    expect(r.reply.cards).toEqual([]);
    expect(r.reply.actions.length).toBeGreaterThan(0);
    const keys = await answer(q, emptyContext('park'), keyDeps);
    expect(keys.reply.text).toBe('chat.convoDoubt');
  });

  it.each(['emin misin', 'ciddi misin'])('"%s" is doubt, too', async (t) => {
    const r = await answer(t, emptyContext('food'), keyDeps);
    expect(r.reply.text).toBe('chat.convoDoubt');
  });

  it.each(['anlamadım', 'nasıl yani'])('"%s" gets the how-to with example chips', async (t) => {
    const r = await answer(t, emptyContext('food'), keyDeps);
    expect(r.reply.text).toBe('chat.convoHowTo');
    expect(r.reply.actions.every((a) => a.kind === 'say')).toBe(true);
    expect(r.reply.actions.length).toBeGreaterThan(0);
  });

  it('another conversational sentence gets the off-topic template with chips', async () => {
    const r = await answer('neden', emptyContext('food'), keyDeps);
    expect(r.reply.text.startsWith('chat.offTopic_')).toBe(true);
    expect(r.reply.actions.length).toBeGreaterThan(0);
  });

  it('AI on (no /chat): /understand is called once and its valid offtopic reply is used', async () => {
    const { ai, deps } = mockAi({ understand: async () => offtopic('Emin olmaya çalışıyorum 😄') });
    const r = await answer(q, emptyContext('food'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(r.reply.text).toBe('Emin olmaya çalışıyorum 😄');
    expect(r.reply.sparkle).toBe(true);
  });

  it('AI on: an invalid offtopic reply, an error or a quota stop falls back to the doubt template', async () => {
    for (const understand of [
      async () => offtopic('Bu yer 3 dakika uzakta, kesin açık.'),
      async () => ({ ok: false, reason: 'error' }),
      async () => ({ ok: false, reason: 'quota' }),
    ]) {
      const { ai, deps } = mockAi({ understand });
      const r = await answer(q, emptyContext('food'), deps);
      expect(ai.understand).toHaveBeenCalledTimes(1);
      expect(r.reply.text).toBe('chat.convoDoubt');
      expect(r.reply.text).not.toContain('dishOrPlace');
    }
  });

  it('AI on: an AI search that found nothing is still no dish-or-place question', async () => {
    const empty: AiResult<Understanding> = {
      ok: true,
      remaining: 5,
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
      },
    };
    const { deps } = mockAi({ understand: async () => empty });
    const r = await answer(q, emptyContext('food'), deps);
    expect(r.reply.text).toBe('chat.convoDoubt');
  });

  it('an unrecognised multi-word sentence reaches /understand once; a valid offtopic reply is used', async () => {
    const { ai, deps } = mockAi({ understand: async () => offtopic('Buna yetişemedim 😄') });
    const r = await answer('zırtapoz kuruntu falan filan', emptyContext('food'), deps);
    expect(ai.understand).toHaveBeenCalledTimes(1);
    expect(r.reply.text).toBe('Buna yetişemedim 😄');
  });

  it('keeps asking dish-or-place for a plain unknown word', async () => {
    const r = await answer('zırtapoz', emptyContext('food'), keyDeps);
    expect(r.reply.text.startsWith('chat.dishOrPlace')).toBe(true);
  });

  it('a restaurant-style question with one particle is still a search', async () => {
    const r = await answer('lahmacun var mı', emptyContext('food'), keyDeps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});

describe('transcript: "Sence"', () => {
  it('AI off, no cards: asks what we are looking for, with chips', async () => {
    for (const q of ['Sence', 'sen seç', 'fark etmez', 'farketmez', 'ne dersin', 'hangisi iyi']) {
      const r = await answer(q, emptyContext('park'), keyDeps);
      expect(r.reply.text).toBe('chat.askWhat');
      expect(r.reply.cards).toEqual([]);
      expect(r.reply.actions.length).toBeGreaterThan(0);
      expect(r.reply.text).not.toContain('Sencer');
    }
    expect((await answer('Sence', emptyContext('park'), realDeps)).reply.text).toBe(
      'Ne arıyoruz: yemek mi, otopark mı?',
    );
  });

  it('AI off, with cards: the rule choice names the top card, no ✨, only true reasons', async () => {
    const list = await answer('lahmacun', emptyContext('food'), keyDeps);
    const cards = list.reply.cards.filter((c) => c.kind === 'restaurant');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(list.ctx.lastCards).toEqual(list.reply.cards);
    const r = await answer('Sence', list.ctx, keyDeps);
    expect(r.reply.sparkle).toBeFalsy();
    expect(r.reply.text.startsWith('chat.pickRule')).toBe(true);
    expect(r.reply.text).toContain(cards[0]!.name);
    expect(r.reply.cards).toEqual(list.reply.cards);
    // Every claimed reason is one the card's own facts prove.
    const top = cards[0]!;
    if (r.reply.text.includes('chat.why.closest')) {
      expect(Math.min(...cards.map((c) => walkMinFromMeters(c.distanceM)))).toBe(
        walkMinFromMeters(top.distanceM),
      );
    }
    if (r.reply.text.includes('chat.why.free_parking')) {
      expect(top.kind === 'restaurant' && top.narr?.parkingPaid).toBe(false);
    }
    if (r.reply.text.includes('chat.why.open_now')) expect(top.narr?.open).toBe('open');
  });

  it('says in plain Turkish that it is the rule choice', async () => {
    const list = await answer('lahmacun', emptyContext('food'), realDeps);
    const r = await answer('sen bil', list.ctx, realDeps);
    expect(r.reply.text).toMatch(/Yapay zekâ olmadan/);
    expect(r.reply.text).not.toContain('✨');
  });

  it('AI off, car park cards: the rule choice uses the car park reasons', async () => {
    const list = await answer('Konak otopark', emptyContext('park'), keyDeps);
    const cards = list.reply.cards.filter((c) => c.kind === 'parking');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const r = await answer('hangisi', list.ctx, keyDeps);
    expect(r.reply.text.startsWith('chat.pickRule')).toBe(true);
    expect(r.reply.text).toContain(cards[0]!.name);
    expect(r.reply.sparkle).toBeFalsy();
    if (r.reply.text.includes('chat.whyPark.closest')) {
      expect(Math.min(...cards.map((c) => walkMinFromMeters(c.distanceM)))).toBe(
        walkMinFromMeters(cards[0]!.distanceM),
      );
    }
  });

  it('AI on: runs the existing pick path on the last cards (one pick call)', async () => {
    const { ai, deps } = mockAi({ pick: closest });
    const list = await answer('lahmacun', emptyContext('food'), deps);
    const r = await answer('sence', list.ctx, deps);
    expect(ai.pick).toHaveBeenCalledTimes(1);
    expect(ai.understand).not.toHaveBeenCalled();
    expect(r.reply.text).toContain('chat.pickLine');
    expect(r.reply.sparkle).toBe(true);
    expect(r.reply.cards[0]).toMatchObject({ picked: true });
  });

  it('AI on but the pick fails or the quota is gone: the rule choice answers', async () => {
    const failing = mockAi({ pick: async () => ({ ok: false, reason: 'quota' }) });
    const list = await answer('lahmacun', emptyContext('food'), failing.deps);
    const r = await answer('sence', list.ctx, failing.deps);
    expect(r.reply.text.startsWith('chat.pickRule')).toBe(true);
    expect(r.reply.sparkle).toBeFalsy();
    expect(r.reply.notice).toBe('chat.sparkleOut');
  });

  it('after a reply without cards "sence" asks again', async () => {
    const list = await answer('lahmacun', emptyContext('food'), keyDeps);
    const hello = await answer('selam', list.ctx, keyDeps);
    expect(hello.ctx.lastCards).toBeUndefined();
    const r = await answer('sence', hello.ctx, keyDeps);
    expect(r.reply.text).toBe('chat.askWhat');
  });
});

describe('chat place resolution does not prefix-match short common words', () => {
  it('"sence" is not "Sencer ..." in the chat, but autocomplete still prefix-matches', () => {
    expect(searchPlaces('sence', 3).length).toBeGreaterThan(0);
    expect(searchPlacesStrict('sence', 3)).toEqual([]);
  });

  it('a whole name word still resolves; autocomplete prefixes stay in searchPlaces', () => {
    expect(searchPlaces('kord', 3).some((h) => h.name.toLowerCase().includes('kordon'))).toBe(true);
    expect(searchPlacesStrict('kordon', 3).length).toBeGreaterThan(0);
    expect(searchPlacesStrict('konak', 3).length).toBeGreaterThan(0);
    // Longer or multi-word queries keep prefix matching.
    expect(searchPlacesStrict('alsancak', 3)).toEqual(searchPlaces('alsancak', 3));
    expect(searchPlacesStrict('kemeralti çarşı', 3)).toEqual(searchPlaces('kemeralti çarşı', 3));
    // Known aliases keep working.
    expect(searchPlacesStrict('deu', 3)).toEqual(searchPlaces('deu', 3));
  });
});

describe('small talk through /chat', () => {
  const said =
    (reply: string, action: ChatResponse['action'] = 'none') =>
    async () => ({
      reply,
      action,
    });

  it('a greeting calls /chat once and shows its valid reply (marked AI, no /understand)', async () => {
    const { ai, deps } = mockAi({ chat: said('Size de iyi günler! Ne arıyoruz?') });
    const r = await answer('İyi günler', emptyContext('park'), deps);
    expect(ai.chat).toHaveBeenCalledTimes(1);
    expect((ai.chat.mock.calls[0] as unknown[])[0]).toBe('İyi günler');
    expect(ai.understand).not.toHaveBeenCalled();
    expect(r.reply.text).toBe('Size de iyi günler! Ne arıyoruz?');
    expect(r.reply.sparkle).toBe(true);
    expect(r.reply.cards).toEqual([]);
  });

  it('thanks, goodbye and conversational talk go to /chat too', async () => {
    for (const q of ['teşekkürler', 'hoşça kal', 'Bir yere gireceğime emin misin yani']) {
      const { ai, deps } = mockAi({ chat: said('Ne demek, buradayım!') });
      const r = await answer(q, emptyContext('park'), deps);
      expect(ai.chat).toHaveBeenCalledTimes(1);
      expect(ai.understand).not.toHaveBeenCalled();
      expect(r.reply.text).toBe('Ne demek, buradayım!');
    }
  });

  it('food and place searches never call /chat', async () => {
    for (const [q, section] of [
      ['lahmacun', 'food'],
      ['Konak otopark', 'park'],
      ["Bornova'da köfteci", 'food'],
    ] as const) {
      const { ai, deps } = mockAi({ chat: said('Selam!') });
      await answer(q, emptyContext(section), deps);
      expect(ai.chat).not.toHaveBeenCalled();
    }
  });

  it('"sence" is a rule pick and does not call /chat', async () => {
    const { ai, deps } = mockAi({ chat: said('Selam!'), pick: closest });
    const list = await answer('lahmacun', emptyContext('food'), deps);
    await answer('sence', list.ctx, deps);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it.each([
    ['a reply with digits', async () => ({ reply: 'Size de 2 iyi gün!', action: 'none' })],
    ['a reply with a banned claim', said('Yakında ucuz bir yer var!')],
    ['a reply that is too long', said('Selam! '.repeat(30))],
    ['a null (limit or error)', async () => null],
    [
      'a thrown error',
      async () => {
        throw new Error('boom');
      },
    ],
  ])('%s -> the greeting template', async (_name, chat) => {
    const { ai, deps } = mockAi({ chat });
    const r = await answer('İyi günler', emptyContext('park'), deps);
    expect(ai.chat).toHaveBeenCalledTimes(1);
    expect(r.reply.text.startsWith('chat.greet.day_')).toBe(true);
    expect(r.reply.sparkle).toBeFalsy();
  });

  it('a failed /chat on conversational talk uses the honest template and does not spend /understand', async () => {
    const { ai, deps } = mockAi({ chat: async () => null });
    const r = await answer('Bir yere gireceğime emin misin yani', emptyContext('park'), deps);
    expect(ai.understand).not.toHaveBeenCalled();
    expect(r.reply.text).toBe('chat.convoDoubt');
  });

  it('ask_food_or_park and suggest_examples bring chips from our own data', async () => {
    const ask = mockAi({ chat: said('Selam! Ne arıyoruz?', 'ask_food_or_park') });
    const a = await answer('selam', emptyContext('park'), ask.deps);
    expect(a.reply.actions.map((x) => x.label)).toEqual([
      'chat.exNear',
      'chat.exKofte',
      'chat.exAlsancak',
    ]);
    const ex = mockAi({ chat: said('Selam! Şunları yazabilirsin.', 'suggest_examples') });
    const e = await answer('selam', emptyContext('food'), ex.deps);
    expect(e.reply.actions.length).toBeGreaterThan(0);
  });

  it('pick_from_last runs the pick path on the last cards', async () => {
    const { ai, deps } = mockAi({
      chat: said('Rica ederim, ben seçeyim!', 'pick_from_last'),
      pick: closest,
    });
    const list = await answer('lahmacun', emptyContext('food'), deps);
    const r = await answer('teşekkürler', list.ctx, deps);
    expect(ai.chat).toHaveBeenCalledTimes(1);
    const chatArgs = ai.chat.mock.calls[0] as unknown as [string, { count: number; kind: string }];
    expect(chatArgs[1]).toMatchObject({ kind: 'restaurant' });
    expect(ai.pick).toHaveBeenCalledTimes(1);
    expect(r.reply.text.startsWith('Rica ederim, ben seçeyim!\n')).toBe(true);
    expect(r.reply.text).toContain('chat.pickLine');
    expect(r.reply.cards.length).toBe(list.reply.cards.length);
  });

  it('pick_from_last without cards falls back to the food-or-park chips', async () => {
    const { ai, deps } = mockAi({ chat: said('Hangisini istersin?', 'pick_from_last') });
    const r = await answer('selam', emptyContext('park'), deps);
    expect(ai.pick).not.toHaveBeenCalled();
    expect(r.reply.actions.length).toBe(3);
  });
});
