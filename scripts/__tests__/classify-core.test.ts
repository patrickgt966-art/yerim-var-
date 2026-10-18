import { FOOD_CATEGORIES } from '@/data/restaurants';
import tr from '@/i18n/tr';

import {
  ANSWER_JSON_SCHEMA,
  CHUNK_SIZE,
  MODEL,
  addUsage,
  buildParams,
  categoryLines,
  chunk,
  costUsd,
  customId,
  doneIds,
  emptyUsage,
  estimateCost,
  keep,
  mergeGuess,
  nearestDistrict,
  parseAnswer,
  parseCustomId,
  pickCandidates,
  systemPrompt,
  textOf,
  userContent,
  type Answer,
} from '../classify/core';

const place = (
  name: string,
  extra: Partial<{ kind: string; cuisine: string; district: string }> = {},
) => ({
  name,
  kind: 'restaurant',
  cuisine: '',
  district: 'Konak',
  ...extra,
});

describe('chunking', () => {
  it('splits into chunks of 40 and keeps the order', () => {
    const list = Array.from({ length: 85 }, (_, i) => i);
    const chunks = chunk(list);
    expect(CHUNK_SIZE).toBe(40);
    expect(chunks.map((c) => c.length)).toEqual([40, 40, 5]);
    expect(chunks.flat()).toEqual(list);
    expect(chunk([])).toEqual([]);
  });

  it('names a request <city>-<chunk index> and reads it back', () => {
    expect(customId('izmir', 3)).toBe('izmir-3');
    expect(parseCustomId('izmir-3')).toEqual({ city: 'izmir', index: 3 });
    expect(parseCustomId('nope')).toBeNull();
  });
});

