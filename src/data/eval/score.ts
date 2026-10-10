import type { QueryIntent } from '../intent';
import type { ChatCase } from './chatCases';

/** Compare only the fields named in `expect`; `notCat` fails when the intent picked that category. */
export function scoreCase(c: ChatCase, intent: QueryIntent): { pass: boolean; misses: string[] } {
  const misses: string[] = [];
  const e = c.expect;

  if (e.kind !== undefined && intent.kind !== e.kind) {
    misses.push(`kind: want ${e.kind}, got ${intent.kind}`);
  }

  const wantsSearchFields =
    e.cat !== undefined ||
    e.district !== undefined ||
    e.requireParking !== undefined ||
    e.nearMe !== undefined ||
    e.food !== undefined;

  if (intent.kind === 'search') {
    if (e.cat !== undefined && intent.cat !== e.cat)
      misses.push(`cat: want ${e.cat}, got ${intent.cat}`);
    const district = intent.district?.name ?? null;
    if (e.district !== undefined && district !== e.district) {
      misses.push(`district: want ${e.district}, got ${district}`);
    }
    if (e.requireParking !== undefined && intent.requireParking !== e.requireParking) {
      misses.push(`requireParking: want ${e.requireParking}, got ${intent.requireParking}`);
    }
    if (e.nearMe !== undefined && intent.nearMe !== e.nearMe) {
      misses.push(`nearMe: want ${e.nearMe}, got ${intent.nearMe}`);
    }
    if (e.food !== undefined && intent.food !== e.food) {
      misses.push(`food: want ${e.food}, got ${intent.food}`);
    }
    if (c.notCat !== undefined && intent.cat === c.notCat) misses.push(`notCat: got ${c.notCat}`);
  } else if (wantsSearchFields && e.kind === undefined) {
    misses.push(`kind: want search, got ${intent.kind}`);
  }

  return { pass: misses.length === 0, misses };
}
