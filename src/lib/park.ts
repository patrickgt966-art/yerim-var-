import type { ActivePark } from '@/store/app';

/** After this long we ask whether the user is still parked. Never auto-ends. */
export const LONG_PARK_MS = 12 * 60 * 60 * 1000;

/** True when the "Hâlâ park hâlinde misin?" prompt should show. */
export function needsStillParkedPrompt(
  active: Pick<ActivePark, 'startedAt' | 'confirmedAt'>,
  now: number = Date.now(),
): boolean {
  const started = new Date(active.startedAt).getTime();
  if (Number.isNaN(started)) return false;
  const since = active.confirmedAt ? new Date(active.confirmedAt).getTime() : NaN;
  const base = Number.isNaN(since) ? started : Math.max(started, since);
  return now - base > LONG_PARK_MS;
}

/** Label for a "save current location" Ev/İş entry: street if known, else "Konumum (HH:mm)". */
export function currentLocationLabel(
  address: { street?: string | null; name?: string | null } | null | undefined,
  now: Date,
  fallback: (time: string) => string,
): string {
  const street = address?.street?.trim() || address?.name?.trim();
  if (street) return street;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return fallback(`${hh}:${mm}`);
}
