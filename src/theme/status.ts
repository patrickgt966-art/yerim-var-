import type { OccupancyLevel } from '@/data/freshness';

import { occupancy } from './tokens';

export type StatusTone = { fg: string; bg: string };

/**
 * The one status language for car park occupancy (design V5.1): green plenty, orange few,
 * red full, grey unknown / no live count. `fg` is for text and marks, `bg` for a pill behind it.
 */
export function statusTone(level: OccupancyLevel): StatusTone {
  switch (level) {
    case 'plenty':
      return { fg: occupancy.plenty, bg: occupancy.plentyBg };
    case 'few':
      return { fg: occupancy.few, bg: occupancy.fewBg };
    case 'full':
      return { fg: occupancy.full, bg: occupancy.fullBg };
    default:
      return { fg: occupancy.unknown, bg: occupancy.unknownBg };
  }
}
