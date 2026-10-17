import { fold } from '../search';
import type { PickCase, UnderstandCase } from './aiCases';
import type { PickResponse, Understanding } from '@/lib/ai/protocol';

type Score = { pass: boolean; misses: string[] };

/** Checks only the fields the case names; a different but sensible reading still passes. */
export function scoreUnderstanding(c: UnderstandCase, u: Understanding): Score {
  const misses: string[] = [];
  const e = c.expect;
  if (e.kind && !e.kind.includes(u.kind)) misses.push(`kind: want ${e.kind.join('|')}, got ${u.kind}`);
  if (u.kind === 'search') {
    if (e.district !== undefined) {
      const got = u.district ? fold(u.district) : null;
      const want = e.district ? fold(e.district) : null;
      if (got !== want) misses.push(`district: want ${e.district}, got ${u.district}`);
    }
    if (e.food !== undefined && u.food !== e.food) misses.push(`food: want ${e.food}, got ${u.food}`);
    if (e.nearMe !== undefined && u.nearMe !== e.nearMe) {
      misses.push(`nearMe: want ${e.nearMe}, got ${u.nearMe}`);
    }
    if (e.requireParking !== undefined && u.requireParking !== e.requireParking) {
      misses.push(`requireParking: want ${e.requireParking}, got ${u.requireParking}`);
    }
    if (e.noPlace && u.place) misses.push(`place: want none, got ${u.place}`);
    if (e.catIn && !e.catIn.includes(u.cat)) {
      misses.push(`cat: want ${e.catIn.join('|')}, got ${u.cat}`);
    }
    if (e.catNot && u.cat && e.catNot.includes(u.cat)) misses.push(`cat: must not be ${u.cat}`);
    if (e.notCat && u.notCat !== e.notCat) misses.push(`notCat: want ${e.notCat}, got ${u.notCat}`);
    if (e.dishHas) {
      const dish = fold(u.dish ?? '');
      if (!e.dishHas.some((w) => dish.includes(fold(w)))) {
        misses.push(`dish: want ${e.dishHas.join('|')}, got ${u.dish}`);
      }
    }
    if (e.meaningHas) {
      const m = fold(u.meaning ?? '');
      if (!e.meaningHas.some((w) => m.includes(fold(w)))) {
        misses.push(`meaning lost the request: ${u.meaning}`);
      }
    }
  }
  return { pass: misses.length === 0, misses };
}

export function scorePick(c: PickCase, p: PickResponse | null): Score {
  if (!p) return { pass: false, misses: ['no usable pick'] };
  const misses: string[] = [];
  const e = c.expect;
  if (e.noneFit !== undefined && p.noneFit !== e.noneFit) {
    misses.push(`noneFit: want ${e.noneFit}, got ${p.noneFit}`);
  }
  // With nothing fitting, which place stands in does not matter.
  if (!p.noneFit) {
    if (e.pickIn && !e.pickIn.includes(p.pick)) {
      misses.push(`pick: want ${e.pickIn.join('|')}, got ${p.pick}`);
    }
    for (const k of e.notFit ?? []) {
      if (p.pick === k) misses.push(`picked ${k}, which does not fit`);
      else if (p.fit.includes(k)) misses.push(`listed ${k} as fitting`);
    }
  }
  return { pass: misses.length === 0, misses };
}
