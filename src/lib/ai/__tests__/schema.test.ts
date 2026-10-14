// The output schemas the worker hands to Anthropic's structured outputs. The API rejects a few
// JSON-schema shapes (a `$defs` / `$ref`, among others) with a 400, which the app only sees as a
// silent fallback to its rules. This builds the schemas the way the SDK's `zodOutputFormat` does
// (zod's toJSONSchema with `reused: 'ref'`) and checks the shapes the API accepts.
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
});

describe('the flat model output becomes the union the apps read', () => {
  const flat = {
    kind: 'search',
    district: 'Bornova',
    cat: null,
    dish: 'köfte',
    place: null,
    food: true,
    requireParking: false,
    appleQuery: null,
    nearMe: null,
    dishServes: ['köfteci', 'a', 'b', 'c', 'd', 'e', 'f'],
    wishes: ['cheap', 'quiet', 'family', 'kids', 'group', 'quick', 'view', 'late'],
    partySize: 0,
    clarify: { ask: 'party', text: null },
    plan: { when: 'tonight' },
    tone: null,
    dishNote: null,
    reply: null,
    action: null,
  };

  it('a search keeps its fields, defaults nulls and applies the caps', () => {
    const u = toUnderstanding(flat);
    expect(UnderstandingSchema.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({
      kind: 'search',
      district: 'Bornova',
      dish: 'köfte',
      food: true,
      nearMe: false,
      partySize: null,
      clarify: { ask: 'party', text: null },
      plan: { when: 'tonight' },
    });
    expect(u).not.toHaveProperty('reply');
    const s = u as { dishServes: string[]; wishes: string[] };
    expect(s.dishServes).toHaveLength(5);
    expect(s.wishes).toHaveLength(6);
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
