export const SLOT_COUNT = 10;

/** How many of the 10 strip cells show as free. Any free space shows at least one. */
export function freeCells(free: number | null, capacity: number | null): number | null {
  if (free == null) return null;
  if (free <= 0) return 0;
  if (!capacity || capacity <= 0) return Math.min(SLOT_COUNT, free);
  const n = Math.round((Math.min(free, capacity) / capacity) * SLOT_COUNT);
  return Math.min(SLOT_COUNT, Math.max(1, n));
}
