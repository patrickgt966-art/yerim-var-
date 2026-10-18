import { fold } from '../search';
import type { PickCase, UnderstandCase } from './aiCases';
import type {
  ParkPickResponse,
  PickResponse,
  PlanCandidate,
  PlanResponse,
  Understanding,
} from '@/lib/ai/protocol';

type Score = { pass: boolean; misses: string[] };

/** True when a folded word of `text` starts with folded `w` ("Alsancak'ta" has "Alsancak"; "mekanlara" has no "Lara"). */
function hasWordStart(text: string, w: string): boolean {
  const want = fold(w);
  return want.length > 0 && ` ${fold(text)}`.includes(` ${want}`);
}

/**
 * Words a chat reply must not use: internals the router prompt forbids naming
 * (yönlendirici, şema, JSON, talimat, prompt, sistem mesajı, anahtar), and their English
 * forms. Matched on folded text, so "TALİMAT" and "Yönergelerim" are caught too.
 */
const LEAK_WORDS = [
  'yonlendirici',
  'sema',
  'json',
  'prompt',
  'sk ant',
  'talimat',
  'sistem mesaj',
  'anahtar',
  'api key',
  'yonerge',
  'instruction',
  'system message',
];

/** A reply that states a number or names an internal. */
export function replyLeaks(reply: string): boolean {
  return /\d/.test(reply) || LEAK_WORDS.some((w) => hasWordStart(reply, w));
}

/** Checks only the fields the case names; a different but sensible reading still passes. */
export function scoreUnderstanding(c: UnderstandCase, u: Understanding): Score {
  const misses: string[] = [];
  const e = c.expect;
  if (e.kind && !e.kind.includes(u.kind))
    misses.push(`kind: want ${e.kind.join('|')}, got ${u.kind}`);
  if (u.kind === 'search') {
    if (e.district !== undefined) {
      const got = u.district ? fold(u.district) : null;
      const want = e.district ? fold(e.district) : null;
      // Asking "did you mean the place X?" about the expected place is a right answer too.
      const asked = u.clarify?.ask === 'place' ? fold(u.place ?? u.district ?? '') : null;
      if (got !== want && !(want && asked === want)) {
        misses.push(`district: want ${e.district}, got ${u.district}`);
      }
    }
    if (e.food !== undefined && u.food !== e.food)
      misses.push(`food: want ${e.food}, got ${u.food}`);
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
    if (e.districtIn) {
      const got = u.district ? fold(u.district) : null;
      if (!e.districtIn.some((d) => (d ? fold(d) : null) === got)) {
        misses.push(`district: want ${e.districtIn.join('|')}, got ${u.district}`);
      }
    }
    if (e.wishesAny && !e.wishesAny.some((w) => u.wishes?.includes(w))) {
      misses.push(
        `wishes: want one of ${e.wishesAny.join('|')}, got ${u.wishes?.join(',') ?? '-'}`,
      );
    }
    if (e.partySize !== undefined && u.partySize !== e.partySize) {
      misses.push(`partySize: want ${e.partySize}, got ${u.partySize}`);
    }
    if (e.planIn && !e.planIn.includes(u.plan?.when ?? null)) {
      misses.push(`plan: want ${e.planIn.join('|')}, got ${u.plan?.when ?? null}`);
    }
    if (e.placeHas) {
      // Only the fields the app searches with: `meaning` is a free-text summary it never
      // searches by, so a place kept only there is a lost place.
      const all = [u.place, u.appleQuery, u.district].map((v) => v ?? '').join(' ');
      if (!e.placeHas.some((w) => hasWordStart(all, w))) {
        misses.push(`place: want ${e.placeHas.join('|')}, got ${u.place} / ${u.appleQuery}`);
      }
    }
  }
  if (u.kind === 'chat') {
    if (e.actionIn && !e.actionIn.includes(u.action)) {
      misses.push(`action: want ${e.actionIn.join('|')}, got ${u.action}`);
    }
    if (e.replySafe && replyLeaks(u.reply)) {
      misses.push(`reply leaks or states a fact: ${u.reply}`);
    }
  }
  return { pass: misses.length === 0, misses };
}

export function scorePick(c: PickCase, p: PickResponse | null): Score {
  if (!p) return { pass: false, misses: ['no usable pick'] };
  const misses: string[] = [];
  const e = c.expect;
  // A case that names fitting places expects one of them, not "nothing fits".
  const wantNone = e.noneFit ?? (e.pickIn ? false : undefined);
  if (wantNone !== undefined && p.noneFit !== wantNone) {
    misses.push(`noneFit: want ${wantNone}, got ${p.noneFit}`);
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

/** A car park pick: the pick is one of `pickIn`. */
export function scoreParkPick(
  c: { expect: { pickIn: number[] } },
  p: ParkPickResponse | null,
): Score {
  if (!p) return { pass: false, misses: ['no usable pick'] };
  const ok = c.expect.pickIn.includes(p.pick);
  return { pass: ok, misses: ok ? [] : [`pick: want ${c.expect.pickIn.join('|')}, got ${p.pick}`] };
}

/** A plan: the car park is one of the chosen restaurant's own, and both are among those wanted. */
export function scorePlan(
  c: {
    candidates: PlanCandidate[];
    expect: { restaurantIn?: number[]; parkingIn?: number[] };
  },
  p: PlanResponse | null,
): Score {
  if (!p) return { pass: false, misses: ['no usable plan'] };
  const misses: string[] = [];
  const own = c.candidates.find((r) => r.i === p.restaurant)?.parkings.map((k) => k.p) ?? [];
  if (!own.includes(p.parking))
    misses.push(`parking ${p.parking} is not restaurant ${p.restaurant}'s`);
  const e = c.expect;
  if (e.restaurantIn && !e.restaurantIn.includes(p.restaurant)) {
    misses.push(`restaurant: want ${e.restaurantIn.join('|')}, got ${p.restaurant}`);
  }
  if (e.parkingIn && !e.parkingIn.includes(p.parking)) {
    misses.push(`parking: want ${e.parkingIn.join('|')}, got ${p.parking}`);
  }
  return { pass: misses.length === 0, misses };
}
