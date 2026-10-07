import type { TFunction } from 'i18next';

import type { Parking } from '@/data/types';

/** Car parks without a live count (bundled lists or Apple Maps). */
export function isStatic(p: Pick<Parking, 'source'>): boolean {
  return p.source === 'osm' || p.source === 'izelman' || p.source === 'apple';
}

/**
 * Where a static record comes from, phrased as a reason to trust it rather
 * than as a missing feature.
 */
export function sourceLabel(p: Pick<Parking, 'source'>, t: TFunction): string | null {
  if (p.source === 'izelman') return t('card.municipal');
  if (p.source === 'osm') return t('card.mapped');
  if (p.source === 'apple') return t('card.apple');
  return null;
}

/**
 * The big number on a static card: capacity when known (a real fact about
 * the car park), otherwise the walking time. Never a free-space count.
 */
export function staticHeadline(
  p: Pick<Parking, 'capacity'> & { walk?: number },
  t: TFunction,
): { value: string; label: string } | null {
  if (p.capacity != null) return { value: String(p.capacity), label: t('card.capacityUnit') };
  if (p.walk != null) return { value: `~${p.walk}`, label: t('card.walkUnit') };
  return null;
}
