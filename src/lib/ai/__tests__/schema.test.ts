// The output schemas the worker hands to Anthropic's structured outputs. The API rejects a few
// JSON-schema shapes (a `$defs` / `$ref`, among others) with a 400, which the app only sees as a
// silent fallback to its rules. This builds the schemas the way the SDK's `zodOutputFormat` does
// (zod's toJSONSchema with `reused: 'ref'`) and checks the shapes the API accepts. The API also
// caps the union-typed parameters (believed to be 16), so each schema may have at most 4.
// CI has no server node_modules, so the real helper cannot be imported here.
import { z } from 'zod';

import {
  UnderstandingModelSchema,
  UnderstandingSchema,
  capReasons,
  chatOutputSchema,
  parkPickModelSchema,
  pickModelSchema,
  planModelSchema,
  toUnderstanding,
} from '../protocol';

type Json = Record<string, unknown>;

// Exactly what index.ts of the worker hands to zodOutputFormat.
const schemas: Record<string, z.ZodType> = {
  understand: UnderstandingModelSchema,
  chat: chatOutputSchema,
  pick: pickModelSchema(5),
  pickOne: pickModelSchema(1),
  parkPick: parkPickModelSchema(5),
  plan: planModelSchema(5, 15),
  planOne: planModelSchema(1, 1),
};

const MAX_UNIONS = 4;
// Anthropic's limits per request (structured outputs): 16 union-typed parameters, 24 optional
// parameters, array minItems only 0 or 1, no minimum / maximum / multipleOf / minLength /
// maxLength, additionalProperties only false, enums of primitives only.
const API_MAX_UNIONS = 16;
const API_MAX_OPTIONAL = 24;

/**
 * What the SDK's `zodOutputFormat` does to the JSON schema (sdk/lib/transform-json-schema.js):
 * only type / anyOf / description / title / properties / required / items / minItems (0 or 1) are
 * kept, `additionalProperties` becomes false, and every other keyword (enum, minimum, maximum,
 * ...) is moved into the description text.
 */
function sdkTransform(node: Json): Json {
  const src = { ...node };
  const out: Json = {};
  const pop = (k: string) => {
    const v = src[k];
    delete src[k];
    return v;
  };
  const type = pop('type');
  const anyOf = pop('anyOf');
  if (Array.isArray(anyOf)) out.anyOf = anyOf.map((v) => sdkTransform(v as Json));
  else out.type = type;
  if (pop('description') !== undefined) out.description = node.description;
  if (type === 'object') {
    const props = (pop('properties') as Json | undefined) ?? {};
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, sdkTransform(v as Json)]),
    );
    pop('additionalProperties');
    out.additionalProperties = false;
    const required = pop('required');
    if (required !== undefined) out.required = required;
  } else if (type === 'array') {
    const items = pop('items');
    if (items !== undefined) out.items = sdkTransform(items as Json);
    const minItems = pop('minItems');
    if (minItems === 0 || minItems === 1) out.minItems = minItems;
  }
  return out;
}

const SDK_KEYS = new Set([
  'type',
  'anyOf',
  'description',
  'properties',
  'required',
  'items',
  'minItems',
  'additionalProperties',
]);

/** Union-typed properties: a `type` array (["string","null"]) or an `anyOf`. */
function countUnions(json: unknown): number {
  let count = 0;
  walk(json, '$', (n) => {
    if (Array.isArray(n.type)) count += 1;
    if (Array.isArray(n.anyOf)) count += 1;
  });
  return count;
}

