// Keeps the park Live Activity in step with the running park in the store: started by "Buraya park
// ettim" / "Buraya park et", updated when the estimated cost changes band, ended by "Parkı bitir"
// or after 24 h. The elapsed time ticks on the system's own clock, so no update is needed for it.
import { AppState } from 'react-native';

import { parkCost } from '@/data/tariffs';
import i18n from '@/i18n';
import { useApp, type ActivePark } from '@/store/app';
import { brand } from '@/theme';

import {
  endLiveActivity,
  startLiveActivity,
  updateLiveActivity,
  type ParkActivityProps,
} from './liveActivity';

/** The Live Activity goes away this long after the park started (the park itself stays). */
export const LIVE_ACTIVITY_MAX_MS = 24 * 60 * 60 * 1000;
/** Opens the app from the lock screen or the Dynamic Island. */
const OPEN_URL = 'yerimvar://';

const MINUTE = 60_000;

/**
 * The next time the estimated cost changes, and the cost from then on; null without a tariff or
 * when it stays the same until `untilMs`. Band edges, free minutes and started hours all fall on
 * whole minutes, so a minute-by-minute scan finds them.
 */
export function nextCostChange(
  active: Pick<ActivePark, 'parkingId' | 'hourly'>,
  startedAtMs: number,
  nowMs: number,
  untilMs: number = startedAtMs + LIVE_ACTIVITY_MAX_MS,
): { at: number; cost: number } | null {
  const elapsed = (nowMs - startedAtMs) / MINUTE;
  const current = parkCost(active.parkingId, active.hourly, Math.max(0, elapsed));
  if (current == null) return null;
  const last = (untilMs - startedAtMs) / MINUTE;
  for (let m = Math.max(0, Math.floor(elapsed)); m < last; m++) {
    if (m + 0.5 <= elapsed) continue;
    const cost = parkCost(active.parkingId, active.hourly, m + 0.5);
    if (cost != null && cost !== current) return { at: startedAtMs + m * MINUTE, cost };
  }
  return null;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** What the Live Activity shows for `active` at `now`, in the app's language. */
export function parkActivityProps(
  active: ActivePark,
  now: number = Date.now(),
): { props: ParkActivityProps; nextChangeAt: number | null } {
  const t = i18n.t.bind(i18n);
  const startedAt = new Date(active.startedAt).getTime();
  const endsAt = startedAt + LIVE_ACTIVITY_MAX_MS;
  const cost = parkCost(active.parkingId, active.hourly, Math.max(0, (now - startedAt) / MINUTE));
  const next = cost != null ? nextCostChange(active, startedAt, now, endsAt) : null;
  const nextCost = next ? t('home.activeCost', { cost: next.cost }) : null;
  return {
    props: {
      name: active.name,
      label: t('liveActivity.parked'),
      startedAt,
      endsAt,
      cost: cost != null ? t('home.activeCost', { cost }) : null,
      nextCost,
      nextText: next ? t('liveActivity.nextCost', { cost: nextCost, time: hhmm(next.at) }) : null,
      colors: { bg: brand.navy, text: brand.white, muted: brand.mint, accent: brand.orange },
    },
    nextChangeAt: next?.at ?? null,
  };
}

const parkKey = (a: ActivePark | null | undefined) => (a ? `${a.parkingId}|${a.startedAt}` : null);

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Re-checks just after the next band change (the price changes once that minute is over) or at
 * the 24 h limit, while the app is running.
 */
function scheduleRefresh(at: number, now: number) {
  clearTimer();
  timer = setTimeout(
    () => {
      timer = null;
      void refreshParkActivity(useApp.getState().active);
    },
    Math.max(1000, at - now + 1000),
  );
}

/** Shows `active` on the activity: starts a new one when `start`, else updates the running one. */
async function show(active: ActivePark, start: boolean, now: number): Promise<void> {
  const startedAt = new Date(active.startedAt).getTime();
  const endsAt = startedAt + LIVE_ACTIVITY_MAX_MS;
  if (Number.isNaN(startedAt) || now >= endsAt) {
    clearTimer();
    await endLiveActivity();
    return;
  }
  const { props, nextChangeAt } = parkActivityProps(active, now);
  // The shown cost is out of date after the next change; the layout then shows the newer one.
  const staleDate = new Date(nextChangeAt ?? endsAt);
  const shown = start
    ? startLiveActivity(props, { url: OPEN_URL, staleDate })
    : await updateLiveActivity(props, staleDate);
  if (shown) scheduleRefresh(Math.min(nextChangeAt ?? endsAt, endsAt), now);
  else clearTimer();
}

/** The park in the store changed: a new park starts the activity, no park ends it. */
export async function onParkChange(
  next: ActivePark | null,
  prev: ActivePark | null,
  now: number = Date.now(),
): Promise<void> {
  if (!next) {
    clearTimer();
    await endLiveActivity();
    return;
  }
  await show(next, parkKey(next) !== parkKey(prev), now);
}

/**
 * Brings a running activity up to date (app launch, back from the background). Never starts one:
 * the user may have swiped it away. Without a park, ends any left behind.
 */
export async function refreshParkActivity(
  active: ActivePark | null,
  now: number = Date.now(),
): Promise<void> {
  if (!active) {
    clearTimer();
    await endLiveActivity();
    return;
  }
  await show(active, false, now);
}

/**
 * Wires the activity to the store: call once at app start. Changes made while the store
 * hydrates are not the user's, so the first sync waits for hydration and only refreshes.
 */
export function watchParkActivity(): () => void {
  const resume = () => void refreshParkActivity(useApp.getState().active);
  let unhydrate: (() => void) | null = null;
  if (useApp.persist.hasHydrated()) resume();
  else unhydrate = useApp.persist.onFinishHydration(resume);
  const unsubscribe = useApp.subscribe((s, prev) => {
    if (!useApp.persist.hasHydrated() || s.active === prev.active) return;
    void onParkChange(s.active, prev.active);
  });
  const appState = AppState.addEventListener('change', (status) => {
    if (status === 'active') resume();
  });
  return () => {
    unhydrate?.();
    unsubscribe();
    appState.remove();
    clearTimer();
  };
}
