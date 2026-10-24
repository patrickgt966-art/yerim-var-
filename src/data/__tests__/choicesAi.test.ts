// Kinds of place the router picks for a goal or situation the table has no entry for ("ilk
// buluşma"): the catalog (choices.ts KINDS) and the question the app asks with them.
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import {
  KIND_IDS,
  KIND_NAMES,
  type KindId,
  type Understanding,
  type Wish,
} from '@/lib/ai/protocol';

import { answer, emptyContext, refine, type AssistantDeps, type BotMessage } from '../assistant';
import { AI_CHOICE_ID, CHOICES, KINDS, inMember, memberLabel, memberOf } from '../choices';
import { setActiveCity } from '../cities';
import { CATEGORY_RADII_M, allRestaurants, getRestaurant, restaurantsNear } from '../restaurants';
import { staticParkings } from '../staticParkings';

const ALSANCAK = { lat: 38.4365, lng: 27.1437 };
const reach = CATEGORY_RADII_M[CATEGORY_RADII_M.length - 1]!;
const lang = 'tr';

describe('the catalog of kinds', () => {
  afterAll(() => setActiveCity('izmir'));

  it('has one definition per id, about forty of them, named for the router', () => {
    expect(KIND_IDS.length).toBeGreaterThanOrEqual(38);
    expect(KIND_IDS.length).toBeLessThanOrEqual(45);
    for (const [id, m] of Object.entries(KINDS)) {
      expect(m.id).toBe(id);
      expect(m.tr.trim()).not.toBe('');
      expect(m.en.trim()).not.toBe('');
      expect(m.words.length).toBeGreaterThan(0);
      // A kind is found by something: a category, a tag or a name.
      expect(m.cat ?? m.names ?? m.cuisines ?? m.diets ?? m.kinds).toBeDefined();
    }
    for (const id of KIND_IDS) {
      expect(KINDS[id]).toBeDefined();
      expect(KIND_NAMES[id].trim()).not.toBe('');
    }
    // The only kinds the router is not offered share their label with another kind.
    const hidden = Object.keys(KINDS).filter((id) => !KIND_IDS.includes(id as KindId));
    expect(hidden.sort()).toEqual(['fitbowl', 'meatgrill']);
  });

  it('is what the table entries use: no entry defines a kind of its own', () => {
    for (const e of CHOICES) {
      for (const m of e.members) expect(m).toBe(KINDS[m.id as keyof typeof KINDS]);
    }
  });

  it('finds places in at least two cities for every kind', () => {
    const cities = ['izmir', 'istanbul', 'ankara', 'bursa', 'antalya'];
    const found = new Map<string, string[]>(KIND_IDS.map((id) => [id, []]));
    for (const city of cities) {
      setActiveCity(city);
      const all = allRestaurants();
      for (const id of KIND_IDS) {
        if (all.some((r) => inMember(r, KINDS[id]))) found.get(id)!.push(city);
      }
    }
    for (const [id, where] of found) {
      if (where.length < 2)
        throw new Error(`${id} finds places in ${where.join(',') || 'no city'}`);
    }
  });
});

type Search = Extract<Understanding, { kind: 'search' }>;
function routed(over: Partial<Search>): AiResult<Understanding> {
  return {
    ok: true,
    remaining: 8,
    value: {
      kind: 'search',
      district: null,
      cat: null,
      dish: null,
      place: null,
      food: true,
      requireParking: false,
      appleQuery: null,
      nearMe: true,
      dishServes: null,
      ...over,
    },
  };
}

