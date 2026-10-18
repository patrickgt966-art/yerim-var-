import i18n from 'i18next';

import type { ChatAction, ChatCard, ChatContext } from '@/data/assistant';
import { cityExamples } from '@/data/cities';
import { HISTORY_LIMIT, type ChatTurn } from '@/lib/ai/protocol';

type T = (key: string, opts?: Record<string, unknown>) => string;

export type CardBadge = 'easy' | 'likely' | 'picked';

/** Everything a result card shows, derived only from fields the card already carries. */
export type CardModel = {
  badge: CardBadge | null;
  distance: string;
  name: string;
  /** Reason / cuisine plus open state; null when the card knows nothing. */
  subline: string | null;
  /** Parking pill text without the "P" mark; null when there is nothing to say. */
  pill: string | null;
  /** Show the navy "P" mark before the pill (restaurant cards with a car park). */
  pillMark: boolean;
  unverified: boolean;
  /** Full spoken label of the card. */
  label: string;
};

/** "1,2 km" in Turkish (decimal comma, as everywhere else in the app), "1.2 km" in English. */
export function formatDistance(m: number, t: T): string {
  if (m < 1000) return t('chat.distanceM', { m: Math.max(1, Math.round(m)) });
  const km = (m / 1000).toFixed(1);
  return t('chat.distance', { km: i18n.language === 'en' ? km : km.replace('.', ',') });
}

/** The reason is a "likely" one when it does not start like the "name has the dish" sentence. */
function isLikelyReason(reason: string, t: T): boolean {
  const named = t('chat.reasonNamed', { dish: '\u0000' }).split('\u0000')[0] ?? '';
  return !reason.startsWith(named);
}

/**
 * `countsStale`: the reply is older than a free count may be shown (UPDATED_MAX_AGE_MS), so its
 * counts and the "easy parking" badge built on them are dropped, as everywhere else in the app.
 */
