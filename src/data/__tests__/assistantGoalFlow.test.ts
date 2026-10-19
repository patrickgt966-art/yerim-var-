// A goal / mood wish ("fit menü", "kaslıyım") must survive a clarify turn and a follow-up, and the
// choice question must come before any list. Transcript tests with a mocked AI layer that returns
// what the real router returns (src/lib/ai/protocol.ts shapes) and a /reply quota like the Worker's
// (one wording per charged message id).
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import type { AiReplyFacts, AiReplyKind, Understanding, Wish } from '@/lib/ai/protocol';

import {
  answer,
  emptyContext,
  refine,
  type AssistantDeps,
  type BotMessage,
  type ChatAction,
  type ChatContext,
} from '../assistant';
import { categoryOf, getRestaurant } from '../restaurants';
import { staticParkings } from '../staticParkings';

const ALSANCAK = { lat: 38.4365, lng: 27.1437 };

type Search = Extract<Understanding, { kind: 'search' }>;
const searchU = (over: Partial<Search> = {}): AiResult<Understanding> => ({
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
    nearMe: false,
    dishServes: null,
    wishes: [],
    partySize: null,
    clarify: null,
    plan: null,
    tone: null,
    dishNote: null,
    meaning: null,
    notCat: null,
    ...over,
  },
});
const down: AiResult<Understanding> = { ok: false, reason: 'error' } as never;

type ReplyReq = { userText: string; kind: AiReplyKind; facts: AiReplyFacts; messageId?: string };

