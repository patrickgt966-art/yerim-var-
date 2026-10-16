// The guarantee behind the AI picks: every code the model returns is checked here against the
// facts the app itself sent. Anything that does not hold is dropped; if nothing holds, the AI
// result is ignored altogether and the rule-based answer stands.
import { validateFreeText, type FreeTextContext } from './freeText';
import {
  MAX_REASONS,
  PARK_BIG_CAPACITY,
  type ParkPickCandidate,
  type ParkPickResponse,
  type ParkReason,
  type PickCandidate,
  type PickReason,
  type PickResponse,
  type PlanCandidate,
  type PlanParking,
  type PlanResponse,
  type PlanWhen,
} from './protocol';

/** The nearest car park counts as "close" within this many metres (picks). */
export const PARKING_CLOSE_M = 150;
/** ... or within this many minutes of walking to the restaurant (plans). */
export const PLAN_PARKING_CLOSE_MIN = 2;

/** Rough walk time for a straight-line distance (same formula as walkMinutes in geo.ts). */
export function walkMinFromMeters(m: number): number {
  return Math.max(1, Math.round((m * 1.3) / 80));
}

const isIndex = (v: unknown, n: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;

function uniqueReasons(codes: unknown): PickReason[] {
  if (!Array.isArray(codes)) return [];
  return [...new Set(codes)] as PickReason[];
}

/** True when the reason is a fact about this candidate (compared with all candidates). */
export function pickReasonHolds(
  code: PickReason,
  c: PickCandidate,
  all: PickCandidate[],
  fit: readonly number[] = [],
): boolean {
  switch (code) {
    case 'fits_request':
      return fit.includes(c.i);
    case 'closest':
      return c.walkMin === Math.min(...all.map((x) => x.walkMin));
    case 'open_now':
      return c.openState === 'open';
    case 'open_late':
      return c.closesLate === true;
    case 'free_parking':
      return c.parkingM !== null && c.parkingFree === true;
    case 'parking_close':
      return c.parkingM !== null && c.parkingM <= PARKING_CLOSE_M;
    case 'most_free_spots': {
      if (c.freeSpots === null || c.freeSpots <= 0) return false;
      const free = c.freeSpots;
      return all.every((x) => x === c || x.freeSpots === null || x.freeSpots < free);
    }
    case 'dish_named':
      return c.dishMatch === 'named';
    case 'outdoor':
      return c.outdoor === true;
    default:
      return false;
  }
}

export type VerifiedPick = {
  /** Index into the candidates we sent. */
  pick: number;
  reasons: PickReason[];
  runnerUp: { index: number; why: PickReason } | null;
  /** Z1, only when it passed validateFreeText. */
  tone: string | null;
  /** Candidates the model judged to fit the request, best first ([] = any place will do). */
  fit: number[];
  /** The user asked for something none of the candidates seems to offer. */
  noneFit: boolean;
};

export function verifyPick(
  res: PickResponse,
  candidates: PickCandidate[],
  text: FreeTextContext = {},
): VerifiedPick | null {
  const n = candidates.length;
  if (!isIndex(res?.pick, n)) return null;
  // An older worker sends no fit: every place may do, as before.
  const fit = (Array.isArray(res.fit) ? res.fit : [])
    .filter((k) => isIndex(k, n))
    .filter((k, j, all) => all.indexOf(k) === j);
  const noneFit = res.noneFit === true && fit.length === 0;
  // The pick must be one the model itself judged to fit.
  if (fit.length > 0 && !fit.includes(res.pick)) return null;
  // Nothing fits: no pick is shown, so its reasons do not matter.
  if (noneFit) {
    const tone = validateFreeText('tone', res.tone, text);
    return { pick: res.pick, reasons: [], runnerUp: null, tone, fit, noneFit };
  }
  const chosen = candidates[res.pick]!;
  const reasons = uniqueReasons(res.reasons)
    .filter((code) => pickReasonHolds(code, chosen, candidates, fit))
    .slice(0, MAX_REASONS);
  if (reasons.length === 0) return null;

  let runnerUp: VerifiedPick['runnerUp'] = null;
  if (
    isIndex(res.runnerUp, n) &&
    res.runnerUp !== res.pick &&
    res.runnerUpWhy &&
    (fit.length === 0 || fit.includes(res.runnerUp))
  ) {
    const other = candidates[res.runnerUp]!;
    if (pickReasonHolds(res.runnerUpWhy, other, candidates, fit)) {
      runnerUp = { index: res.runnerUp, why: res.runnerUpWhy };
    }
  }
  return {
    pick: res.pick,
    reasons,
    runnerUp,
    tone: validateFreeText('tone', res.tone, text),
    fit,
    noneFit,
  };
}

/** Plan facts: the restaurant, one of its car parks, and the claims that hold for them. */
export function planReasonHolds(
  code: PickReason,
  r: PlanCandidate,
  park: PlanParking,
  all: PlanCandidate[],
  when: PlanWhen,
): boolean {
  switch (code) {
    case 'closest':
      return r.walkMin === Math.min(...all.map((x) => x.walkMin));
    case 'open_now':
      return when === 'now' && r.openState === 'open';
    case 'open_late':
      return r.closesLate === true;
    case 'free_parking':
      return park.parkingFree === true;
    case 'parking_close':
      return park.walkMin <= PLAN_PARKING_CLOSE_MIN;
    case 'most_free_spots': {
      if (park.freeSpots === null || park.freeSpots <= 0) return false;
      const free = park.freeSpots;
      return r.parkings.every((x) => x === park || x.freeSpots === null || x.freeSpots < free);
    }
    case 'dish_named':
      return r.dishMatch === 'named';
    case 'outdoor':
      return r.outdoor === true;
    default:
      return false;
  }
}

export type VerifiedPlan = {
  restaurant: number;
  /** The car park's `p` as sent. */
  parking: number;
  reasons: PickReason[];
  tone: string | null;
};

export function verifyPlan(
  res: PlanResponse,
  candidates: PlanCandidate[],
  when: PlanWhen,
  text: FreeTextContext = {},
): VerifiedPlan | null {
  if (!isIndex(res?.restaurant, candidates.length)) return null;
  const r = candidates[res.restaurant]!;
  // A place known to be closed at that time is never a plan.
  if (r.openState === 'closed') return null;
  // The car park must be one of this restaurant's own options (indices are global).
  const park = r.parkings.find((x) => x.p === res.parking);
  if (!park || park.openState === 'closed') return null;
  const reasons = uniqueReasons(res.reasons)
    .filter((code) => planReasonHolds(code, r, park, candidates, when))
    .slice(0, MAX_REASONS);
  if (reasons.length === 0) return null;
  return {
    restaurant: res.restaurant,
    parking: park.p,
    reasons,
    tone: validateFreeText('tone', res.tone, text),
  };
}

/** True when the car park reason is a fact about this candidate (compared with all candidates). */
export function parkReasonHolds(
  code: ParkReason,
  c: ParkPickCandidate,
  all: ParkPickCandidate[],
): boolean {
  switch (code) {
    case 'closest':
      return c.walkMin === Math.min(...all.map((x) => x.walkMin));
    case 'free':
      return c.free === true;
    case 'nonstop':
      return c.nonstop === true;
    case 'open_now':
      return c.openState === 'open';
    case 'most_free_spots': {
      if (c.freeSpots === null || c.freeSpots <= 0) return false;
      const free = c.freeSpots;
      return all.every((x) => x === c || x.freeSpots === null || x.freeSpots < free);
    }
    case 'near_rail':
      return c.nearRail === true;
    case 'covered':
      return c.covered === true;
    case 'big_capacity':
      return c.capacity !== null && c.capacity >= PARK_BIG_CAPACITY;
    default:
      return false;
  }
}

export type VerifiedParkPick = {
  pick: number;
  reasons: ParkReason[];
  runnerUp: { index: number; why: ParkReason } | null;
  tone: string | null;
};

export function verifyParkPick(
  res: ParkPickResponse,
  candidates: ParkPickCandidate[],
  text: FreeTextContext = {},
): VerifiedParkPick | null {
  const n = candidates.length;
  if (!isIndex(res?.pick, n)) return null;
  const chosen = candidates[res.pick]!;
  const reasons = uniqueReasons(res.reasons)
    .filter((code) => parkReasonHolds(code as ParkReason, chosen, candidates))
    .slice(0, MAX_REASONS) as ParkReason[];
  if (reasons.length === 0) return null;
  let runnerUp: VerifiedParkPick['runnerUp'] = null;
  if (isIndex(res.runnerUp, n) && res.runnerUp !== res.pick && res.runnerUpWhy) {
    if (parkReasonHolds(res.runnerUpWhy, candidates[res.runnerUp]!, candidates)) {
      runnerUp = { index: res.runnerUp, why: res.runnerUpWhy };
    }
  }
  return { pick: res.pick, reasons, runnerUp, tone: validateFreeText('tone', res.tone, text) };
}
