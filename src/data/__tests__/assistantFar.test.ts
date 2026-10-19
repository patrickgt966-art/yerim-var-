// A first result more than FAR_WALK_MIN minutes away is said to be far, and no text calls it near:
// the template note, the AI pick line, the facts sent for the AI wording and validateReply.
import '@/i18n';
import i18n from 'i18next';

import type { AiResult } from '@/lib/ai/client';
import { validateReply } from '@/lib/ai/replyCheck';
import {
  FAR_WALK_MIN,
  type AiReplyFacts,
  type AiReplyKind,
  type PickCandidate,
  type Understanding,
} from '@/lib/ai/protocol';
import { walkMinFromMeters } from '@/lib/ai/verify';

import { answer, emptyContext, refine, type AssistantDeps, type ChatContext } from '../assistant';
import { activeCity } from '../cities';
import { staticParkings } from '../staticParkings';

const ALSANCAK = { lat: 38.4365, lng: 27.1437 };
/** What would call a result near (the convo eval's list). */
const NEAR = /\ben yak[ıi]n|\byak[ıi]nda\b|hemen yan[ıi]nda|nearby|closest|nearest/i;

// eslint-disable-next-line import/no-named-as-default-member
const t: AssistantDeps['t'] = (k, o) => i18n.t(k, o) as string;
const baseDeps: AssistantDeps = {
  here: async () => ALSANCAK,
  geocode: async () => null,
  parkings: staticParkings(),
  t,
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

type ReplyReq = { userText: string; kind: AiReplyKind; facts: AiReplyFacts };

function mockAi(
  routed: AiResult<Understanding>,
  extra: {
    wording?: (req: ReplyReq) => string | null;
    pick?: (req: { candidates: PickCandidate[] }) => unknown;
  } = {},
  over: Partial<AssistantDeps> = {},
) {
  const reply = jest.fn(async (req: ReplyReq) => extra.wording?.(req) ?? null);
  const fail = async () => ({ ok: false, reason: 'error' });
  const pick = jest.fn(extra.pick ? async (req: never) => extra.pick!(req) : fail);
  const deps: AssistantDeps = {
    ...baseDeps,
    ...over,
    ai: {
      understand: jest.fn(async () => routed),
      reply,
      pick,
      plan: jest.fn(fail),
      pickPark: jest.fn(fail),
      quotaNotice: () => true,
    } as unknown as NonNullable<AssistantDeps['ai']>,
  };
  return { reply, pick, deps };
}

const walk = (m: number) => walkMinFromMeters(m);

describe('a food list that starts far away', () => {
  it('Bayraklı midye (rules): says the first place is far, in one sentence, and never calls it near', async () => {
    const r = await answer('Bayraklı midye', emptyContext('food'), baseDeps);
    const min = walk(r.reply.cards[0]!.distanceM);
    expect(min).toBeGreaterThan(FAR_WALK_MIN);
    const lines = r.reply.text.split('\n');
    expect(lines[0]).toContain(`~${min} dk yürüme`);
    expect(lines[0]).toContain('uzak');
    expect(r.reply.text).not.toMatch(NEAR);
    expect(r.reply.text).not.toContain('yakında az yer');
  });

  it('merges with the "looked wider" note: one sentence, not two', async () => {
    const r = await answer('Bornova kumpir', emptyContext('food'), baseDeps);
    const min = walk(r.reply.cards[0]!.distanceM);
    expect(min).toBeGreaterThan(FAR_WALK_MIN);
    expect(r.reply.text).toContain(`geniş alanda baktım; ilk sıradaki ~${min} dk yürüme`);
    expect(r.reply.text).not.toContain('biraz daha geniş baktım');
    expect(r.reply.text).not.toMatch(NEAR);
  });

  it('a near list gets no far note', async () => {
    const r = await answer('Alsancak köfte', emptyContext('food'), baseDeps);
    expect(walk(r.reply.cards[0]!.distanceM)).toBeLessThanOrEqual(FAR_WALK_MIN);
    expect(r.reply.text).not.toContain('uzakta');
  });

  it('the facts for the AI wording say far, and a near-word wording is dropped', async () => {
    const routed = searchU({ cat: 'fast', dish: 'kumpir', district: 'Bornova' });
    const nearWord = mockAi(routed, { wording: () => 'Kumpir için yakında birkaç yer buldum.' });
    const r = await answer('Bornova kumpir', emptyContext('food'), nearWord.deps);
    const sent = nearWord.reply.mock.calls[0]![0] as ReplyReq;
    expect(sent.facts.far).toBe(true);
    expect(sent.facts.farWalkMin).toBe(walk(r.reply.cards[0]!.distanceM));
    expect(r.reply.text).not.toContain('Kumpir için yakında');
    expect(r.reply.text).toContain('uzaklıkta');

    const honest = mockAi(routed, { wording: () => 'Kumpir için birkaç yer buldum, ama uzak.' });
    const ok = await answer('Bornova kumpir', emptyContext('food'), honest.deps);
    expect(ok.reply.text).toContain('Kumpir için birkaç yer buldum, ama uzak.');
    // The far note stays in front of the AI's words.
    expect(ok.reply.text.split('\n')[0]).toContain('uzaklıkta');
  });

  it('a goal chip tap with a 60+ minute top place says it is far', async () => {
    const d = activeCity().districtCenters.find((x) => x.name === 'Aliağa')!;
    const place = { label: 'Uzak', lat: d.lat + 0.05, lng: d.lng + 0.05 };
    const ctx: ChatContext = {
      ...emptyContext('food'),
      place,
      ask: 'protein',
      wishes: ['protein'],
    };
    const r = await refine(
      ctx,
      { choice: { id: 'protein', member: 'all' }, ask: undefined },
      baseDeps,
    );
    const min = walk(r.reply.cards[0]!.distanceM);
    expect(min).toBeGreaterThan(60);
    expect(r.reply.text).toContain(`~${min} dk yürüme`);
    expect(r.reply.text).toContain('uzak');
    expect(r.reply.text).not.toMatch(NEAR);
  });

  it('the "daha yakın" follow-up does not promise nearest-first on a far list', async () => {
    const first = await answer('Bornova kumpir', emptyContext('food'), baseDeps);
    const r = await answer('daha yakın', first.ctx, baseDeps);
    expect(walk(r.reply.cards[0]!.distanceM)).toBeGreaterThan(FAR_WALK_MIN);
    expect(r.reply.text).not.toMatch(NEAR);
  });
});

describe('the AI pick line on a far list', () => {
  it('words the reason neutrally above FAR_WALK_MIN minutes, and as before below', async () => {
    const closest = async (req: { candidates: PickCandidate[] }) => {
      const best = [...req.candidates].sort((a, b) => a.walkMin - b.walkMin)[0]!;
      return {
        ok: true,
        remaining: 8,
        value: {
          pick: best.i,
          reasons: ['closest'],
          runnerUp: null,
          runnerUpWhy: null,
          tone: null,
          fit: [],
          noneFit: false,
        },
      };
    };
    const farRun = mockAi(searchU({ district: 'Bornova', cat: 'fast', dish: 'kumpir' }), {
      pick: closest,
    });
    const far = await answer('Bornova kumpir', emptyContext('food'), farRun.deps);
    expect(far.reply.text).toContain('Benim seçimim');
    expect(far.reply.text).toContain('yürüme süresi en kısa olan');
    expect(far.reply.text).not.toMatch(NEAR);

    const nearRun = mockAi(searchU({ nearMe: true, cat: 'meat' }), {
      pick: closest,
    });
    const near = await answer('yakınımda et', emptyContext('food'), nearRun.deps);
    expect(nearRun.pick).toHaveBeenCalled();
    expect(near.reply.text).toContain('en yakın olanı');
  });
});

describe('a car park list that starts ~21 minutes away', () => {
  const base = staticParkings()[0]!;
  // One car park 1300 m from the searched point: ~21 minutes on foot.
  const point = { lat: base.lat + 1300 / 111_320, lng: base.lng };
  const lonely: AssistantDeps['parkings'] = [
    { ...base, id: 'only-far', name: 'Uzak Otopark', free: null },
  ];
  const routed = searchU({ food: false, place: 'Uzak Yer' });

  it('says it is far in the template and sends far + minutes in the facts', async () => {
    const { reply, deps } = mockAi(routed, {}, { parkings: lonely, geocode: async () => point });
    const r = await answer('Uzak Yer otopark', emptyContext('park'), deps);
    const min = walk(r.reply.cards[0]!.distanceM);
    expect(min).toBeGreaterThan(FAR_WALK_MIN);
    expect(r.reply.text).toContain(`~${min} dk yürüme`);
    expect(r.reply.text).toContain('uzakta');
    expect(r.reply.text).not.toMatch(NEAR);
    const sent = reply.mock.calls[0]![0] as ReplyReq;
    expect(sent.facts).toMatchObject({ parkSearch: true, far: true, farWalkMin: min });
  });
});

describe('validateReply and far results', () => {
  const far: AiReplyFacts = {
    where: 'Bornova',
    count: 4,
    far: true,
    farWalkMin: 48,
    items: [{ name: 'Kumpirci Ali', walkMin: 48 }],
  };
  const near: AiReplyFacts = {
    where: 'Bornova',
    count: 4,
    items: [{ name: 'Kumpirci Ali', walkMin: 5 }],
  };

  it.each([
    'Yakında birkaç yer var.',
    'En yakını Kumpirci Ali.',
    'Hemen yanında bir yer buldum.',
    'There are some places nearby.',
    'The closest one is Kumpirci Ali.',
  ])('rejects "%s" when a result is far', (text) => {
    expect(validateReply(text, far)).toBeNull();
    // A far item alone is enough, without the flag.
    expect(validateReply(text, { ...far, far: undefined })).toBeNull();
  });

  it('accepts the same words when everything is near, and an honest far text', () => {
    expect(validateReply('Yakında birkaç yer var.', near)).toBe('Yakında birkaç yer var.');
    expect(validateReply('Biraz uzakta, ilkine ~48 dk yürürsün.', far)).toBe(
      'Biraz uzakta, ilkine ~48 dk yürürsün.',
    );
  });

  it('knows the minutes of the far flag as a fact number', () => {
    expect(
      validateReply('İlk yer 48 dakika uzakta.', { where: 'Bornova', far: true, farWalkMin: 48 }),
    ).not.toBeNull();
  });
});