export function cardModel(
  card: ChatCard,
  index: number,
  sort: ChatContext['sort'] | undefined,
  t: T,
  countsStale = false,
): CardModel {
  const distance = formatDistance(card.distanceM, t);
  if (card.kind === 'parking') {
    const cardFree = countsStale ? null : card.free;
    const pill =
      card.open === 'closed'
        ? t('chat.closed')
        : cardFree != null
          ? t('chat.freeCount', { count: cardFree })
          : card.capacity != null
            ? t('chat.capacity', { count: card.capacity })
            : null;
    const walk = t('chat.walkMin', { count: Math.max(1, Math.round((card.distanceM * 1.3) / 80)) });
    const badge: CardBadge | null = card.picked ? 'picked' : null;
    return {
      badge,
      distance,
      name: card.name,
      subline: walk,
      pill,
      pillMark: false,
      unverified: false,
      label: [badge ? t('chat.badgePicked') : null, card.name, distance, walk, pill]
        .filter(Boolean)
        .join(', '),
    };
  }

  const open = card.narr?.open ?? card.open;
  const openText =
    open === 'open' ? t('chat.openNow') : open === 'closed' ? t('chat.closedNow') : null;
  const lead = card.reason ?? card.narr?.cat ?? null;
  const subline = [lead, openText].filter(Boolean).join(' · ') || null;

  const free = countsStale ? null : (card.narr?.parkingFree ?? null);
  const paid = card.narr?.parkingPaid ?? null;
  const pill =
    card.parkingM != null
      ? [
          t('chat.distanceM', { m: Math.round(card.parkingM) }),
          paid === false ? t('chat.parkFree') : paid === true ? t('chat.parkPaid') : null,
          free != null ? t('chat.parkSpots', { count: free }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  let badge: CardBadge | null = null;
  if (card.picked) badge = 'picked';
  else if (card.reason && isLikelyReason(card.reason, t)) badge = 'likely';
  else if (index === 0 && sort !== 'distance' && free != null && free > 0) badge = 'easy';

  const unverified = !!card.unverified;
  return {
    badge,
    distance,
    name: card.name,
    subline,
    pill: pill ?? t('chat.noParkNear'),
    pillMark: pill != null,
    unverified,
    label: [
      badge
        ? t(
            badge === 'picked'
              ? 'chat.badgePicked'
              : badge === 'easy'
                ? 'chat.badgeEasy'
                : 'chat.badgeLikely',
          )
        : null,
      card.name,
      distance,
      subline,
      pill ?? t('chat.noParkNear'),
      unverified ? t('food.unverified') : null,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

export type UnderstoodChip = { key: string; text: string; what: string; drop: ChatAction };

const dropAction = (t: T, what: string, patch: Partial<ChatContext>): ChatAction => ({
  kind: 'refine',
  label: t('chat.chipDrop', { what }),
  patch,
});

/**
 * What the assistant understood from the search, one chip per condition.
 * Each chip's drop action is a plain `refine` patch that clears exactly that condition.
 */
export function understoodChips(ctx: ChatContext, t: T): UnderstoodChip[] {
  const chips: UnderstoodChip[] = [];
  if (ctx.dish) {
    chips.push({
      key: 'dish',
      text: `🍽 ${ctx.dish}`,
      what: ctx.dish,
      // A dish search also sets the category, so dropping the dish drops both.
      drop: dropAction(t, ctx.dish, { dish: null, dishServes: null, dishExact: false, cat: null }),
    });
  } else if (ctx.cat) {
    const cat = t(`chat.noun.${ctx.cat}`);
    chips.push({
      key: 'cat',
      text: `🍽 ${cat}`,
      what: cat,
      drop: dropAction(t, cat, { cat: null }),
    });
  }
  if (ctx.notCat) {
    const text = t('chat.chipNotCat', { cat: t(`food.cats.${ctx.notCat}`) });
    chips.push({ key: 'notCat', text, what: text, drop: dropAction(t, text, { notCat: null }) });
  }
  if (ctx.place) {
    chips.push({
      key: 'place',
      text: `📍 ${ctx.place.label}`,
      what: ctx.place.label,
      drop: dropAction(t, ctx.place.label, { place: null }),
    });
  }
  if (ctx.section === 'food' && ctx.requireParking) {
    const text = t('chat.chipOnlyParking');
    chips.push({
      key: 'park',
      text: `🅿 ${text}`,
      what: text,
      drop: dropAction(t, text, { requireParking: false, freeParking: false }),
    });
  }
  if (ctx.freeParking) {
    const text = t('chat.chipFreeParking');
    chips.push({
      key: 'free',
      text: `🅿 ${text}`,
      what: text,
      drop: dropAction(t, text, { freeParking: false }),
    });
  }
  return chips;
}

/** Follow-up phrases the assistant already understands (see detectFollowUp). */
export function suggestions(ctx: ChatContext, t: T): string[] {
  const out: string[] = [];
  if (ctx.sort !== 'distance') out.push(t('chat.sugNearer'));
  if (!ctx.freeParking) out.push(t('chat.sugFreePark'));
  out.push(t('chat.sugOther'));
  const ex = cityExamples();
  const inD = (ctx.place?.label ?? '')
    .toLocaleLowerCase('tr')
    .includes(ex.d.toLocaleLowerCase('tr'));
  out.push(t(inD ? 'chat.sugElsewhere_1' : 'chat.sugElsewhere_0', ex));
  return out;
}

/**
 * The earlier turns sent with a message to the AI: only those from index `from` on (the first
 * message after the AI consent), at most HISTORY_LIMIT. Nothing written before consent is sent.
 */
export function aiHistory(
  messages: readonly { role: ChatTurn['role']; text: string }[],
  from: number,
): ChatTurn[] {
  return messages
    .slice(Math.min(from, messages.length))
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, text: m.text }));
}
