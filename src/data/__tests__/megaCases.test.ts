import { CHOICES, KINDS } from '../choices';
import { CITIES, cityById } from '../cities';
import { foodFile } from '../cityData';
import { cleanName } from '../names';
import { quartersOf } from '../quarters';
import { FOOD_CATEGORIES } from '../restaurants';
import { fold } from '../search';
import { CITY_IDS } from '../eval/aiBigCases';
import {
  CLAIM_KINDS,
  CONVO_KINDS,
  KIND_TAP,
  TAPPABLE_LABELS,
  sampleCases,
  type ConvoCase,
} from '../eval/convoCases';
import {
  MEGA_CASES,
  MEGA_CATEGORIES,
  MEGA_SEED,
  TIMES_OF_DAY,
  buildMegaCases,
  megaCasesOf,
  parseShard,
  shardOf,
  timeOfDay,
  type MegaCase,
} from '../eval/megaCases';
import { wordCount } from '../eval/megaText';
import { MAX_MESSAGE_CHARS, WISHES } from '@/lib/ai/protocol';

/** The subcategories every category must have (the report's "by subcategory" table). */
const SUBS: Record<string, string[]> = {
  style: [
    'slang',
    'ascii',
    'caps',
    'emoji_only',
    'emoji_district',
    'voice',
    'typo',
    'rambling',
    'english',
    'german',
    'arabic',
    'mixed',
    'abbrev',
  ],
  multi: [
    'change_mind',
    'negation',
    'refine',
    'district_switch',
    'city_switch',
    'backref',
    'thanks_then_new',
    'greeting_mid',
    'chips_mixed',
    'goal_chips',
    'directions_flow',
    'directions_parked',
  ],
  goals: [
    'kas',
    'diyet',
    'kilo_vermek',
    'kilo_almak',
    'hizli',
    'tatli',
    'hasta',
    'aksamdan_kalma',
    'sicak_hava',
    'soguk_hava',
    'yagmur',
    'ilk_bulusma',
    'yildonumu',
    'is_yemegi',
    'cocuklu',
    'kalabalik',
    'mac_sonrasi',
    'kutlama',
    'misafir',
    'yoresel',
    'gece_gec',
    'vejetaryen',
    'vegan',
    'glutensiz',
  ],
  parking: [
    'free',
    'covered',
    'nonstop',
    'disabled',
    'motorcycle',
    'big_vehicle',
    'overnight',
    'rail',
    'near_stadium',
    'near_hospital',
    'near_airport',
    'near_landmark',
    'live_spots',
    'live_spots_no_data',
    'ev_charging',
    'price',
    'duration',
  ],
  dishes: [
    'regional',
    'drinks_desserts',
    'breakfast',
    'world',
    'cuisine',
    'nowhere_near',
    'made_up',
    'ambiguous',
    'name_exact',
    'name_typo',
  ],
  honesty: [
    'best',
    'rating',
    'price',
    'menu',
    'phone',
    'hours',
    'reservation',
    'guarantee',
    'injection_inline',
    'injection_pure',
    'jailbreak',
    'personal',
    'medical_legal',
    'politics',
    'scope_city',
    'scope_thing',
  ],
  plans: [
    'evening_plan',
    'drive_in',
    'park_then_eat',
    'party_size',
    'time_words',
    'walk_less',
    'plan_flow',
  ],
  edge: [
    'nothing',
    'numbers',
    'url',
    'long_text',
    'repeat',
    'dotted_i',
    'district_word',
    'other_city',
    'no_location',
    'noisy',
  ],
};

const inCategory = (category: string) => MEGA_CASES.filter((c) => c.category === category);
const textsOf = (c: ConvoCase<string>) =>
  c.turns.flatMap((t) => (t.input.type === 'say' ? [t.input.text] : []));