/** The chat screen in miniature: one id per message, the context carried, chips applied as sohbet.tsx does. */
function screen(
  routed: AiResult<Understanding>[],
  wording: (req: ReplyReq) => string | null = () => null,
  usedIds: string[] = [],
) {
  const queue = [...routed];
  const charged = new Set<string>();
  const used = new Set<string>(usedIds);
  let n = 0;
  let current = '';
  const understand = jest.fn(async () => {
    charged.add(current);
    return queue.shift() ?? down;
  });
  // Like the Worker: one wording per charged message id.
  const reply = jest.fn(async (req: ReplyReq) => {
    const id = req.messageId ?? current;
    if (!charged.has(id) || used.has(id)) return null;
    used.add(id);
    return wording(req);
  });
  const fail = async () => ({ ok: false, reason: 'error' });
  const deps: AssistantDeps = {
    here: async () => ALSANCAK,
    geocode: async () => null,
    parkings: staticParkings(),
    // eslint-disable-next-line import/no-named-as-default-member
    t: (k, o) => i18n.t(k, o) as string,
    now: new Date(Date.UTC(2026, 9, 17, 9, 0, 0)),
    ai: {
      understand,
      messageId: () => current,
      reply,
      pick: jest.fn(fail),
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  let ctx: ChatContext = emptyContext('food');
  let last: BotMessage | null = null;
  const bind = () => {
    current = `u${++n}`;
  };
  const send = async (text: string) => {
    bind();
    const r = await answer(text, ctx, deps);
    ctx = r.ctx;
    last = r.reply;
    return r;
  };
  const tap = async (label: string) => {
    const a = (last?.actions ?? []).find((x) => x.label === label) as ChatAction | undefined;
    if (!a) throw new Error(`no chip "${label}" in: ${last?.actions.map((x) => x.label)}`);
    if (a.kind === 'say') return send(a.text);
    if (a.kind !== 'refine') throw new Error('not a chip');
    bind();
    const r = await refine(ctx, a.patch, deps);
    ctx = r.ctx;
    last = r.reply;
    return r;
  };
  return { send, tap, deps, understand, reply, ctx: () => ctx, used };
}

const labels = (m: BotMessage) => m.actions.map((a) => a.label);
const cats = (m: BotMessage) =>
  m.cards.map((c) => (c.kind === 'restaurant' ? categoryOf(getRestaurant(c.id)!) : null));
const clarifyDistrict = (wishes: Wish[], over: Partial<Search> = {}) =>
  searchU({
    wishes,
    clarify: { ask: 'district', text: 'Hangi semtte yemek istersiniz? ✨' },
    meaning: 'fit menü istiyor',
    ...over,
  });

// eslint-disable-next-line import/no-named-as-default-member
const HEALTHY_Q = () => i18n.t('chat.choice.ask.healthy') as string;

describe('the phone flow: fit menü -> where? -> Yakınımda -> kinds -> Hepsi', () => {
  // The router read the answer turn as a plain nearby food search, with or without the goal wish.
  it.each([
    ['no wish', [] as Wish[]],
    ['the wish again', ['healthy'] as Wish[]],
  ])('keeps the goal through the clarify turn (%s)', async (_n, again) => {
    const s = screen([
      clarifyDistrict(['healthy']),
      searchU({ nearMe: true, wishes: again, tone: 'Fit bir öğün için hemen bakıyorum.' }),
    ]);
    const first = await s.send('Fit menü istiyorum');
    expect(first.reply.cards).toEqual([]);
    expect(labels(first.reply)).toContain('Yakınımda');
    expect(first.ctx.ask).toBeUndefined();

    const second = await s.tap('Yakınımda');
    expect(second.reply.cards).toEqual([]);
    expect(second.reply.text).toContain(HEALTHY_Q());
    expect(second.ctx.ask).toBe('healthy');
    expect(labels(second.reply).length).toBeGreaterThanOrEqual(3);
    expect(labels(second.reply).at(-1)).toBe('Hepsi');
    expect(second.reply.text).not.toContain('Benim seçimim');

    const third = await s.tap('Hepsi');
    expect(third.reply.cards.length).toBeGreaterThan(0);
    expect(cats(third.reply)).not.toContain('dessert');
    expect(third.ctx.choice).toEqual({ id: 'healthy', member: 'all' });
  });

  it('a typed "yakınımda" works like the chip', async () => {
    const s = screen([clarifyDistrict(['healthy']), searchU({ nearMe: true })]);
    await s.send('Fit menü istiyorum');
    const second = await s.send('yakınımda');
    expect(second.ctx.ask).toBe('healthy');
    expect(second.reply.cards).toEqual([]);
    expect(labels(second.reply).at(-1)).toBe('Hepsi');
    const third = await s.send('hepsi');
    expect(third.reply.cards.length).toBeGreaterThan(0);
    expect(cats(third.reply)).not.toContain('dessert');
  });

  it('a district chip (Bornova) keeps the goal and asks near that place', async () => {
    const s = screen([clarifyDistrict(['protein']), searchU({ district: 'Bornova' })]);
    await s.send('kaslı bir şey istiyorum');
    const second = await s.send('Bornova');
    expect(second.ctx.ask).toBe('protein');
    expect(second.ctx.place?.label).toBe('Bornova');
    expect(labels(second.reply).at(-1)).toBe('Hepsi');
  });

  it('the wishes carried by a clarify do not override a category the answer names', async () => {
    const s = screen([clarifyDistrict(['healthy']), searchU({ nearMe: true, cat: 'fish' })]);
    await s.send('Fit menü istiyorum');
    const second = await s.send('yakınımda balık');
    expect(second.ctx.ask).toBeUndefined();
    expect(second.ctx.cat).toBe('fish');
    expect(second.ctx.wishes ?? []).not.toContain('healthy');
  });

  it('what a clarify left behind lasts one answer only', async () => {
    const s = screen([
      clarifyDistrict(['healthy']),
      searchU({ nearMe: true, cat: 'fish' }),
      searchU({ nearMe: true, cat: 'meat' }),
    ]);
    await s.send('Fit menü istiyorum');
    const second = await s.send('yakınımda balık');
    expect(second.ctx.clarifyWishes).toBeUndefined();
    const third = await s.send('kebap');
    expect(third.ctx.wishes ?? []).not.toContain('healthy');
  });

  it('the router answers with the goal wish and a place in one message', async () => {
    const s = screen([searchU({ district: 'Bornova', wishes: ['healthy'] })]);
    const r = await s.send("Bornova'da fit menü");
    expect(r.reply.cards).toEqual([]);
    expect(r.ctx.ask).toBe('healthy');
    expect(r.ctx.place?.label).toBe('Bornova');
    expect(r.reply.text).toContain(HEALTHY_Q());
    expect(labels(r.reply).at(-1)).toBe('Hepsi');
  });

  it('no AI pick line on the choice-question turn', async () => {
    const s = screen([
      clarifyDistrict(['healthy']),
      searchU({ nearMe: true, wishes: ['healthy'] }),
    ]);
    const pick = s.deps.ai!.pick as jest.Mock;
    await s.send('Fit menü istiyorum');
    const second = await s.tap('Yakınımda');
    expect(pick).not.toHaveBeenCalled();
    expect(second.reply.text).not.toContain('Benim seçimim');
  });
});

describe('a goal inside an existing food conversation', () => {
  it.each([
    ['onu boşver kaslıyım', 'protein', ['protein'] as Wish[]],
    ['aslında fit bir şey olsun', 'healthy', ['healthy'] as Wish[]],
  ])('"%s" starts the goal flow and drops the dish, keeping the place', async (text, entry, w) => {
    const s = screen([
      // The router keeps the earlier dish on a follow-up (its prompt tells it to).
      searchU({ district: 'Bornova', cat: 'meat', dish: 'kebap', dishServes: ['kebapçı'] }),
      searchU({ cat: 'meat', dish: 'kebap', dishServes: ['kebapçı'], wishes: w }),
    ]);
    const food = await s.send("Bornova'da kebap");
    expect(food.reply.cards.length).toBeGreaterThan(0);
    const r = await s.send(text);
    expect(r.reply.cards).toEqual([]);
    expect(r.ctx.ask).toBe(entry);
    expect(r.ctx.cat).toBeNull();
    expect(r.ctx.dish).toBeNull();
    expect(r.ctx.place?.label).toBe('Bornova');
    expect(labels(r.reply).at(-1)).toBe('Hepsi');
  });

  it('a goal with a category the user names ("fit balık") still searches that category', async () => {
    const s = screen([
      searchU({ district: 'Bornova', cat: 'meat', dish: 'kebap' }),
      searchU({ cat: 'fish', wishes: ['healthy'] }),
    ]);
    await s.send("Bornova'da kebap");
    const r = await s.send('fit balık olsun');
    expect(r.ctx.cat).toBe('fish');
    expect(r.ctx.ask).toBeUndefined();
  });
});

describe('a goal wish that reaches a plain food search', () => {
  it.each(['healthy', 'protein'] as Wish[])(
    'falls back to the "Hepsi" mix of its entry (%s), never an unfiltered list',
    async (wish) => {
      const s = screen([]);
      const ctx: ChatContext = { ...emptyContext('food'), wishes: [wish] };
      const r = await refine(ctx, { party: 2 }, s.deps);
      expect(r.reply.cards.length).toBeGreaterThan(0);
      expect(cats(r.reply)).not.toContain('dessert');
      expect(r.reply.cards.every((c) => c.kind === 'restaurant' && !!c.reason)).toBe(true);
      expect(r.ctx.choice).toMatchObject({ member: 'all' });
    },
  );
});

describe('the AI wording of a turn answered without a new router call', () => {
  const wording = (req: ReplyReq) =>
    req.kind === 'food' ? 'Bornova tarafında güzel kebapçılar var.' : null;
  const clarifyKebab = () =>
    searchU({
      cat: 'meat',
      clarify: { ask: 'district', text: 'Hangi semtte arayayım?' },
    });

  it('uses the unused reply of the routed turn that asked', async () => {
    // The router is down for the answer: the rules read "Bornova" with the pending question.
    const s = screen([clarifyKebab(), down], wording);
    const asked = await s.send('kebap');
    expect(asked.ctx.replyId).toBe('u1');
    const r = await s.send('Bornova');
    expect(s.understand).toHaveBeenCalledTimes(2);
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect((s.reply.mock.calls[0]![0] as ReplyReq).messageId).toBe('u1');
    expect(r.reply.text).toContain('Bornova tarafında güzel kebapçılar var.');
    expect(r.reply.sparkle).toBe(true);
    expect(r.ctx.replyId).toBeUndefined();
  });

  it('keeps the template when that id already had its reply, and adds no sparkle', async () => {
    const s = screen([clarifyKebab(), down], wording, ['u1']);
    await s.send('kebap');
    const r = await s.send('Bornova');
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(r.reply.text).not.toContain('güzel kebapçılar');
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.sparkle).toBeFalsy();
  });

  it('a choice question already spent its reply: the typed answer keeps the template', async () => {
    const s = screen(
      [searchU({ nearMe: true, wishes: ['healthy'] })],
      () => 'Hangisinden başlayalım?',
    );
    const asked = await s.send('Fit menü');
    expect(asked.reply.text).toBe('Hangisinden başlayalım?');
    expect(asked.ctx.replyId).toBeUndefined();
    const r = await s.send('hepsi');
    expect(s.understand).toHaveBeenCalledTimes(1);
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(r.reply.sparkle).toBeFalsy();
  });

  it('a routed turn words itself with its own id, not the old one', async () => {
    const s = screen([clarifyKebab(), searchU({ district: 'Bornova', cat: 'meat' })], wording);
    await s.send('kebap');
    const r = await s.send('Bornova');
    expect((s.reply.mock.calls[0]![0] as ReplyReq).messageId).toBeUndefined();
    expect(r.reply.text).toContain('Bornova tarafında güzel kebapçılar var.');
  });
});

describe("the app's own name in a greeting", () => {
  const chat: AiResult<Understanding> = {
    ok: true,
    remaining: 8,
    value: { kind: 'chat', reply: 'Selam! Ne arıyoruz?', action: 'none' },
  };

  it.each(['merhaba yerim', 'selam yerim var', 'hey yerim', 'Merhaba Yerim Var'])(
    '"%s" is a greeting: the AI words it and the two chips show',
    async (text) => {
      const s = screen([chat], (req) =>
        req.kind === 'greeting' ? 'Selam! Park mı yemek mi?' : null,
      );
      const r = await s.send(text);
      expect(r.reply.text).toBe('Selam! Park mı yemek mi?');
      expect(labels(r.reply)).toEqual(['Otopark bul', 'Yemek bul']);
      expect(r.reply.cards).toEqual([]);
    },
  );

  it.each(['merhaba yerim', 'selam yerim var', 'hey yerim'])(
    '"%s" is a greeting without the AI too (no search, no "did not understand")',
    async (text) => {
      const s = screen([]);
      const r = await answer(text, emptyContext('food'), { ...s.deps, ai: undefined });
      expect(r.reply.cards).toEqual([]);
      // eslint-disable-next-line import/no-named-as-default-member
      expect(r.reply.text).not.toBe(i18n.t('chat.unknown_0'));
      // eslint-disable-next-line import/no-named-as-default-member
      expect(r.reply.text).not.toBe(i18n.t('chat.unknown_1'));
      expect(r.reply.actions.length).toBeGreaterThan(0);
    },
  );

  it('a real request that names the app is still a request', async () => {
    const s = screen([searchU({ cat: 'fish', nearMe: true })]);
    const r = await s.send('merhaba yerim yakınımda balık');
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });
});