/** A fake AI layer: the router answers `result`; `wording` (when given) words the question. */
function fakeAi(
  result: AiResult<Understanding>,
  wording?: (req: unknown) => Promise<string | null>,
) {
  const understand = jest.fn(async () => result);
  const reply = jest.fn(wording ?? (async (_req: unknown) => null));
  const fail = async () => ({ ok: false, reason: 'error' });
  const deps: AssistantDeps = {
    here: async () => ALSANCAK,
    geocode: async () => null,
    parkings: staticParkings(),
    // eslint-disable-next-line import/no-named-as-default-member
    t: (k, o) => i18n.t(k, o) as string,
    ai: {
      understand,
      reply,
      pick: jest.fn(fail),
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { deps, understand, reply };
}

const around = restaurantsNear(ALSANCAK, reach, 5000);
const isPresent = (id: KindId) => around.some((r) => inMember(r, KINDS[id]));
const labels = (r: BotMessage) => r.actions.map((a) => a.label);
const ids = (r: BotMessage) => r.cards.map((c) => c.id);
const chip = (r: BotMessage, label: string) => {
  const a = r.actions.find((x) => x.label === label);
  if (!a || a.kind !== 'refine') throw new Error(`no chip ${label}`);
  return a;
};
const restaurants = (r: BotMessage) =>
  r.cards.filter((c) => c.kind === 'restaurant').map((c) => getRestaurant(c.id)!);

const MSG = 'ilk buluşmaya gideceğiz';
const PICKED: KindId[] = ['meyhane', 'steak', 'italian', 'cafe', 'pastry'];
const ABSENT = KIND_IDS.filter((id) => !isPresent(id));

describe('the router picks kinds', () => {
  it('the test point has kinds with no place around and kinds with places', () => {
    expect(ABSENT.length).toBeGreaterThanOrEqual(2);
    for (const id of PICKED) expect(isPresent(id)).toBe(true);
  });

  it('asks with the picked kinds that have a place nearby, "Hepsi" last', async () => {
    const picked = [PICKED[0]!, ABSENT[0]!, ...PICKED.slice(1)];
    const { deps } = fakeAi(routed({ wishes: ['romantic'], kinds: picked }));
    const q = await answer(MSG, emptyContext('food'), deps);
    expect(q.reply.cards).toEqual([]);
    expect(labels(q.reply)).toEqual([...PICKED.map((id) => memberLabel(KINDS[id], lang)), 'Hepsi']);
    // eslint-disable-next-line import/no-named-as-default-member
    expect(q.reply.text).toBe(i18n.t('chat.choice.aiAsk'));
    expect(q.ctx.ask).toBe(AI_CHOICE_ID);
    expect(q.ctx.choiceKinds).toEqual(PICKED);
    expect(q.ctx.wishes).toEqual(['romantic']);
  });

  it('a kind chip searches that kind only, the card says the kind, the note says what was done', async () => {
    const { deps } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    for (const id of PICKED) {
      const r = await refine(q.ctx, chip(q.reply, memberLabel(KINDS[id], lang)).patch, deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(r.ctx.choice).toEqual({ id: AI_CHOICE_ID, member: id });
      for (const c of r.reply.cards) {
        expect(inMember(getRestaurant(c.id)!, KINDS[id])).toBe(true);
        if (c.kind === 'restaurant') {
          expect(c.reason).toBe(memberLabel(KINDS[id], lang).toLocaleLowerCase('tr'));
        }
      }
      expect(r.reply.text).toContain('Menü verimiz yok; isteğine uyabilecek yer türlerini seçtim:');
      expect(r.reply.text).not.toMatch(/undefined|null|\{\{|NaN/);
    }
  });

  it('"Hepsi" mixes the kinds, none over 40%, and names only kinds on the screen', async () => {
    const { deps } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    const r = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
    const shown = restaurants(r.reply);
    expect(shown).toHaveLength(5);
    const members = PICKED.map((id) => KINDS[id]);
    const kinds = shown.map((x) => memberOf(x, members)!.id);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(kinds)) {
      expect(kinds.filter((x) => x === k).length / kinds.length).toBeLessThanOrEqual(0.4);
    }
    const note = r.reply.text.split('\n').find((l) => l.includes('seçtim'))!;
    for (const m of members) {
      const label = memberLabel(m, lang).toLocaleLowerCase('tr');
      if (note.toLocaleLowerCase('tr').includes(label)) expect(kinds).toContain(m.id);
    }
  });

  it('typed answers work like the chips, without another router call', async () => {
    const { deps, understand } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    const tapped = await refine(q.ctx, chip(q.reply, 'Steak').patch, deps);
    const typed = await answer('steak', q.ctx, deps);
    expect(ids(typed.reply)).toEqual(ids(tapped.reply));
    const all = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
    for (const word of ['hepsi', 'farketmez']) {
      expect(ids((await answer(word, q.ctx, deps)).reply)).toEqual(ids(all.reply));
    }
    expect(understand).toHaveBeenCalledTimes(1);
    // A word that names none of the kinds is a new message.
    const other = await answer('kahvaltı', q.ctx, fakeAi(routed({ cat: 'breakfast' })).deps);
    expect(other.ctx.ask).toBeUndefined();
    expect(other.ctx.cat).toBe('breakfast');
  });

  it('only the kinds on offer can be typed: "islak burger" is no answer when it was not asked', async () => {
    const { deps } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    const r = await answer('islak burger', q.ctx, deps);
    expect(r.ctx.choice?.id).not.toBe(AI_CHOICE_ID);
  });

  it('words the question through the AI, with the kind labels as the facts', async () => {
    const { deps, reply } = fakeAi(
      routed({ kinds: PICKED }),
      async () => 'Hangisinden başlayalım?',
    );
    const q = await answer(MSG, emptyContext('food'), deps);
    const sent = reply.mock.calls[0]![0] as { kind: string; facts: { choices: string[] } };
    expect(sent.kind).toBe('choice_question');
    expect(sent.facts.choices).toEqual(labels(q.reply));
    expect(q.reply.text).toBe('Hangisinden başlayalım?');
    expect(q.ctx.ask).toBe(AI_CHOICE_ID);
  });

  it('one kind with a place nearby: no question, that kind is shown', async () => {
    const { deps } = fakeAi(routed({ kinds: [ABSENT[0]!, 'meyhane', ABSENT[1]!] }));
    const r = await answer(MSG, emptyContext('food'), deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
    for (const x of restaurants(r.reply)) expect(inMember(x, KINDS.meyhane)).toBe(true);
    expect(r.reply.text).toContain('isteğine uyabilecek yer türlerini seçtim: meyhane');
  });

  it('no kind nearby: the table entry of the wishes asks, else the search goes on as before', async () => {
    const none = [ABSENT[0]!, ABSENT[1]!];
    const withWish = fakeAi(routed({ kinds: none, wishes: ['protein' as Wish] }));
    const q = await answer('kaslıyım ilk buluşmaya gideceğiz', emptyContext('food'), withWish.deps);
    expect(q.ctx.ask).toBe('protein');
    const plain = fakeAi(routed({ kinds: none }));
    const r = await answer(MSG, emptyContext('food'), plain.deps);
    expect(r.ctx.ask).toBeUndefined();
    expect(r.ctx.choice).toBeUndefined();
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('the router kinds win over the table entry of a wish', async () => {
    const { deps } = fakeAi(routed({ kinds: PICKED, wishes: ['protein' as Wish] }));
    const q = await answer('kaslıyım ilk buluşmaya gideceğiz', emptyContext('food'), deps);
    expect(q.ctx.ask).toBe(AI_CHOICE_ID);
  });

  it('a category or a dish named means no kinds question', async () => {
    const withCat = fakeAi(routed({ cat: 'fish', kinds: PICKED }));
    const a = await answer('balık yiyelim', emptyContext('food'), withCat.deps);
    expect(a.ctx.ask).toBeUndefined();
    expect(a.reply.cards.length).toBeGreaterThan(0);
    const withDish = fakeAi(routed({ dish: 'lahmacun', cat: 'fast', kinds: PICKED }));
    const b = await answer('lahmacun yiyelim', emptyContext('food'), withDish.deps);
    expect(b.ctx.ask).toBeUndefined();
  });

  it('without kinds (no AI, or none picked) nothing changes', async () => {
    const { deps } = fakeAi(routed({ wishes: ['protein' as Wish] }));
    const q = await answer('kaslıyım bana yer bul', emptyContext('food'), deps);
    expect(q.ctx.ask).toBe('protein');
    expect(q.ctx.choiceKinds).toBeUndefined();
  });

  it('a new search forgets the kinds', async () => {
    const { deps } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    const r = await refine(q.ctx, chip(q.reply, 'Steak').patch, deps);
    expect(r.ctx.choiceKinds).toEqual(PICKED);
    const next = fakeAi(routed({ cat: 'fish' }));
    const n = await answer('balık', r.ctx, next.deps);
    expect(n.ctx.choice).toBeUndefined();
    expect(n.ctx.choiceKinds).toBeUndefined();
  });
});

describe('kinds round 2: occasions, party size, "hepsi" after results', () => {
  it('a mood word the router sent without kinds asks the table entry that fits it', async () => {
    const { deps } = fakeAi(routed({ wishes: [] }));
    const q = await answer(
      'moralim bozuk bir şeyler yiyip düzelmek istiyorum üsküdarda',
      emptyContext('food'),
      deps,
    );
    expect(q.ctx.ask).toBe('hearty');
    expect(q.reply.cards).toEqual([]);
    expect(labels(q.reply).at(-1)).toBe('Hepsi');
    const late = await answer('gece geç saatte acıktım', emptyContext('food'), deps);
    expect(late.ctx.ask).toBe('quick');
  });

  it('an occasion no table entry fits asks the common kinds when the router sent none; a plain "acıktım" is untouched', async () => {
    const { deps } = fakeAi(routed({ wishes: [] }));
    for (const text of [
      'iş arkadaşlarımla öğle yemeğine çıkıyoruz',
      'tatil için geldim yöresel bir şeyler denemek istiyorum',
    ]) {
      const q = await answer(text, emptyContext('food'), deps);
      expect(q.ctx.ask).toBe('ai');
      expect(q.reply.cards).toEqual([]);
      expect(labels(q.reply).at(-1)).toBe('Hepsi');
      expect(labels(q.reply).length).toBeGreaterThanOrEqual(3);
    }
    const plain = await answer('acıktım', emptyContext('food'), deps);
    expect(plain.ctx.ask).toBeUndefined();
    expect(plain.reply.cards.length).toBeGreaterThan(0);
  });

  it('the fallback needs the router: without it a mood word changes nothing', async () => {
    const r = await answer('moralim bozuk bir şeyler yiyelim', emptyContext('food'), {
      ...fakeAi(routed({})).deps,
      ai: undefined,
    });
    expect(r.ctx.ask).toBeUndefined();
  });

  const party = (over: Partial<Search>) =>
    routed({ clarify: { ask: 'party', text: 'Kaç kişi olacaksınız?' }, ...over });

  it('kinds come before the party-size question', async () => {
    const { deps } = fakeAi(party({ kinds: PICKED, wishes: ['family', 'kids'] }));
    const q = await answer(
      'çiğli tarafında çocuklarla doğum günü yapacağız',
      emptyContext('food'),
      deps,
    );
    expect(q.ctx.ask).toBe(AI_CHOICE_ID);
    expect(labels(q.reply).at(-1)).toBe('Hepsi');
    expect(q.reply.text).not.toContain('Kaç kişi');
  });

  it('without kinds (or with fewer than two around) the party question is still asked', async () => {
    const none = await answer(
      'misafirim var',
      emptyContext('food'),
      fakeAi(party({ kinds: [] })).deps,
    );
    expect(none.reply.text).toContain('Kaç kişi');
    const absent = await answer(
      'misafirim var',
      emptyContext('food'),
      fakeAi(party({ kinds: [ABSENT[0]!, ABSENT[1]!] })).deps,
    );
    expect(absent.reply.text).toContain('Kaç kişi');
  });

  it('"hepsi" after results shows all kinds of the ask, with no router call', async () => {
    const { deps, understand } = fakeAi(routed({ kinds: PICKED }));
    const q = await answer(MSG, emptyContext('food'), deps);
    const one = await refine(q.ctx, chip(q.reply, 'Steak').patch, deps);
    const all = await refine(q.ctx, chip(q.reply, 'Hepsi').patch, deps);
    for (const word of ['hepsi', 'tümü', 'hepsini göster', 'farketmez', 'herhangi biri']) {
      const r = await answer(word, one.ctx, deps);
      expect(ids(r.reply)).toEqual(ids(all.reply));
      expect(r.ctx.choice).toEqual({ id: AI_CHOICE_ID, member: 'all' });
    }
    expect(understand).toHaveBeenCalledTimes(1);
  });

  it('"hepsi" after plain results keeps them under a short lead; not a chat reply', async () => {
    const { deps, understand } = fakeAi(routed({ dish: 'lahmacun', cat: 'fast' }));
    const first = await answer('lahmacun', emptyContext('food'), deps);
    expect(first.reply.cards.length).toBeGreaterThan(0);
    for (const word of ['hepsi', 'farketmez', 'tümü']) {
      const r = await answer(word, first.ctx, deps);
      expect(r.reply.text).toBe('Hepsi burada.');
      expect(ids(r.reply)).toEqual(ids(first.reply));
    }
    expect(understand).toHaveBeenCalledTimes(1);
    // With no results on screen it is a new message, as before.
    const fresh = await answer('hepsi', emptyContext('food'), deps);
    expect(fresh.reply.text).not.toBe('Hepsi burada.');
  });
});