describe('the mega conversation eval cases', () => {
  it('has about 3000 conversations with unique names, each in a category and a subcategory', () => {
    expect(MEGA_CASES.length).toBeGreaterThanOrEqual(2800);
    expect(MEGA_CASES.length).toBeLessThanOrEqual(3300);
    expect(new Set(MEGA_CASES.map((c) => c.name)).size).toBe(MEGA_CASES.length);
    for (const c of MEGA_CASES) {
      expect(MEGA_CATEGORIES).toContain(c.category);
      expect(c.name.startsWith(`${c.category}: `)).toBe(true);
      expect(c.sub.trim()).not.toBe('');
      expect(c.style.trim()).not.toBe('');
      expect(['tr', 'en']).toContain(c.ui);
      expect(typeof c.located).toBe('boolean');
      expect(c.turns.length).toBeGreaterThanOrEqual(1);
      expect(c.turns.length).toBeLessThanOrEqual(8);
    }
    expect(megaCasesOf(undefined)).toBe(MEGA_CASES);
    expect(megaCasesOf('edge')).toEqual(inCategory('edge'));
  });

  it('is deterministic per seed, and another seed asks other things', () => {
    expect(buildMegaCases()).toEqual(buildMegaCases(MEGA_SEED));
    expect(buildMegaCases()).toEqual(MEGA_CASES);
    const other = buildMegaCases(MEGA_SEED + 1);
    expect(other).not.toEqual(MEGA_CASES);
    expect(other.length).toBeGreaterThanOrEqual(2800);
    expect(other.length).toBeLessThanOrEqual(3300);
  });

  it('has every category with its share, and every subcategory', () => {
    const share: Record<string, [number, number]> = {
      style: [350, 450],
      multi: [440, 560],
      goals: [380, 520],
      parking: [300, 420],
      dishes: [350, 470],
      honesty: [300, 420],
      plans: [200, 300],
      edge: [250, 350],
    };
    for (const category of MEGA_CATEGORIES) {
      const n = inCategory(category).length;
      expect(n).toBeGreaterThanOrEqual(share[category]![0]);
      expect(n).toBeLessThanOrEqual(share[category]![1]);
      const subs = new Set(inCategory(category).map((c) => c.sub));
      for (const sub of SUBS[category] ?? []) {
        expect(`${category}/${subs.has(sub) ? sub : `MISSING ${sub}`}`).toBe(`${category}/${sub}`);
        expect(inCategory(category).filter((c) => c.sub === sub).length).toBeGreaterThanOrEqual(5);
      }
    }
    // 40+ distinct situations in the goals, 120+ distinct dishes in the food specifics.
    expect(new Set(inCategory('goals').map((c) => c.sub)).size).toBeGreaterThanOrEqual(40);
    const dishTexts = inCategory('dishes')
      .filter((c) => ['regional', 'drinks_desserts', 'breakfast', 'world'].includes(c.sub))
      .map((c) => c.turns[0]!.expect.dishHas?.join('|'));
    expect(new Set(dishTexts).size).toBeGreaterThanOrEqual(120);
  });

  it('asks every conversation only once', () => {
    const keys = MEGA_CASES.map((c) => `${c.city}|${c.turns.map((t) => t.input.text).join('|')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('spreads over the five cities, the times of day, locations and both app languages', () => {
    for (const city of CITY_IDS) {
      expect(MEGA_CASES.filter((c) => c.city === city).length).toBeGreaterThanOrEqual(
        MEGA_CASES.length * 0.15,
      );
    }
    for (const slot of TIMES_OF_DAY) {
      expect(MEGA_CASES.filter((c) => timeOfDay(c.hour) === slot).length).toBeGreaterThanOrEqual(
        MEGA_CASES.length * 0.08,
      );
    }
    // Late night is 01:00-04:00.
    const night = MEGA_CASES.filter((c) => timeOfDay(c.hour) === 'late night');
    expect(night.every((c) => c.hour >= 1 && c.hour <= 4)).toBe(true);
    const en = MEGA_CASES.filter((c) => c.ui === 'en').length / MEGA_CASES.length;
    expect(en).toBeGreaterThanOrEqual(0.08);
    expect(en).toBeLessThanOrEqual(0.12);
    const unlocated = MEGA_CASES.filter((c) => !c.located).length / MEGA_CASES.length;
    expect(unlocated).toBeGreaterThanOrEqual(0.1);
    expect(unlocated).toBeLessThanOrEqual(0.4);
    for (const c of MEGA_CASES) {
      expect(Number.isInteger(c.hour) && c.hour >= 0 && c.hour <= 23).toBe(true);
    }
  });

  it('never needs the phone location for a conversation that has none', () => {
    for (const c of MEGA_CASES.filter((x) => !x.located)) {
      const first = c.turns[0]!;
      const e = first.expect;
      const searches = e.kind === 'food' || e.kind === 'park' || e.kind === 'choice';
      if (!searches || e.free || e.orAsk || e.scope) continue;
      expect(
        !!(e.place || e.placeHas || e.nearMe || e.nameCard || e.cat || e.dishHas || e.wishes),
      ).toBe(true);
    }
    // A search in a dense district is the only one a result is promised for.
    for (const c of MEGA_CASES) {
      for (const t of c.turns) {
        if (t.expect.requireParking === true && t.expect.cards === 'some') {
          // Checked against the data: no restaurant of Mamak has a car park near it.
          expect(c.city === 'ankara' && t.expect.place?.[0] === 'Mamak').toBe(false);
        }
      }
    }
  });

  it('writes messages in many styles and languages', () => {
    const bySub = (sub: string) =>
      inCategory('style')
        .filter((c) => c.sub === sub)
        .flatMap(textsOf);
    for (const text of MEGA_CASES.flatMap(textsOf)) {
      expect(text.trim()).not.toBe('');
      expect(text).not.toMatch(/undefined|\{[A-Z]+\}/);
    }
    expect(bySub('arabic').every((t) => /[؀-ۿ]/.test(t))).toBe(true);
    expect(bySub('german').some((t) => /\b(Wo|Ich|Parkplatz|in der Nähe)\b/.test(t))).toBe(true);
    expect(bySub('english').some((t) => /\b(where|best|near|please|hungry|park)\b/i.test(t))).toBe(
      true,
    );
    expect(bySub('ascii').every((t) => !/[ğüşıöçĞÜŞİÖÇ]/.test(t))).toBe(true);
    expect(
      bySub('caps').every((t) => t === t.toLocaleUpperCase('tr') || t === t.toUpperCase()),
    ).toBe(true);
    expect(bySub('emoji_only').every((t) => /\p{Extended_Pictographic}/u.test(t))).toBe(true);
    expect(bySub('emoji_only').every((t) => !/\p{L}/u.test(t))).toBe(true);
    expect(bySub('emoji_district').every((t) => /\p{Extended_Pictographic}/u.test(t))).toBe(true);
    expect(bySub('emoji_district').every((t) => /\p{L}/u.test(t))).toBe(true);
    expect(bySub('voice').every((t) => !/[.,!?;:]/.test(t))).toBe(true);
    expect(bySub('abbrev').some((t) => /\b(slm|nbr|mrb)\b/.test(t))).toBe(true);
    expect(bySub('abbrev').some((t) => /\b(bi|yk)\b/.test(t))).toBe(true);
    // A long ramble with the ask in it: about 40 words in the 200 characters the chat accepts.
    for (const t of bySub('rambling')) {
      expect(t.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      expect(wordCount(t)).toBeGreaterThanOrEqual(34);
    }
    // Every typed message fits the input, but the 200+ ones of the edge cases.
    const long = inCategory('edge').filter((c) => c.sub === 'long_text');
    for (const c of MEGA_CASES) {
      if (long.includes(c)) continue;
      for (const text of textsOf(c)) expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    }
    for (const c of long) {
      for (const text of textsOf(c)) expect(text.length).toBeGreaterThan(MAX_MESSAGE_CHARS);
    }
  });

  it('has 4-8 turns in every long conversation, with every kind of input', () => {
    for (const c of inCategory('multi')) {
      expect(c.turns.length).toBeGreaterThanOrEqual(4);
      expect(c.turns.length).toBeLessThanOrEqual(8);
    }
    const inputs = new Set(MEGA_CASES.flatMap((c) => c.turns.map((t) => t.input.type)));
    for (const type of ['say', 'tap', 'answer', 'directions']) expect(inputs).toContain(type);
    expect(
      MEGA_CASES.some((c) => c.turns.some((t) => t.input.type === 'say' && t.input.city)),
    ).toBe(true);
    const asks = MEGA_CASES.flatMap((c) => c.turns.map((t) => t.expect.parkAsk));
    expect(asks).toEqual(expect.arrayContaining(['question', 'cars', 'directions']));
    // Back-references, a change of mind, a negation, thanks then a new ask.
    const multiTexts = inCategory('multi').flatMap(textsOf);
    expect(multiTexts.some((t) => /ikincisi|ikinci yer|üçüncü sıradaki|ilk sıradaki/.test(t))).toBe(
      true,
    );
    expect(multiTexts.some((t) => /^yok .* değil /.test(t))).toBe(true);
    expect(multiTexts.some((t) => /istemem|olmasın/.test(t))).toBe(true);
  });
});

function checkExpectations(c: MegaCase): void {
  expect(CITIES.find((x) => x.id === c.city)?.available).toBe(true);
  expect(['park', 'food']).toContain(c.section);
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
    for (const id of e.ask ?? []) expect([...CHOICES.map((x) => x.id), 'ai']).toContain(id);
    if (e.member) expect([...Object.keys(KINDS), 'all']).toContain(e.member);
    for (const chip of [...(e.chips ?? []), ...(e.noChips ?? [])]) {
      expect(TAPPABLE_LABELS).toContain(chip);
    }
    for (const claim of e.noClaim ?? []) expect(CLAIM_KINDS).toContain(claim);
    for (const frag of [...(e.place ?? []), ...(e.placeHas ?? []), ...(e.nameCard ?? [])]) {
      expect(frag.trim()).not.toBe('');
    }
    const known = [...cityById(city).districts, ...quartersOf(city).map((q) => q.n)].map(fold);
    for (const p of e.place ?? []) expect(known).toContain(fold(p));
    expect(e.nearMe === true && e.place !== undefined).toBe(false);
    expect(e.cards === 'none' && (e.nameCard !== undefined || e.cardKind !== undefined)).toBe(
      false,
    );
    if (e.kind === 'offtopic' || e.kind === 'none' || e.kind === 'choice') {
      expect(e.cards === 'some').toBe(false);
    }
    if (e.kind === 'name' && e.nameCard) expect(e.cards).toBe('some');
    if (e.note) expect(['food', 'park']).toContain(e.kind);
    // The new fields keep to their kinds.
    if (e.scope) expect(e.kind).toBe('offtopic');
    if (e.hedge) expect(e.kind).toBe('food');
    if (e.free) expect(e.cards).toBeUndefined();
  }
}

describe('the expectations of every mega conversation', () => {
  it('only name valid fields, places of the city and chips that exist', () => {
    for (const c of MEGA_CASES) checkExpectations(c);
  });

  it('has an expectation beyond the kind in every conversation', () => {
    for (const c of MEGA_CASES) {
      expect(
        c.turns.some((t) => Object.keys(t.expect).filter((k) => k !== 'kind').length > 0),
      ).toBe(true);
    }
  });

  it('puts the honest note on every no-data goal and the right claims on honesty asks', () => {
    for (const c of inCategory('goals').filter((x) =>
      ['cocuklu', 'aile', 'manzara', 'sakin', 'romantik'].includes(x.sub),
    )) {
      expect(c.turns[0]!.expect).toMatchObject({ note: true, cards: 'some' });
    }
    const claims = (sub: string) =>
      inCategory('honesty')
        .filter((c) => c.sub === sub)
        .flatMap((c) => c.turns.map((t) => t.expect.noClaim ?? []))
        .flat();
    expect(claims('best')).toContain('best');
    expect(claims('phone')).toContain('phone');
    expect(claims('hours')).toContain('hours');
    expect(claims('reservation')).toContain('reservation');
    expect(claims('guarantee')).toContain('guarantee');
    expect(claims('medical_legal')).toContain('medical');
    expect(
      inCategory('parking')
        .filter((c) => c.sub === 'ev_charging')
        .flatMap((c) => c.turns.flatMap((t) => t.expect.noClaim ?? [])),
    ).toContain('charging');
    // Other cities and things we do not cover: an honest answer, never a fake search.
    for (const c of inCategory('honesty').filter((x) => x.sub.startsWith('scope_'))) {
      expect(c.turns[0]!.expect).toMatchObject({ kind: 'offtopic', scope: true, cards: 'none' });
    }
    // Dishes nobody makes: results only with a hedge.
    for (const c of inCategory('dishes').filter((x) => x.sub === 'made_up')) {
      expect(c.turns[0]!.expect.hedge).toBe(true);
    }
  });

  it('asks the kinds question of the goals with "Hepsi", then follows up', () => {
    const asked = inCategory('goals').filter((c) => c.turns[0]!.expect.kind === 'choice');
    expect(asked.length).toBeGreaterThanOrEqual(200);
    for (const c of asked) {
      expect(c.turns[0]!.expect).toMatchObject({ hepsi: true, chipsMin: 2, cards: 'none' });
      expect(c.turns[1]!.expect.kind).toBe('food');
      expect(['tap', 'answer']).toContain(c.turns[1]!.input.type);
    }
    const follow = asked.map((c) => c.turns[1]!.input.type);
    expect(follow).toContain('tap');
    expect(follow).toContain('answer');
  });

  it('names real places of the data, for the exact names and the typos', () => {
    const names = inCategory('dishes').filter((c) => c.sub.startsWith('name_'));
    expect(names.length).toBeGreaterThanOrEqual(50);
    for (const city of CITY_IDS) {
      expect(names.filter((c) => c.city === city).length).toBeGreaterThanOrEqual(8);
    }
    const real = (city: string) =>
      new Set((foodFile(city).items ?? []).map((r) => fold(cleanName(r.n))));
    for (const c of names.filter((x) => x.sub === 'name_exact')) {
      const want = c.turns[0]!.expect.nameCard![0]!;
      expect(real(c.city).has(fold(want))).toBe(true);
    }
    expect(names.some((c) => c.sub === 'name_typo')).toBe(true);
  });

  it('uses real landmarks of the data and the parking wishes of the router', () => {
    for (const c of inCategory('parking').filter((x) => x.sub.startsWith('near_'))) {
      expect(c.turns[0]!.expect.placeHas?.length).toBe(1);
    }
    const wishes = new Set(
      inCategory('parking').flatMap((c) => c.turns.flatMap((t) => t.expect.wishes ?? [])),
    );
    for (const w of [
      'free',
      'covered',
      'nonstop',
      'disabled',
      'motorcycle',
      'big_vehicle',
      'overnight',
      'rail',
    ]) {
      expect(wishes.has(w as never)).toBe(true);
    }
    // A city with live data and one without: both are asked for free spaces.
    expect(inCategory('parking').some((c) => c.sub === 'live_spots')).toBe(true);
    expect(inCategory('parking').some((c) => c.sub === 'live_spots_no_data')).toBe(true);
  });
});

describe('shards', () => {
  it('cover every conversation exactly once', () => {
    for (const n of [1, 2, 6, 7, 13]) {
      const parts = Array.from({ length: n }, (_, i) => shardOf(MEGA_CASES, i, n));
      const names = parts.flat().map((c) => c.name);
      expect(names).toHaveLength(MEGA_CASES.length);
      expect(new Set(names).size).toBe(MEGA_CASES.length);
      // Even: no shard is more than one conversation bigger than another.
      const sizes = parts.map((p) => p.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
    expect(shardOf(MEGA_CASES, 0, 1)).toEqual(MEGA_CASES);
  });

  it('take every n-th conversation from the i-th, after --limit', () => {
    const picked = sampleCases(MEGA_CASES, 40, MEGA_SEED);
    expect(picked).toHaveLength(40);
    for (const category of MEGA_CATEGORIES) {
      expect(picked.some((c) => c.category === category)).toBe(true);
    }
    const parts = [0, 1, 2].map((i) => shardOf(picked, i, 3));
    expect(
      parts
        .flat()
        .map((c) => c.name)
        .sort(),
    ).toEqual(picked.map((c) => c.name).sort());
    expect(parts[1]![0]).toBe(picked[1]);
    expect(parts[2]![1]).toBe(picked[5]);
  });

  it('are read from "i/n"', () => {
    expect(parseShard('0/6')).toEqual({ i: 0, n: 6 });
    expect(parseShard('5/6')).toEqual({ i: 5, n: 6 });
    expect(parseShard('6/6')).toBeNull();
    expect(parseShard('1')).toBeNull();
    expect(parseShard('a/b')).toBeNull();
    expect(parseShard('0/0')).toBeNull();
    expect(parseShard(undefined)).toBeNull();
  });
});

describe('time of day', () => {
  it('sorts the hours into morning, noon, evening and late night', () => {
    expect(timeOfDay(1)).toBe('late night');
    expect(timeOfDay(4)).toBe('late night');
    expect(timeOfDay(8)).toBe('morning');
    expect(timeOfDay(12)).toBe('noon');
    expect(timeOfDay(15)).toBe('noon');
    expect(timeOfDay(19)).toBe('evening');
    expect(timeOfDay(23)).toBe('evening');
  });
});