describe('prompt', () => {
  it('lists every category id with the app label, plus not_food and unknown', () => {
    const text = systemPrompt();
    for (const id of FOOD_CATEGORIES) {
      expect(text).toContain(`- ${id} (${(tr.food.cats as Record<string, string>)[id]}):`);
    }
    expect(categoryLines()).toHaveLength(FOOD_CATEGORIES.length);
    expect(text).toContain('- not_food:');
    expect(text).toContain('- unknown:');
    expect(text).toMatch(/uydurma/);
  });

  it('is identical on every call (stable for the prompt cache)', () => {
    expect(systemPrompt()).toBe(systemPrompt());
    expect(systemPrompt()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('sends i, name, kind, cuisine and district only: no ids, no coordinates', () => {
    const json = JSON.parse(
      userContent([
        { ...place('Hasan Usta'), id: 'osm-n1', lat: 1, lng: 2 } as never,
        place('Sultan Tesisleri', { kind: 'cafe', cuisine: 'turkish', district: '' }),
      ]),
    ) as Record<string, unknown>[];
    expect(json).toEqual([
      { i: 0, name: 'Hasan Usta', kind: 'restaurant', cuisine: '', district: 'Konak' },
      { i: 1, name: 'Sultan Tesisleri', kind: 'cafe', cuisine: 'turkish', district: '' },
    ]);
  });

  it('builds the request: model, cached system block, json schema, low effort', () => {
    const p = buildParams([place('A')]);
    expect(p.model).toBe(MODEL);
    expect(MODEL).toBe('claude-haiku-5-5');
    expect(p.max_tokens).toBe(4000);
    expect(p.system).toEqual([
      { type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } },
    ]);
    expect(p.output_config.effort).toBe('low');
    expect(p.output_config.format).toEqual({ type: 'json_schema', schema: ANSWER_JSON_SCHEMA });
    expect(p.messages).toEqual([{ role: 'user', content: userContent([place('A')]) }]);
    const cats = ANSWER_JSON_SCHEMA.properties.items.items.properties.cat.enum;
    expect(cats).toEqual([...FOOD_CATEGORIES, 'not_food', 'unknown']);
  });
});

describe('parsing an answer', () => {
  const good = JSON.stringify({
    items: [
      { i: 0, cat: 'fish', confidence: 'high' },
      { i: 1, cat: 'unknown', confidence: 'low' },
    ],
  });

  it('reads a valid answer by i', () => {
    const r = parseAnswer(good, 2);
    expect(r.ok && [...r.answers]).toEqual([
      [0, { cat: 'fish', confidence: 'high' }],
      [1, { cat: 'unknown', confidence: 'low' }],
    ]);
  });

  it('drops an i outside the chunk and keeps the first of a repeated i', () => {
    const text = JSON.stringify({
      items: [
        { i: 0, cat: 'meat', confidence: 'high' },
        { i: 0, cat: 'fish', confidence: 'high' },
        { i: 7, cat: 'fish', confidence: 'high' },
        { i: -1, cat: 'fish', confidence: 'high' },
      ],
    });
    const r = parseAnswer(text, 2);
    expect(r.ok && [...r.answers.keys()]).toEqual([0]);
    expect(r.ok && r.answers.get(0)?.cat).toBe('meat');
  });

  it.each([
    ['not json', 'nope'],
    ['no items', '{}'],
    ['an unknown category', '{"items":[{"i":0,"cat":"pizza","confidence":"high"}]}'],
    ['an unknown confidence', '{"items":[{"i":0,"cat":"fish","confidence":"sure"}]}'],
    ['a fractional i', '{"items":[{"i":0.5,"cat":"fish","confidence":"high"}]}'],
  ])('rejects %s', (_, text) => {
    expect(parseAnswer(text, 2).ok).toBe(false);
  });

  it('skips a refusal, a cut-off answer and a message without text', () => {
    const msg = (stop_reason: string | null, content: { type: string; text?: string }[]) => ({
      stop_reason,
      content,
    });
    expect(textOf(msg('refusal', []))).toEqual({ skip: expect.stringContaining('refused') });
    expect(textOf(msg('max_tokens', [{ type: 'text', text: '{"items":[' }]))).toEqual({
      skip: expect.stringContaining('max_tokens'),
    });
    expect(textOf(msg('end_turn', [{ type: 'thinking' }]))).toEqual({ skip: expect.any(String) });
    expect(textOf(msg('end_turn', [{ type: 'thinking' }, { type: 'text', text: 'x' }]))).toEqual({
      text: 'x',
    });
  });
});

describe('confidence filter', () => {
  it('stores a food category at high and medium when it differs from the fallback', () => {
    expect(keep({ cat: 'fish', confidence: 'high' }, 'lokanta')).toEqual({ store: 'fish' });
    expect(keep({ cat: 'fish', confidence: 'medium' }, 'lokanta')).toEqual({ store: 'fish' });
  });
  it('sends a guess equal to the fallback, or for a place with no category, to seen', () => {
    expect(keep({ cat: 'lokanta', confidence: 'high' }, 'lokanta')).toEqual({ seen: true });
    expect(keep({ cat: 'fish', confidence: 'high' }, null)).toEqual({ seen: true });
  });
  it('stores not_food only at high, whatever the fallback', () => {
    expect(keep({ cat: 'not_food', confidence: 'high' }, 'lokanta')).toEqual({ store: 'not_food' });
    expect(keep({ cat: 'not_food', confidence: 'high' }, null)).toEqual({ store: 'not_food' });
    expect(keep({ cat: 'not_food', confidence: 'medium' }, 'lokanta')).toEqual({ seen: true });
  });
  it('writes unknown and low answers to seen only', () => {
    expect(keep({ cat: 'unknown', confidence: 'high' }, 'lokanta')).toEqual({ seen: true });
    expect(keep({ cat: 'fish', confidence: 'low' }, 'lokanta')).toEqual({ seen: true });
    expect(keep({ cat: 'not_food', confidence: 'low' }, null)).toEqual({ seen: true });
  });
});

describe('merge and incremental skip', () => {
  const meta = { generatedAt: '2026-10-18T00:00:00.000Z', model: MODEL };
  const items = { 'osm-n2': 'cafe', 'osm-n1': 'fish' };
  const seen = ['ov-9'];
  const ans = (cat: Answer, confidence: 'high' | 'medium' | 'low' = 'high') => ({
    cat,
    confidence,
  });

  it('skips ids already in items or seen, in a stable order, and honours the limit', () => {
    const places = [
      { id: 'osm-n3' },
      { id: 'osm-n1' },
      { id: 'ov-9' },
      { id: 'ov-1' },
      { id: 'osm-n3' },
    ];
    const done = doneIds(items, seen);
    expect(pickCandidates(places, done).map((p) => p.id)).toEqual(['osm-n3', 'ov-1']);
    expect(pickCandidates(places, done, 1).map((p) => p.id)).toEqual(['osm-n3']);
    expect(pickCandidates(places, done, 0)).toEqual([]);
    expect(pickCandidates(places, new Set()).map((p) => p.id)).toEqual([
      'osm-n1',
      'osm-n3',
      'ov-1',
      'ov-9',
    ]);
  });

  it('adds new ids only, sorted; only changes go to items, the rest to the seen file', () => {
    const merged = mergeGuess(
      { items },
      seen,
      [
        { id: 'osm-n1', answer: ans('meat'), current: 'lokanta' }, // already there: kept as it was
        { id: 'osm-n5', answer: ans('meat'), current: 'lokanta' },
        { id: 'osm-n4', answer: ans('not_food'), current: null },
        { id: 'osm-n6', answer: ans('unknown'), current: 'lokanta' },
        { id: 'osm-n7', answer: ans('fish', 'low'), current: 'lokanta' },
        { id: 'osm-n8', answer: ans('lokanta'), current: 'lokanta' }, // same as the fallback
        { id: 'ov-9', answer: ans('fish'), current: 'lokanta' }, // seen before: not stored now
      ],
      meta,
    );
    expect(merged.guess.items).toEqual({
      'osm-n1': 'fish',
      'osm-n2': 'cafe',
      'osm-n4': 'not_food',
      'osm-n5': 'meat',
    });
    expect(Object.keys(merged.guess.items)).toEqual(['osm-n1', 'osm-n2', 'osm-n4', 'osm-n5']);
    expect(merged.seen.seen).toEqual(['osm-n6', 'osm-n7', 'osm-n8', 'ov-9']);
    expect(merged.guess).not.toHaveProperty('seen');
    expect(merged.guess).toMatchObject({ generatedAt: meta.generatedAt, model: MODEL });
    expect(merged.guess.$comment).toContain('scripts/classify-places.ts');
    expect(merged.guess.$comment).toContain('category-guess-seen.json');
  });

  it('starts from empty files and is repeatable', () => {
    const fresh = [{ id: 'osm-n1', answer: ans('fish'), current: 'lokanta' as const }];
    const a = mergeGuess(null, [], fresh, meta);
    expect(a.guess.items).toEqual({ 'osm-n1': 'fish' });
    expect(a.seen.seen).toEqual([]);
    expect(JSON.stringify(mergeGuess(a.guess, a.seen.seen, fresh, meta))).toBe(JSON.stringify(a));
  });
});

describe('cost', () => {
  it('prices a batch at half of $0.10 / $0.50 per MTok, cache reads at 0.1x', () => {
    const u = emptyUsage();
    addUsage(u, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    expect(costUsd(u)).toBeCloseTo(0.05 + 0.25, 10);
    const cached = emptyUsage();
    addUsage(cached, { cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: null });
    expect(costUsd(cached)).toBeCloseTo(0.005, 10);
    expect(cached).toEqual({ input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0 });
  });

  it('estimates more for more places', () => {
    const one = estimateCost([[place('A')]]);
    const many = estimateCost([Array.from({ length: 40 }, () => place('A')), [place('B')]]);
    expect(one.usd).toBeGreaterThan(0);
    expect(many.usd).toBeGreaterThan(one.usd);
    expect(estimateCost([]).usd).toBe(0);
  });
});

describe('nearestDistrict', () => {
  const centers = [
    { name: 'Konak', lat: 0, lng: 0 },
    { name: 'Bornova', lat: 0, lng: 10 },
  ];
  const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.abs(a.lng - b.lng) * 1000;
  it('takes the nearest centre within the limit, else empty', () => {
    expect(nearestDistrict(centers, { lat: 0, lng: 7 }, dist)).toBe('Bornova');
    expect(nearestDistrict(centers, { lat: 0, lng: 1 }, dist)).toBe('Konak');
    expect(nearestDistrict(centers, { lat: 0, lng: 100 }, dist)).toBe('');
  });
});