/** Every sub-schema with the path it sits at. */
function walk(node: unknown, path: string, visit: (n: Json, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`, visit));
  } else if (node !== null && typeof node === 'object') {
    visit(node as Json, path);
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, visit);
  }
}

describe.each(Object.entries(schemas))('structured output schema: %s', (_name, schema) => {
  const json = z.toJSONSchema(schema, { reused: 'ref' }) as Json;

  it('has no $defs or $ref', () => {
    const found: string[] = [];
    walk(json, '$', (n, path) => {
      if ('$defs' in n || '$ref' in n || 'definitions' in n) found.push(path);
    });
    expect(found).toEqual([]);
  });

  it('has no allOf / oneOf / not, and anyOf is only "something or null"', () => {
    const found: string[] = [];
    walk(json, '$', (n, path) => {
      for (const k of ['allOf', 'oneOf', 'not', 'patternProperties']) {
        if (k in n) found.push(`${path}.${k}`);
      }
      if (Array.isArray(n.anyOf)) {
        const variants = n.anyOf as Json[];
        const nullable = variants.length === 2 && variants.some((v) => v.type === 'null');
        if (!nullable) found.push(`${path}.anyOf is not a nullable`);
      }
    });
    expect(found).toEqual([]);
  });

  it('every object is closed and lists all its properties as required', () => {
    const bad: string[] = [];
    walk(json, '$', (n, path) => {
      if (n.type !== 'object') return;
      const props = Object.keys((n.properties as Json | undefined) ?? {});
      const required = (n.required as string[] | undefined) ?? [];
      if (n.additionalProperties !== false) bad.push(`${path}: additionalProperties`);
      if ([...props].sort().join() !== [...required].sort().join()) bad.push(`${path}: required`);
    });
    expect(bad).toEqual([]);
  });

  it('the root is one object', () => {
    expect(json.type).toBe('object');
  });

  it(`has at most ${MAX_UNIONS} union-typed properties`, () => {
    expect(countUnions(json)).toBeLessThanOrEqual(MAX_UNIONS);
  });

  it('the schema the SDK sends stays inside the API limits', () => {
    const sent = sdkTransform(json);
    const bad: string[] = [];
    walk(sent, '$', (n, path) => {
      for (const k of Object.keys(n)) {
        // Keys inside `properties` are property names; only schema nodes are checked here.
        if (path.endsWith('.properties')) continue;
        if (!SDK_KEYS.has(k)) bad.push(`${path}.${k}`);
      }
      if ('minItems' in n && n.minItems !== 0 && n.minItems !== 1) bad.push(`${path}.minItems`);
      if (n.type === 'object' && n.additionalProperties !== false) bad.push(`${path}: closed`);
    });
    expect(bad).toEqual([]);
    expect(countUnions(sent)).toBeLessThanOrEqual(API_MAX_UNIONS);
    expect(countUnions(sent)).toBeLessThanOrEqual(MAX_UNIONS);
  });

  it('has no minItems other than 0 or 1 and only primitive enums', () => {
    const bad: string[] = [];
    walk(json, '$', (n, path) => {
      if ('minItems' in n && n.minItems !== 0 && n.minItems !== 1) bad.push(`${path}.minItems`);
      if (Array.isArray(n.enum) && n.enum.some((v) => typeof v === 'object')) bad.push(path);
    });
    expect(bad).toEqual([]);
  });

  it('has no optional properties: every property is required', () => {
    const optional: string[] = [];
    walk(json, '$', (n, path) => {
      const props = Object.keys((n.properties as Json | undefined) ?? {});
      const required = (n.required as string[] | undefined) ?? [];
      for (const k of props) if (!required.includes(k)) optional.push(`${path}.${k}`);
    });
    expect(optional).toEqual([]);
    expect(optional.length).toBeLessThanOrEqual(API_MAX_OPTIONAL);
  });
});

describe('the understanding schema uses no unions at all', () => {
  it('every sentinel is a plain type', () => {
    expect(countUnions(z.toJSONSchema(UnderstandingModelSchema, { reused: 'ref' }))).toBe(0);
  });
});

describe('the flat model output becomes the union the apps read', () => {
  const flat = {
    meaning: 'Bornova’da otoparkı olan bir kebapçı istiyor',
    kind: 'search',
    district: 'Bornova',
    cat: 'none',
    notCat: 'none',
    dish: 'köfte',
    place: '',
    food: true,
    requireParking: false,
    appleQuery: '',
    nearMe: false,
    dishServes: ['köfteci', 'a', 'b', 'c', 'd', 'e', 'f'],
    wishes: ['cheap', 'quiet', 'family', 'kids', 'group', 'quick', 'view', 'late'],
    kinds: [],
    partySize: 0,
    clarifyAsk: 'party',
    clarifyText: '',
    planWhen: 'tonight',
    tone: '',
    dishNote: '',
    reply: '',
    action: 'none',
  };

  it('the flat sample is a valid model output', () => {
    expect(UnderstandingModelSchema.safeParse(flat).success).toBe(true);
  });

  it('a search keeps its fields, maps the sentinels to null and applies the caps', () => {
    const u = toUnderstanding(flat);
    expect(UnderstandingSchema.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: 'search',
      district: 'Bornova',
      cat: null,
      dish: 'köfte',
      place: null,
      food: true,
      appleQuery: null,
      nearMe: false,
      partySize: null,
      clarify: { ask: 'party', text: null },
      plan: { when: 'tonight' },
      tone: null,
      dishNote: null,
    });
    expect(u).not.toHaveProperty('reply');
    const s = u as { dishServes: string[]; wishes: string[] };
    expect(s.dishServes).toHaveLength(5);
    expect(s.wishes).toHaveLength(6);
  });

  it('kinds keep the known catalog ids once each, drop the unknown ones and stop at six', () => {
    const kinds = (raw: unknown) =>
      (toUnderstanding({ ...flat, kinds: raw }) as { kinds: string[] }).kinds;
    expect(kinds(['kebab', 'pizza', 'kebab', 'cafe', 42, null, 'meyhane'])).toEqual([
      'kebab',
      'cafe',
      'meyhane',
    ]);
    expect(kinds(['grill', 'fish', 'chicken', 'steak', 'bowl', 'salad', 'vegan', 'soup'])).toEqual([
      'grill',
      'fish',
      'chicken',
      'steak',
      'bowl',
      'salad',
    ]);
    expect(kinds([])).toEqual([]);
    expect(kinds(undefined)).toEqual([]);
    expect(kinds('kebab')).toEqual([]);
    // The model schema takes any string (the catalog is named in the description); the reader filters.
    const m = UnderstandingModelSchema.parse({ ...flat, kinds: ['kebab', 'nonsense'] });
    expect(UnderstandingSchema.safeParse(toUnderstanding(m)).success).toBe(true);
    expect((toUnderstanding(m) as { kinds: string[] }).kinds).toEqual(['kebab']);
  });

  it('real values come through; "none" and 0 and [] are not given', () => {
    const u = toUnderstanding({
      ...flat,
      cat: 'fish',
      partySize: 4,
      clarifyText: 'Kaç kişisiniz?',
      tone: 'Afiyet olsun!',
      dishNote: 'Bir yemektir.',
    });
    expect(UnderstandingSchema.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      cat: 'fish',
      partySize: 4,
      clarify: { ask: 'party', text: 'Kaç kişisiniz?' },
      tone: 'Afiyet olsun!',
      dishNote: 'Bir yemektir.',
    });
    const none = toUnderstanding({ ...flat, clarifyAsk: 'none', planWhen: 'none', dishServes: [] });
    expect(none).toMatchObject({ clarify: null, plan: null, dishServes: null });
    // Out-of-range values the schema cannot carry are dropped, as before.
    expect(toUnderstanding({ ...flat, partySize: 100 })).toMatchObject({ partySize: null });
    expect(toUnderstanding({ ...flat, cat: 'sushi', clarifyAsk: 'weather' })).toMatchObject({
      cat: null,
      clarify: null,
    });
  });

  it('a chat is {kind, reply, action} and a chat without a reply is unknown', () => {
    expect(toUnderstanding({ ...flat, kind: 'chat', reply: 'Selam!', action: 'none' })).toEqual({
      kind: 'chat',
      reply: 'Selam!',
      action: 'none',
    });
    expect(toUnderstanding({ ...flat, kind: 'chat', reply: 'Selam!', action: null })).toEqual({
      kind: 'chat',
      reply: 'Selam!',
      action: 'none',
    });
    expect(toUnderstanding({ ...flat, kind: 'chat', reply: null })).toEqual({ kind: 'unknown' });
  });

  it('unknown, junk and the old union shapes', () => {
    expect(toUnderstanding({ ...flat, kind: 'unknown' })).toEqual({ kind: 'unknown' });
    expect(toUnderstanding(null)).toEqual({ kind: 'unknown' });
    expect(toUnderstanding({ kind: 'offtopic', reply: 'x' })).toEqual({ kind: 'unknown' });
    expect(toUnderstanding({ kind: 'unknown' })).toEqual({ kind: 'unknown' });
    expect(toUnderstanding({ kind: 'chat', reply: 'Selam!', action: 'none' })).toEqual({
      kind: 'chat',
      reply: 'Selam!',
      action: 'none',
    });
  });

  it('capReasons cuts the reason list to three', () => {
    const out = capReasons({ pick: 0, reasons: ['closest', 'open_now', 'open_late', 'outdoor'] });
    expect(out.reasons).toHaveLength(3);
    expect(capReasons(null)).toBeNull();
  });
});

// The SDK sends enums and number ranges only as description hints, so the model can write an
// unknown code (eval: notCat "kebap"); one bad field must not fail the whole answer.
describe('a code outside the list does not fail the model answer', () => {
  const flat = {
    meaning: 'et istiyor, kebap değil',
    kind: 'search',
    district: 'Konak',
    cat: 'meat',
    notCat: 'kebap',
    dish: '',
    place: 'Alsancak',
    food: true,
    requireParking: false,
    appleQuery: '',
    nearMe: false,
    dishServes: [],
    wishes: ['cheap', 'cozy'],
    kinds: [],
    partySize: 0,
    clarifyAsk: 'when',
    clarifyText: '',
    planWhen: 'tomorrow',
    tone: '',
    dishNote: '',
    reply: '',
    action: 'dance',
  };

  it('understand: the bad code is empty, the rest is read', () => {
    const m = UnderstandingModelSchema.parse(flat);
    expect(m).toMatchObject({
      notCat: 'none',
      clarifyAsk: 'none',
      planWhen: 'none',
      action: 'none',
    });
    const u = toUnderstanding(m);
    expect(u).toMatchObject({ kind: 'search', cat: 'meat', notCat: null, wishes: ['cheap'] });
    expect(UnderstandingModelSchema.parse({ ...flat, kind: 'greeting' }).kind).toBe('unknown');
  });

  it('pick and plan: an index out of range or an unknown reason is dropped later, not thrown', () => {
    const pick = pickModelSchema(3).parse({
      fit: [0, 7],
      noneFit: false,
      pick: 1,
      reasons: ['closest', 'magic'],
      runnerUp: 9,
      runnerUpWhy: 'magic',
      tone: null,
    });
    expect(pick).toMatchObject({ fit: [0, -1], pick: 1, runnerUp: -1, runnerUpWhy: null });
    expect(
      planModelSchema(2, 2).parse({ restaurant: 5, parking: 0, reasons: ['x'], tone: null }),
    ).toMatchObject({ restaurant: -1, parking: 0 });
    expect(chatOutputSchema.parse({ reply: 'selam', action: 'dance' }).action).toBe('none');
  });
});
