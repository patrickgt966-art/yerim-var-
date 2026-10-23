/**
 * The chat's search reply, built only from facts the app holds: a lead (one of several wordings,
 * chosen by the seed so the same message reads the same) and at most one highlight. A fact that
 * is not known is never mentioned. Pure: no AI call, no data access.
 */

import { FAR_WALK_MIN } from '@/lib/ai/protocol';

type T = (key: string, opts?: Record<string, unknown>) => string;

export type Daypart = 'morning' | 'noon' | 'evening' | 'night';

export type FoodFacts = {
  where: string;
  /** The dish/category phrase as the search reply names it ("balık restoranı"). */
  what: string;
  /** Places the reply is about (all found, or the ones with a car park when one is required). */
  count: number;
  /** How many of the found places have a car park within the wished distance. */
  withPark: number;
  requireParking: boolean;
  freeOnly: boolean;
  /** Walk minutes from the first card to its car park, null when it has none/unknown. */
  nearestWalkMin: number | null;
  /** Shown cards whose nearest car park is known to be free. */
  freeParkCount: number | null;
  /** Shown cards with known opening hours that are open now. */
  openNowCount: number | null;
  /** Shown cards whose opening hours we can read. */
  knownHoursCount: number | null;
  daypart: Daypart | null;
  /**
   * The searched dish, set only when the places were matched to it (by name or "probably serves"):
   * the reply then says what you can get there, never what kind of place it is. Null for a
   * category search, where the category's own noun is used.
   */
  dish?: string | null;
  /** The dish-found-only-by-name sentence(s), ending with a space, or ''. */
  dishPrefix?: string;
};

export type ParkFacts = {
  where: string;
  count: number;
  nearestName: string | null;
  nearestWalkMin: number | null;
  /** Live free spots of the nearest car park; only when its reading is fresh. */
  nearestFree: number | null;
  /** How many of the shown car parks have fresh live data. */
  liveCount: number;
  /** How many of the shown car parks are known to be free of charge. */
  freeOfChargeCount: number;
  /** The list follows a wish, so the first car park shown is not the nearest one. */
  reordered?: boolean;
};

const LEADS = 5;
const NAME_LEADS = 3;
const PLAIN_LEADS = 3;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const pick = (t: T, prefix: string, n: number, seed: string, opts: Record<string, unknown>) =>
  t(`${prefix}_${hash(seed) % n}`, opts);

const known = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/** Part of the day in Istanbul time, from minutes since midnight there. */
export function daypartOf(minutes: number): Daypart {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 5 * 60 && m < 11 * 60) return 'morning';
  if (m >= 11 * 60 && m < 16 * 60) return 'noon';
  if (m >= 16 * 60 && m < 21 * 60) return 'evening';
  return 'night';
}

/** First character in capitals, by the language's rules (Turkish: i becomes İ). */
export function capitalize(text: string, lang: string = 'tr'): string {
  const first = text.charAt(0);
  if (!first) return text;
  return first.toLocaleUpperCase(lang.startsWith('tr') ? 'tr' : 'en') + text.slice(1);
}

export function foodReply(f: FoodFacts, t: T, seed: string, lang?: string): string {
  const base = {
    where: f.where,
    what: f.what,
    dish: f.dish ?? '',
    count: f.count,
    withPark: f.withPark,
  };
  const p = f.dish ? 'chat.reply.foodDish' : 'chat.reply.food';
  // A free-parking claim needs a shown card whose car park is known to be free.
  const free = f.freeOnly && known(f.freeParkCount) && f.freeParkCount > 0;
  let lead: string;
  if (free) lead = pick(t, `${p}FreeLead`, LEADS, seed, base);
  else if (f.requireParking) lead = pick(t, `${p}ParkLead`, LEADS, seed, base);
  else if (f.withPark > 0) lead = pick(t, `${p}Lead`, LEADS, seed, base);
  else lead = pick(t, `${p}PlainLead`, PLAIN_LEADS, seed, base);

  let highlight = '';
  if (known(f.nearestWalkMin) && f.nearestWalkMin <= 3) {
    highlight = t('chat.reply.hlWalk', { n: f.nearestWalkMin });
  } else if (!free && known(f.freeParkCount) && f.freeParkCount >= 1) {
    highlight = t('chat.reply.hlFreePark', { n: f.freeParkCount, count: f.freeParkCount });
  } else if (
    known(f.knownHoursCount) &&
    f.knownHoursCount >= 3 &&
    known(f.openNowCount) &&
    f.openNowCount >= 1 &&
    (f.daypart === 'night' || f.daypart === 'evening')
  ) {
    highlight = t('chat.reply.hlOpen', { n: f.openNowCount, count: f.openNowCount });
  }
  // The dish sentence in front (if any) starts with a capital already; the lead starts a sentence too.
  return (f.dishPrefix ?? '') + capitalize(lead, lang) + (highlight ? ' ' + highlight : '');
}

export function parkReply(f: ParkFacts, t: T, seed: string, lang?: string): string {
  const lead = pick(t, 'chat.reply.parkLead', LEADS, seed, { where: f.where, count: f.count });
  let highlight = '';
  if (f.nearestName && known(f.nearestWalkMin)) {
    const o = { name: f.nearestName, min: f.nearestWalkMin };
    // Over FAR_WALK_MIN minutes the first car park is not "the closest": it is said to be far.
    const far = f.nearestWalkMin > FAR_WALK_MIN ? 'Far' : '';
    // A list in the order of a wish says "the first", not "the closest".
    const base = f.reordered && !far ? 'First' : '';
    // Live spots only from a fresh reading (the caller passes null otherwise).
    highlight =
      known(f.nearestFree) && f.liveCount > 0
        ? t(`chat.reply.hlParkLive${far || base}`, {
            ...o,
            free: f.nearestFree,
            count: f.nearestFree,
          })
        : t(`chat.reply.hlPark${far || base}`, o);
  }
  return capitalize(lead, lang) + (highlight ? ' ' + highlight : '');
}

/** The name-search reply: one of three wordings. */
export function foundNameReply(
  name: string,
  count: number,
  t: T,
  seed: string,
  lang?: string,
): string {
  return capitalize(pick(t, 'chat.foundName', NAME_LEADS, seed, { name, count }), lang);
}
