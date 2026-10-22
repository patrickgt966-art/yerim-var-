// The AI's wording of a reply: it replaces only the template lead, only when the router answered
// this message, only when validateReply accepts it, and never waits longer than REPLY_TIMEOUT_MS.
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import {
  REPLY_TIMEOUT_MS,
  type AiReplyFacts,
  type AiReplyKind,
  type Understanding,
} from '@/lib/ai/protocol';
import { walkMinFromMeters } from '@/lib/ai/verify';

import { answer, emptyContext, type AssistantDeps } from '../assistant';
import { staticParkings } from '../staticParkings';

const ALSANCAK = { lat: 38.4365, lng: 27.1437 };
const baseDeps: AssistantDeps = {
  here: async () => ALSANCAK,
  geocode: async () => null,
  parkings: staticParkings(),
  // eslint-disable-next-line import/no-named-as-default-member
  t: (k, o) => i18n.t(k, o) as string,
};

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
    nearMe: true,
    dishServes: null,
    ...over,
  },
});
const chatU = (reply: string): AiResult<Understanding> => ({
  ok: true,
  remaining: 8,
  value: { kind: 'chat', reply, action: 'none' },
});

type ReplyReq = { userText: string; kind: AiReplyKind; facts: AiReplyFacts };

/** A mocked AI layer: the router answers `routed`, the wording `wording` (or fails). */
function mockAi(
  routed: AiResult<Understanding>,
  wording?: (req: ReplyReq) => Promise<string | null>,
  extra: { usesLeft?: () => number } = {},
) {
  const understand = jest.fn(async () => routed);
  const reply = jest.fn(wording ?? (async () => null));
  const fail = async () => ({ ok: false, reason: 'error' });
  const deps: AssistantDeps = {
    ...baseDeps,
    ai: {
      understand,
      reply,
      pick: jest.fn(fail),
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
      ...extra,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { understand, reply, deps };
}

const sentOf = (reply: jest.Mock): ReplyReq => reply.mock.calls[0]![0] as ReplyReq;
const labels = (r: { actions: { label: string }[] }) => r.actions.map((a) => a.label);

describe('greeting', () => {
  const greeting = 'Selam! Otopark mu yemek mi bakıyorsun?';

  it('shows the AI greeting with the two chips', async () => {
    const { reply, understand, deps } = mockAi(chatU('Selam! Ne arıyoruz?'), async () => greeting);
    const r = await answer('Selam', emptyContext('park'), deps);
    expect(r.reply.text).toBe(greeting);
    expect(r.reply.sparkle).toBe(true);
    expect(r.reply.cards).toEqual([]);
    expect(labels(r.reply)).toEqual(['Otopark bul', 'Yemek bul']);
    // A chip is sent as a message: the existing flow (and its "where?" question) takes over.
    expect(r.reply.actions).toEqual([
      { kind: 'say', label: 'Otopark bul', text: 'Otopark bul' },
      { kind: 'say', label: 'Yemek bul', text: 'Yemek bul' },
    ]);
    expect(understand).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledTimes(1);
    const sent = sentOf(reply);
    expect(sent.kind).toBe('greeting');
    expect(sent.userText).toBe('Selam');
    expect(Object.keys(sent.facts)).toEqual(['daypart']);
  });

  it('a late, failed or invalid wording leaves the reply as it was without it', async () => {
    const plain = await answer(
      'Selam',
      emptyContext('park'),
      mockAi(chatU('Selam! Ne arıyoruz?')).deps,
    );
    expect(plain.reply.text).toBe('Selam! Ne arıyoruz?');
    expect(labels(plain.reply)).toEqual(['Otopark bul', 'Yemek bul']);
    for (const said of [null, 'Selam! Yakında 3 yer var.', 'Selam. Ben Yerim. Hoş geldin.']) {
      const { deps } = mockAi(chatU('Selam! Ne arıyoruz?'), async () => said);
      const r = await answer('Selam', emptyContext('park'), deps);
      expect(r.reply).toEqual(plain.reply);
    }
  });

  it('a rejected wording still offers the two jobs on a chat-routed hello', async () => {
    for (const q of ['Selamlar 🙂', 'nasılsın abi...', 'nasılsınız reis ✌️']) {
      const { deps } = mockAi(chatU('Selam! Ne arıyoruz?'), async () => null);
      const r = await answer(q, emptyContext('food'), deps);
      expect(labels(r.reply)).toEqual(['Otopark bul', 'Yemek bul']);
    }
  });

  it('thanks keeps its chips: not the two jobs', async () => {
    const { deps } = mockAi(chatU('Rica ederim!'), async () => null);
    const r = await answer('teşekkürler', emptyContext('park'), deps);
    expect(labels(r.reply)).not.toContain('Otopark bul');
    expect(r.reply.actions.length).toBeGreaterThan(0);
  });

  it('thanks and goodbye are not worded by /reply', async () => {
    const { reply, deps } = mockAi(chatU('Rica ederim!'), async () => greeting);
    await answer('teşekkürler', emptyContext('park'), deps);
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('no AI, no wording', () => {
  it('without the AI layer (no consent, AI off) the template greeting is shown, nothing is called', async () => {
    const r = await answer('Selam', emptyContext('park'), baseDeps);
    expect(r.reply.text).toMatch(/Selam/);
    expect(labels(r.reply)).toEqual(['Otopark bul', 'Yemek bul']);
  });

  it('when the router did not answer (no uses left) the wording is not asked for', async () => {
    const { reply, understand, deps } = mockAi(chatU('Selam!'), async () => 'Selam!', {
      usesLeft: () => 0,
    });
    const r = await answer('Selam', emptyContext('park'), deps);
    expect(understand).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(labels(r.reply)).toEqual(['Otopark bul', 'Yemek bul']);
  });

  it('when the router failed, nor is it', async () => {
    const { reply, deps } = mockAi(
      { ok: false, reason: 'error' },
      async () => 'Alsancak civarında yer var.',
    );
    await answer('balık', emptyContext('food'), deps);
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('a food turn', () => {
  const understood = searchU({ cat: 'fish', wishes: ['romantic'] });
  const aiText = (req: ReplyReq) =>
    `Konumun civarında ${req.facts.count} balıkçı var, en yakını ${req.facts.items![0]!.name}.`;

  it('words the lead from the shown cards and keeps the honest notes after it', async () => {
    const base = await answer('romantik balık', emptyContext('food'), mockAi(understood).deps);
    expect(base.reply.cards.length).toBeGreaterThan(0);
    const { reply, deps } = mockAi(understood, async (req) => aiText(req));
    const r = await answer('romantik balık', emptyContext('food'), deps);

    expect(reply).toHaveBeenCalledTimes(1);
    const sent = sentOf(reply);
    expect(sent.kind).toBe('food');
    expect(sent.userText).toBe('romantik balık');
    // The facts are what the cards show.
    const first = base.reply.cards.slice(0, 3);
    expect(sent.facts.items!.map((i) => i.name)).toEqual(first.map((c) => c.name));
    expect(sent.facts.items![0]!.walkMin).toBe(walkMinFromMeters(first[0]!.distanceM));
    expect(sent.facts).toMatchObject({ where: 'Konumun', requireParking: false, freeOnly: false });
    // No parking talk in a food turn that did not ask for it.
    for (const i of sent.facts.items!) {
      expect(i).not.toHaveProperty('parkWalkMin');
      expect(i).not.toHaveProperty('freeSpots');
    }
    expect(JSON.stringify(sent)).not.toMatch(/38\.4|27\.1|lat|lng/);

    expect(r.reply.cards).toEqual(base.reply.cards);
    // The AI text replaced the template lead; the lines after it (the no-menu note) stay.
    const tail = base.reply.text.split('\n').slice(1).join('\n');
    expect(tail).not.toBe('');
    expect(r.reply.text).toBe(`${aiText(sent)}\n${tail}`);
  });

  it('a wording with an invented name or number is dropped for the template', async () => {
    const base = await answer('balık', emptyContext('food'), mockAi(searchU({ cat: 'fish' })).deps);
    for (const said of [
      'Konumun civarında Sahil Lokantası var.',
      'Konumun civarında 999 balıkçı var.',
      'Konumun civarında ucuz balıkçı var.',
    ]) {
      const { reply, deps } = mockAi(searchU({ cat: 'fish' }), async () => said);
      const r = await answer('balık', emptyContext('food'), deps);
      expect(reply).toHaveBeenCalledTimes(1);
      expect(r.reply.text).toBe(base.reply.text);
    }
  });

  it('a wording that takes longer than REPLY_TIMEOUT_MS is dropped for the template', async () => {
    const base = await answer('balık', emptyContext('food'), mockAi(searchU({ cat: 'fish' })).deps);
    jest.useFakeTimers();
    try {
      const { deps } = mockAi(searchU({ cat: 'fish' }), () => new Promise(() => {}));
      const pending = answer('balık', emptyContext('food'), deps);
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);
      const r = await pending;
      expect(r.reply.text).toBe(base.reply.text);
      expect(r.reply.cards).toEqual(base.reply.cards);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a throwing wording is dropped for the template', async () => {
    const base = await answer('balık', emptyContext('food'), mockAi(searchU({ cat: 'fish' })).deps);
    const { deps } = mockAi(searchU({ cat: 'fish' }), async () => {
      throw new Error('boom');
    });
    const r = await answer('balık', emptyContext('food'), deps);
    expect(r.reply.text).toBe(base.reply.text);
  });

  it('with a car park asked for, the car park facts go along', async () => {
    const { reply, deps } = mockAi(
      searchU({ cat: 'fish', requireParking: true }),
      async () => null,
    );
    await answer('otoparklı balık', emptyContext('food'), deps);
    const sent = sentOf(reply);
    expect(sent.facts.requireParking).toBe(true);
    expect(sent.facts.items!.some((i) => i.parkWalkMin !== undefined)).toBe(true);
  });
});

describe('a car park turn', () => {
  it('words the lead; car park words are fine here', async () => {
    const understood = searchU({ food: false, cat: null, nearMe: true });
    const { reply, deps } = mockAi(understood, async (req) =>
      req.kind === 'park'
        ? `Konumun yakınında ${req.facts.count} otopark var, en yakını ${req.facts.items![0]!.name}.`
        : null,
    );
    const r = await answer('yakınımda otopark', emptyContext('park'), deps);
    const sent = sentOf(reply);
    expect(sent.kind).toBe('park');
    expect(sent.facts.parkSearch).toBe(true);
    expect(r.reply.text).toContain(`${sent.facts.count} otopark var`);
    expect(r.reply.cards.length).toBeGreaterThan(0);
  });

  it('nothing found: the AI may word the "nothing here" sentence', async () => {
    const far = { lat: 40.5, lng: 29.5 };
    const understood = searchU({ food: false, nearMe: false, place: 'Uzak Yer' });
    const base = mockAi(understood);
    base.deps.geocode = async () => far;
    const plain = await answer('Uzak Yer otopark', emptyContext('park'), base.deps);
    expect(plain.reply.cards).toEqual([]);

    const { reply, deps } = mockAi(understood, async (req) =>
      req.kind === 'none_found' ? 'Burada bir otopark göremedim.' : null,
    );
    deps.geocode = async () => far;
    const r = await answer('Uzak Yer otopark', emptyContext('park'), deps);
    expect(sentOf(reply).kind).toBe('none_found');
    expect(sentOf(reply).facts).toMatchObject({ count: 0, parkSearch: true });
    expect(r.reply.text).toBe('Burada bir otopark göremedim.');
    expect(r.reply.actions).toEqual(plain.reply.actions);
  });
});

describe('a choice question', () => {
  const understood = searchU({ food: true, nearMe: true });

  it('words the question; the chips stay as built', async () => {
    const base = await answer(
      'kaslıyım bana yer bul',
      emptyContext('food'),
      mockAi(understood).deps,
    );
    expect(base.ctx.ask).toBe('protein');
    const { reply, deps } = mockAi(
      understood,
      async () => 'Kasları doyuracak hangisinden başlayalım?',
    );
    const r = await answer('kaslıyım bana yer bul', emptyContext('food'), deps);
    const sent = sentOf(reply);
    expect(sent.kind).toBe('choice_question');
    expect(sent.facts.choices).toEqual(labels(base.reply));
    expect(r.reply.text).toBe('Kasları doyuracak hangisinden başlayalım?');
    expect(r.reply.actions).toEqual(base.reply.actions);
    expect(r.ctx.ask).toBe('protein');
  });

  it('an invalid wording keeps the template question', async () => {
    const base = await answer(
      'kaslıyım bana yer bul',
      emptyContext('food'),
      mockAi(understood).deps,
    );
    const { deps } = mockAi(understood, async () => 'Sana Köfteci Yusuf önerebilirim 250 TL.');
    const r = await answer('kaslıyım bana yer bul', emptyContext('food'), deps);
    expect(r.reply.text).toBe(base.reply.text);
  });
});

describe('answers that never go through the AI wording', () => {
  it('a typed answer to the question (no router call, no extra use) is not worded', async () => {
    const understood = searchU({ food: true, nearMe: true });
    const first = mockAi(understood);
    const q = await answer('kaslıyım bana yer bul', emptyContext('food'), first.deps);
    const { understand, reply, deps } = mockAi(
      understood,
      async () => 'Konumun civarında yer var.',
    );
    const r = await answer('hepsi', q.ctx, deps);
    expect(r.reply.cards.length).toBeGreaterThan(0);
    expect(understand).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});
