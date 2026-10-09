import { getFreshness } from '@/data/freshness';
import type { Parking } from '@/data/types';

type Spots = Pick<
  Parking,
  | 'source'
  | 'updatedAt'
  | 'fetchedAt'
  | 'free'
  | 'disabledFree'
  | 'disabledCapacity'
  | 'hasDisabledSpots'
>;

export type DisabledInfo =
  /** Fresh live count: show "15 boş (19 yerden)". */
  | { kind: 'count'; free: number; capacity: number }
  /** Disabled bays exist but the count is missing or stale: no number. */
  | { kind: 'exists' };

/**
 * Disabled-bay info that may be shown, or null. The count follows the same
 * freshness rule as the free count; when stale only the existence is shown.
 */
export function disabledInfo(p: Spots, now: Date = new Date()): DisabledInfo | null {
  const hasCount = p.disabledFree != null && p.disabledCapacity != null;
  if (hasCount) {
    const f = getFreshness(p, now);
    if (f.kind === 'live' || f.kind === 'updated')
      return {
        kind: 'count',
        free: p.disabledFree as number,
        capacity: p.disabledCapacity as number,
      };
    return { kind: 'exists' };
  }
  if (p.hasDisabledSpots === true || (p.disabledCapacity ?? 0) > 0) return { kind: 'exists' };
  return null;
}
