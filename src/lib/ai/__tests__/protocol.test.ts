import { CITIES } from '@/data/cities';

import {
  chatSystem,
  CitySchema,
  CHAT_SYSTEM,
  fillPlaceholders,
  isGroundedReply,
  narrateSystem,
  parkPickSystem,
  pickSystem,
  planSystem,
  todayIstanbul,
  understandSystem,
  UNDERSTAND_SYSTEM,
} from '../protocol';

describe('fillPlaceholders', () => {
  it('replaces {n} with the n-th name', () => {
    expect(fillPlaceholders('{1} ve {2} yakın', ['Ada', 'Bora'])).toBe('Ada ve Bora yakın');
  });
});

describe('isGroundedReply', () => {
  it('accepts a grounded reply', () => {
    expect(isGroundedReply('Tabi hocam! {1} otoparka 90 m, {2} de yakın.', [90], 2)).toBe(true);
  });

  it('rejects a number that is not allowed', () => {
    expect(isGroundedReply('Tabi hocam! {1} otoparka 95 m.', [90], 2)).toBe(false);
  });

  it('rejects a placeholder beyond the result count', () => {
    expect(isGroundedReply('Tabi hocam! {1} ve {3} yakın.', [90], 2)).toBe(false);
  });

  it('rejects blocked words', () => {
    expect(isGroundedReply('{1} puanı yüksek.', [], 2)).toBe(false);
    expect(isGroundedReply('{1} için 150 TL', [150], 2)).toBe(false);
  });

  describe('fact-gated words', () => {
    const none = { anyOpen: false, anyClosed: false, anyFree: false };

    it('allows "açık" only when a result is open', () => {
      const reply = '{1} şu an açık.';
      expect(isGroundedReply(reply, [], 2)).toBe(false);
      expect(isGroundedReply(reply, [], 2, none)).toBe(false);
      expect(isGroundedReply(reply, [], 2, { ...none, anyClosed: true })).toBe(false);
      expect(isGroundedReply(reply, [], 2, { ...none, anyOpen: true })).toBe(true);
    });

    it('allows "kapalı" only when a result is closed', () => {
      const reply = '{1} şu an kapalı.';
      expect(isGroundedReply(reply, [], 2, none)).toBe(false);
      expect(isGroundedReply(reply, [], 2, { ...none, anyOpen: true })).toBe(false);
      expect(isGroundedReply(reply, [], 2, { ...none, anyClosed: true })).toBe(true);
    });

    it('allows "boş yer" and "dolu" only with a free-space count', () => {
      expect(isGroundedReply('{1} yanında 7 boş yer var.', [7], 2, none)).toBe(false);
      expect(
        isGroundedReply('{1} yanında 7 boş yer var.', [7], 2, { ...none, anyFree: true }),
      ).toBe(true);
      expect(isGroundedReply('{1} dolu.', [], 2, none)).toBe(false);
      expect(isGroundedReply('{1} dolu.', [], 2, { ...none, anyFree: true })).toBe(true);
    });

    it('never allows price words, whatever the facts', () => {
      const all = { anyOpen: true, anyClosed: true, anyFree: true };
      expect(isGroundedReply('{1} fiyatı uygun.', [], 2, all)).toBe(false);
      expect(isGroundedReply('{1} ucuz.', [], 2, all)).toBe(false);
      expect(isGroundedReply('{1} için saat 5.', [], 2, all)).toBe(false);
    });
  });

  it('rejects replies over 400 characters', () => {
    expect(isGroundedReply('a'.repeat(401), [], 2)).toBe(false);
  });
});

describe('todayIstanbul', () => {
  it('uses UTC+3', () => {
    expect(todayIstanbul('2026-10-09T22:30:00Z')).toBe('2026-10-10');
    expect(todayIstanbul(new Date('2026-10-09T20:59:00Z'))).toBe('2026-10-09');
  });
});

describe('city in the system prompts', () => {
  const all = [understandSystem, narrateSystem, pickSystem, parkPickSystem, planSystem, chatSystem];

  it('names İstanbul for istanbul and never İzmir', () => {
    for (const make of all) {
      const text = make('istanbul');
      expect(text).toContain('İstanbul');
      expect(text).not.toContain('İzmir');
    }
    expect(chatSystem('istanbul')).toContain("İstanbul'da yemek");
  });

  it('says İzmir for izmir, for no city and for an unknown one', () => {
    for (const make of all) {
      expect(make('izmir')).toContain('İzmir');
      expect(make()).toBe(make('izmir'));
      expect(make('nowhere')).toBe(make('izmir'));
      expect(make('ankara')).toBe(make('izmir'));
    }
    expect(UNDERSTAND_SYSTEM).toBe(understandSystem('izmir'));
    expect(CHAT_SYSTEM).toContain("İzmir'de yemek");
  });

  it('does not call the district an İzmir district', () => {
    expect(understandSystem('istanbul')).toContain('şehrin ilçesi');
  });
});

describe('CitySchema', () => {
  it('accepts exactly the open cities', () => {
    for (const c of CITIES) expect(CitySchema.safeParse(c.id).success).toBe(c.available);
    expect(CitySchema.safeParse('atlantis').success).toBe(false);
  });
});
