import '@/i18n';
import i18n from 'i18next';

import { answer, emptyContext, type AssistantDeps, type ChatContext } from '@/data/assistant';
import { cityExamples, setActiveCity } from '@/data/cities';
import { staticParkings } from '@/data/staticParkings';

import { suggestions } from '../model';
import { isOwnPhrase, ruleQuery } from '../ruleQuery';

/* eslint-disable import/no-named-as-default-member */
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

// No AI layer: the rule path answers, as when the AI is off, out of uses or unreachable.
const deps: AssistantDeps = {
  here: async () => ({ lat: 38.437, lng: 27.143 }),
  geocode: async () => null,
  parkings: staticParkings(),
  t: (k, o) => t(k, o),
};

beforeAll(async () => {
  setActiveCity('izmir');
  await i18n.changeLanguage('en');
});
afterAll(async () => {
  await i18n.changeLanguage('tr');
});

const ask = (text: string, ctx: ChatContext = emptyContext('park')) =>
  answer(ruleQuery(text), ctx, deps);

describe('the English phrases the app offers work on the rule path', () => {
  it.each([
    'chat.exNear',
    'chat.exKofte',
    'chat.exAlsancak',
    'chat.exBreakfast',
    'chat.exFish',
    'chat.exStadium',
    'home.example2',
    'home.example3',
    'ara.example2',
    'home.cravings.fish',
    'home.cravings.chickenRice',
  ])('%s gives result cards', async (key) => {
    // Craving tiles send their name in lower case.
    const text = t(key, cityExamples()).toLowerCase();
    const res = await ask(text);
    expect(res.reply.cards.length).toBeGreaterThan(0);
  });

  it('maps a phrase to its Turkish twin and leaves typed text alone', () => {
    expect(ruleQuery('Car park near me')).toBe('Yakınımda otopark');
    expect(ruleQuery('car park near me!')).toBe('Yakınımda otopark');
    expect(ruleQuery('meatballs in Bornova please')).toBe('meatballs in Bornova please');
  });

  it('follow-up suggestions act on the previous search', async () => {
    const first = await answer('alsancak köfte', emptyContext('food'), deps);
    expect(first.reply.cards.length).toBeGreaterThan(0);
    const chips = suggestions(first.ctx, t);
    expect(chips).toContain(t('chat.sugNearer'));
    const nearer = await ask(t('chat.sugNearer'), first.ctx);
    expect(nearer.ctx.sort).toBe('distance');
    expect(nearer.reply.cards.length).toBeGreaterThan(0);
    // Understood as "and free parking", even when no such place exists.
    const free = await ask(t('chat.sugFreePark'), first.ctx);
    expect(free.ctx.freeParking).toBe(true);
    const other = await ask(t('chat.sugOther'), first.ctx);
    expect(other.reply.cards.length).toBeGreaterThan(0);
    const elsewhere = chips[chips.length - 1]!;
    const moved = await ask(elsewhere, first.ctx);
    expect(moved.ctx.place?.label).toBe(cityExamples().d);
  });

  it('is a no-op in Turkish', async () => {
    await i18n.changeLanguage('tr');
    try {
      expect(ruleQuery('Car park near me')).toBe('Car park near me');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('isOwnPhrase', () => {
  it("knows the Turkish text of the app's own chips, folded", () => {
    expect(isOwnPhrase('Yemek bul')).toBe(true);
    expect(isOwnPhrase('otopark bul!')).toBe(true);
    expect(isOwnPhrase('Yakınımda otopark')).toBe(true);
    expect(isOwnPhrase('asdf')).toBe(false);
    expect(isOwnPhrase('')).toBe(false);
  });
});
