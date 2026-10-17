import en from '../en';
import tr from '../tr';

type Tree = { [k: string]: string | Tree };

function leaves(t: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(t)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, s] of leaves(v, path)) out.set(p, s);
  }
  return out;
}

const vars = (s: string) => new Set([...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]!));
/** Turkish-suffixed values have a plain twin the app also passes (cities.ts, assistant.ts). */
const PLAIN: Record<string, string> = {
  aLoc: 'a',
  bLoc: 'b',
  cLoc: 'c',
  dLoc: 'd',
  cityLoc: 'city',
  inDistrict: 'district',
  place: 'city',
};

const trLeaves = leaves(tr as unknown as Tree);
const enLeaves = leaves(en as unknown as Tree);
/** The English strings for a Turkish key: the key itself, or its plural forms. */
const enFor = (key: string) =>
  [key, `${key}_one`, `${key}_other`].map((k) => enLeaves.get(k)).filter((s) => s != null);

describe('the English strings', () => {
  it('cover every Turkish key', () => {
    const missing = [...trLeaves.keys()].filter((k) => enFor(k).length === 0);
    expect(missing).toEqual([]);
  });

  it('have no key the app does not have in Turkish', () => {
    const base = (k: string) => k.replace(/_(one|other)$/, '');
    const extra = [...enLeaves.keys()].filter((k) => !trLeaves.has(k) && !trLeaves.has(base(k)));
    expect(extra).toEqual([]);
  });

  it('use only values the app passes for that key', () => {
    const wrong: string[] = [];
    for (const [key, trText] of trLeaves) {
      const allowed = new Set([...vars(trText)].flatMap((v) => [v, PLAIN[v] ?? v]));
      allowed.add('count');
      for (const enText of enFor(key)) {
        for (const v of vars(enText!)) if (!allowed.has(v)) wrong.push(`${key}: {{${v}}}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('never show a Turkish locative', () => {
    const loc = [...enLeaves].filter(([, s]) => /{{\s*(\w+Loc|inDistrict)\s*}}/.test(s));
    expect(loc).toEqual([]);
  });
});
