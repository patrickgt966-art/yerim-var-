import { CHOICES, memberLabel } from '../choices';
import { CITIES, cityById } from '../cities';
import {
  CONVO_CASES,
  CONVO_CATEGORIES,
  CONVO_KINDS,
  CONVO_SEED,
  CORE_DISTRICTS,
  GREET_CHIPS,
  HEPSI,
  KIND_TAP,
  TAPPABLE_LABELS,
  buildConvoCases,
  casesOf,
  citiesOf,
  sampleCases,
  type ConvoCase,
} from '../eval/convoCases';
import { CITY_IDS } from '../eval/aiBigCases';
import { quartersOf } from '../quarters';
import { FOOD_CATEGORIES } from '../restaurants';
import { fold } from '../search';
import { MAX_MESSAGE_CHARS, WISHES } from '@/lib/ai/protocol';

const count = (category: string) => CONVO_CASES.filter((c) => c.category === category).length;

describe('the conversation eval cases', () => {
  it('has about 550 conversations of 1-4 user turns with unique names', () => {
    expect(CONVO_CASES.length).toBeGreaterThanOrEqual(540);
    expect(CONVO_CASES.length).toBeLessThanOrEqual(575);
    expect(new Set(CONVO_CASES.map((c) => c.name)).size).toBe(CONVO_CASES.length);
    const lengths = new Set(CONVO_CASES.map((c) => c.turns.length));
    expect([...lengths].sort()).toEqual([1, 2, 3, 4]);
    for (const c of CONVO_CASES) {
      expect(c.turns.length).toBeGreaterThanOrEqual(1);
      expect(c.turns.length).toBeLessThanOrEqual(4);
      expect(c.name.startsWith(`${c.category}: `)).toBe(true);
    }
  });

  it('is deterministic, and another seed asks other things', () => {
    expect(buildConvoCases()).toEqual(buildConvoCases(CONVO_SEED));
    expect(buildConvoCases()).toEqual(CONVO_CASES);
    const other = buildConvoCases(CONVO_SEED + 1);
    expect(other).not.toEqual(CONVO_CASES);
    expect(other.length).toBeGreaterThanOrEqual(540);
  });

  it('has every category, each with a real share of the mix', () => {
    for (const category of CONVO_CATEGORIES) {
      expect(count(category)).toBeGreaterThanOrEqual(15);
      expect(casesOf(category)).toHaveLength(count(category));
    }
    expect(CONVO_CASES.every((c) => CONVO_CATEGORIES.includes(c.category))).toBe(true);
    expect(casesOf(undefined)).toBe(CONVO_CASES);
    // The biggest groups are the everyday asks; the smallest still count.
    expect(count('food')).toBeGreaterThan(count('greeting'));
    expect(count('park') + count('both')).toBeGreaterThanOrEqual(70);
    expect(count('choice') + count('narrow')).toBeGreaterThanOrEqual(90);
  });

  it('spreads over the five cities, with every kind of turn', () => {
    for (const city of CITY_IDS) {
      expect(CONVO_CASES.filter((c) => c.city === city).length).toBeGreaterThanOrEqual(80);
    }
    const inputs = CONVO_CASES.flatMap((c) => c.turns.map((t) => t.input.type));
    for (const type of ['say', 'tap', 'answer', 'directions']) expect(inputs).toContain(type);
    const kinds = new Set(CONVO_CASES.flatMap((c) => c.turns.map((t) => t.expect.kind)));
    for (const kind of CONVO_KINDS) expect(kinds.has(kind)).toBe(true);
    expect(CONVO_CASES.some((c) => citiesOf(c).length > 1)).toBe(true);
  });

  it('writes messages that fit in one, in many styles', () => {
    const typed = CONVO_CASES.flatMap((c) =>
      c.turns.flatMap((t) => (t.input.type === 'say' ? [t.input.text] : [])),
    );
    for (const text of typed) {
      expect(text.trim()).not.toBe('');
      expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      expect(text).not.toMatch(/undefined|\{[A-Z]+\}/);
    }
    expect(typed.some((t) => /\p{Extended_Pictographic}/u.test(t))).toBe(true);
    expect(typed.some((t) => /\b(where|best|near me|please|hungry)\b/i.test(t))).toBe(true);
    expect(typed.some((t) => /[ğüşıöç]/i.test(t))).toBe(true);
    expect(typed.some((t) => !/[ğüşıöç]/i.test(t) && /\b(nerde|nerede)\b/.test(t))).toBe(true);
    expect(typed.some((t) => /önceki (tüm )?talimat|ignore/i.test(t))).toBe(true);
  });

  it('asks every conversation only once', () => {
    const keys = CONVO_CASES.map((c) => `${c.city}|${c.turns.map((t) => t.input.text).join('|')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

function checkExpectations(c: ConvoCase): void {
  expect(CITIES.find((x) => x.id === c.city)?.available).toBe(true);
  expect(['park', 'food']).toContain(c.section);
  expect(Number.isInteger(c.hour)).toBe(true);
  expect(c.hour).toBeGreaterThanOrEqual(0);
  expect(c.hour).toBeLessThanOrEqual(23);
  expect(c.turns[0]?.input.type).toBe('say');

  let city: string = c.city;
  let asked = false;
  for (const { input, expect: e } of c.turns) {
    expect(input.text.trim()).not.toBe('');
    if (input.type === 'say' && input.city) {
      expect(CITIES.find((x) => x.id === input.city)?.available).toBe(true);
      expect(input.city).not.toBe(city);
      city = input.city;
    }
    // A tap names a chip of the last reply; a typed answer follows Yerim's question.
    if (input.type === 'tap') {
      expect(TAPPABLE_LABELS.includes(input.text) || KIND_TAP.test(input.text)).toBe(true);
    }
    if (input.type === 'answer') expect(asked).toBe(true);
    asked = e.kind === 'choice' || e.parkAsk === 'question';

    expect(CONVO_KINDS).toContain(e.kind);
    for (const cat of e.cat ?? []) {
      if (cat !== null) expect(FOOD_CATEGORIES).toContain(cat);
    }
    expect(e.cat === undefined || e.cat.length > 0).toBe(true);
    for (const w of e.wishes ?? []) expect(WISHES).toContain(w);
    for (const w of e.dishHas ?? []) expect(fold(w)).toBe(w);
    for (const id of e.ask ?? []) expect(CHOICES.map((x) => x.id)).toContain(id);
    if (e.member) {
      const members = CHOICES.flatMap((x) => x.members.map((m) => m.id));
      expect([...members, 'all']).toContain(e.member);
    }
    for (const chip of [...(e.chips ?? []), ...(e.noChips ?? [])]) {
      expect(TAPPABLE_LABELS).toContain(chip);
    }
    if (e.chipsMin !== undefined) expect(e.chipsMin).toBeGreaterThan(0);
    for (const frag of [...(e.place ?? []), ...(e.placeHas ?? []), ...(e.nameCard ?? [])]) {
      expect(frag.trim()).not.toBe('');
    }
    // A place the city knows: one of its districts, or one of its quarters.
    const known = [...cityById(city).districts, ...quartersOf(city).map((q) => q.n)].map(fold);
    for (const p of e.place ?? []) expect(known).toContain(fold(p));
    expect(e.nearMe === true && e.place !== undefined).toBe(false);
    expect(e.cards === 'none' && (e.nameCard !== undefined || e.cardKind !== undefined)).toBe(
      false,
    );
    // The kinds that show results do not forbid them; talk shows none.
    if (e.kind === 'offtopic' || e.kind === 'none' || e.kind === 'choice') {
      expect(e.cards === 'some').toBe(false);
    }
    if (e.kind === 'name' && e.nameCard) expect(e.cards).toBe('some');
    if (e.note) expect(['food', 'park']).toContain(e.kind);
  }
}

describe('the expectations of every conversation', () => {
  it('only name valid fields, places of the city and chips that exist', () => {
    for (const c of CONVO_CASES) checkExpectations(c);
  });

  it('expects the greeting chips of a hello and none after thanks', () => {
    const greetings = casesOf('greeting');
    for (const c of greetings) expect(c.turns[0]?.expect.chips).toEqual(GREET_CHIPS);
    for (const c of casesOf('thanks_bye')) {
      const last = c.turns[c.turns.length - 1]!;
      expect(last.expect.kind).toBe('greeting');
      expect(last.expect.noChips).toEqual(GREET_CHIPS);
    }
    // A chip tapped after a hello is the job of the chat the user opened.
    for (const c of greetings) {
      const t = c.turns[1];
      if (!t) continue;
      expect(t.input.type).toBe('tap');
      expect(t.input.text).toBe(c.section === 'food' ? GREET_CHIPS[1] : GREET_CHIPS[0]);
    }
  });

  it('asks broad requests with "Hepsi" and a typed or tapped answer', () => {
    const choices = casesOf('choice').filter((c) => c.turns[0]?.expect.kind === 'choice');
    expect(choices.length).toBeGreaterThanOrEqual(50);
    for (const c of choices) {
      const q = c.turns[0]!.expect;
      expect(q.hepsi).toBe(true);
      expect(q.cards).toBe('none');
      expect(q.chipsMin).toBeGreaterThanOrEqual(2);
      expect(c.turns[1]?.expect.kind).toBe('food');
    }
    const types = choices.map((c) => c.turns[1]!.input.type);
    expect(types).toContain('tap');
    expect(types).toContain('answer');
    // Goals with a category: no question, the honest note.
    const goalCats = casesOf('choice').filter((c) => c.turns[0]?.expect.kind === 'food');
    expect(goalCats.length).toBeGreaterThanOrEqual(10);
    for (const c of goalCats) expect(c.turns[0]!.expect.note).toBe(true);
  });

  it('forces wide searches in small districts of every city', () => {
    const far = casesOf('far');
    expect(far.length).toBeGreaterThanOrEqual(15);
    for (const city of CITY_IDS) {
      expect(far.filter((c) => c.city === city).length).toBeGreaterThanOrEqual(3);
    }
    for (const c of far) {
      const core = (CORE_DISTRICTS[c.city] ?? []).map(fold);
      for (const t of c.turns)
        for (const p of t.expect.place ?? []) expect(core).not.toContain(fold(p));
    }
    expect(far.some((c) => c.turns[0]?.expect.kind === 'choice')).toBe(true);
    expect(far.some((c) => c.turns[0]?.expect.dishHas)).toBe(true);
  });

  it('puts the honest note on every no-data wish', () => {
    for (const c of casesOf('no_data')) {
      const last = c.turns[c.turns.length - 1]!;
      expect(last.expect.note).toBe(true);
      expect(last.expect.wishes?.length).toBeGreaterThan(0);
    }
  });

  it('keeps the dense districts real and uses only them where results are certain', () => {
    for (const city of CITY_IDS) {
      const all = cityById(city).districts.map(fold);
      for (const d of CORE_DISTRICTS[city] ?? []) expect(all).toContain(fold(d));
    }
    // Where a result is certain, the place is a dense district or a quarter (never a small one).
    // (the far asks are the exception: small districts, checked against the data.)
    for (const c of CONVO_CASES.filter((x) => x.category !== 'far')) {
      let city: string = c.city;
      for (const t of c.turns) {
        if (t.input.type === 'say' && t.input.city) city = t.input.city;
        const place = t.expect.place?.[0];
        if (t.expect.cards !== 'some' || place === undefined) continue;
        const core = (CORE_DISTRICTS[city] ?? []).map(fold);
        const quarters = quartersOf(city).map((q) => fold(q.n));
        expect(core.includes(fold(place)) || quarters.includes(fold(place))).toBe(true);
      }
    }
  });

  it('has ten conversations of the parking offer after "Yol tarifi"', () => {
    const flow = CONVO_CASES.filter((c) => c.turns.some((t) => t.input.type === 'directions'));
    expect(flow).toHaveLength(10);
    const asks = flow.filter((c) => c.turns[1]?.expect.parkAsk === 'question');
    // Seven food asks without parking: the question, then a chip or a typed yes / no.
    expect(asks).toHaveLength(7);
    for (const c of asks) {
      expect(c.turns[0]!.expect).toMatchObject({ requireParking: false, parkShown: false });
      expect(c.turns[1]!.expect.cards).toBe('none');
      expect(['cars', 'directions']).toContain(c.turns[2]!.expect.parkAsk);
    }
    expect(asks.map((c) => c.turns[2]!.input.type)).toEqual(
      expect.arrayContaining(['tap', 'answer']),
    );
    expect(asks.map((c) => c.turns[2]!.expect.parkAsk)).toEqual(
      expect.arrayContaining(['cars', 'directions']),
    );
    // Three asks with parking: the card keeps its car park and the map opens, no question.
    const parked = flow.filter((c) => !c.turns.some((t) => t.expect.parkAsk === 'question'));
    expect(parked).toHaveLength(3);
    for (const c of parked) expect(c.turns.some((t) => t.expect.parkShown === true)).toBe(true);
  });

  it('names real places from the data and the member chips of choices.ts', () => {
    const names = casesOf('name');
    expect(names.length).toBeGreaterThanOrEqual(40);
    const exact = names.filter((c) => c.turns[0]?.expect.nameCard);
    expect(exact.length).toBeGreaterThanOrEqual(15);
    const labels = CHOICES.flatMap((e) => e.members.map((m) => memberLabel(m, 'tr')));
    expect(labels).toContain('Balık');
    expect(TAPPABLE_LABELS).toContain(HEPSI);
  });
});

describe('--limit sampling', () => {
  const names = (cs: ConvoCase[]) => cs.map((c) => c.name);

  it('covers every category in a small run, and takes all when the limit is not below the count', () => {
    const picked = sampleCases(CONVO_CASES, 30, CONVO_SEED);
    expect(picked).toHaveLength(30);
    expect(new Set(names(picked)).size).toBe(30);
    for (const category of CONVO_CATEGORIES) {
      expect(picked.some((c) => c.category === category)).toBe(true);
    }
    expect(sampleCases(CONVO_CASES, CONVO_CASES.length, CONVO_SEED)).toBe(CONVO_CASES);
  });

  it('is the same for the same seed and differs for another', () => {
    expect(names(sampleCases(CONVO_CASES, 30, 7))).toEqual(names(sampleCases(CONVO_CASES, 30, 7)));
    expect(names(sampleCases(CONVO_CASES, 30, 7))).not.toEqual(
      names(sampleCases(CONVO_CASES, 30, 8)),
    );
  });

  it('samples inside the --only filter', () => {
    const only = casesOf('food');
    const picked = sampleCases(only, 5, CONVO_SEED);
    expect(picked).toHaveLength(5);
    expect(picked.every((c) => c.category === 'food')).toBe(true);
  });
});

describe('emoji asks', () => {
  it('accept dürüm as well as döner for 🥙', () => {
    const turns = [CONVO_SEED, CONVO_SEED + 1, CONVO_SEED + 2, CONVO_SEED + 3]
      .flatMap((seed) => buildConvoCases(seed))
      .flatMap((c) => c.turns)
      .filter((turn) => turn.input.type === 'say' && turn.input.text.includes('🥙'));
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) expect(turn.expect.dishHas).toEqual(['doner', 'durum']);
  });
});
