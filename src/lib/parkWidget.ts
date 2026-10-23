// The "Yerim Var" home screen + lock screen widget, through the official expo-widgets module.
// Best effort and never throws: every call is a no-op where the native module is missing (Expo Go,
// Android, web, an older build, iOS before 16.2) and in tests. Only the props below ever reach the
// widget: no location, nothing leaves the device.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import i18n from '@/i18n';
import { brand } from '@/theme';

/** What the widget shows. Plain JSON: it is serialised into the widget's timeline. */
export type ParkWidgetProps = {
  /** The running park: the widget ticks a timer from `startedAt` (ms since epoch). */
  parked?: { name: string; startedAt: number } | null;
  /** The nearest car park when not parked. `at` (ms) is when the data was measured. */
  nearest?: {
    name: string;
    walkMin: number;
    free?: number | null;
    at: number;
    /** "~4 dk yürüme". */
    walkText: string;
    /** "12 boş yer", null without a fresh live count. */
    freeText: string | null;
    /** "14:30 itibarıyla". */
    asOfText: string;
  } | null;
  /** Already translated: the widget runs in the extension, without i18next. */
  labels: {
    app: string;
    parked: string;
    parkedShort: string;
    nearest: string;
    walkShort: string;
    findPark: string;
    findFood: string;
    min: string;
  };
  colors: { bg: string; text: string; muted: string; accent: string };
};

export type NearestPark = {
  name: string;
  walkMin: number;
  free?: number | null;
  at: number;
};

export type ParkWidgetHandle = {
  updateSnapshot(props: ParkWidgetProps): void;
};

/** A new snapshot of the nearest car park is sent at most this often, and only when it changed. */
export const NEAREST_MIN_INTERVAL_MS = 60_000;

let widget: ParkWidgetHandle | null | undefined;
let parked: { name: string; startedAt: number } | null = null;
let nearest: NearestPark | null = null;
let lastPushKey: string | null = null;
let lastPushAt = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

function loadWidget(): ParkWidgetHandle | null {
  if (Platform.OS !== 'ios') return null;
  // expo-widgets throws at import time where its native module is not in the binary (Expo Go),
  // so it is only required once the module is known to be there.
  if (!requireOptionalNativeModule('ExpoWidgets')) return null;
  try {
    // A static import would load expo-widgets in Expo Go too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const layout = require('./parkWidgetLayout') as typeof import('./parkWidgetLayout');
    return layout.createParkWidget();
  } catch {
    return null;
  }
}

function getWidget(): ParkWidgetHandle | null {
  if (widget === undefined) widget = loadWidget();
  return widget;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The props for the current state, in the app's language. */
export function parkWidgetProps(
  state: { parked: typeof parked; nearest: NearestPark | null } = { parked, nearest },
): ParkWidgetProps {
  const t = i18n.t.bind(i18n);
  const n = state.nearest;
  return {
    parked: state.parked,
    nearest:
      !state.parked && n
        ? {
            name: n.name,
            walkMin: n.walkMin,
            free: n.free ?? null,
            at: n.at,
            walkText: t('widget.walk', { count: n.walkMin }),
            freeText: n.free != null ? t('widget.free', { count: n.free }) : null,
            asOfText: t('widget.asOf', { time: hhmm(n.at) }),
          }
        : null,
    labels: {
      app: t('widget.app'),
      parked: t('widget.parked'),
      parkedShort: t('widget.parkedShort'),
      nearest: t('widget.nearest'),
      walkShort: t('widget.walkShort', { count: n?.walkMin ?? 0 }),
      findPark: t('widget.findPark'),
      findFood: t('widget.findFood'),
      min: t('widget.min'),
    },
    colors: { bg: brand.navy, text: brand.white, muted: brand.mint, accent: brand.orange },
  };
}

function push(): void {
  try {
    getWidget()?.updateSnapshot(parkWidgetProps());
  } catch {
    // The widget is a nicety: a failed update must never reach the app.
  }
}

const nearestKey = (n: NearestPark) => `${n.name}|${n.walkMin}|${n.free ?? ''}`;

/** The park started (a name and a start time) or ended (null). */
export function setWidgetParked(
  next: { name: string; startedAt: number } | null,
  now: number = Date.now(),
): void {
  try {
    parked = next && Number.isFinite(next.startedAt) ? { ...next } : null;
    if (pending) clearTimeout(pending);
    pending = null;
    lastPushKey = parked || !nearest ? null : nearestKey(nearest);
    lastPushAt = now;
    push();
  } catch {
    // Best effort.
  }
}

/**
 * The nearest car park from the home screen. Skipped while parked, and when nothing changed;
 * changes come through at most once a minute (the last one waits for the minute to pass).
 */
export function setWidgetNearest(next: NearestPark, now: number = Date.now()): void {
  try {
    nearest = { ...next };
    if (parked) return;
    if (nearestKey(nearest) === lastPushKey) return;
    const wait = lastPushAt + NEAREST_MIN_INTERVAL_MS - now;
    if (wait > 0) {
      if (!pending) {
        pending = setTimeout(() => {
          pending = null;
          if (parked || !nearest || nearestKey(nearest) === lastPushKey) return;
          lastPushKey = nearestKey(nearest);
          lastPushAt = Date.now();
          push();
        }, wait);
      }
      return;
    }
    lastPushKey = nearestKey(nearest);
    lastPushAt = now;
    push();
  } catch {
    // Best effort.
  }
}

/** Empties the widget: no park, no nearest car park. */
export function clearWidget(): void {
  try {
    parked = null;
    nearest = null;
    lastPushKey = null;
    lastPushAt = 0;
    if (pending) clearTimeout(pending);
    pending = null;
    push();
  } catch {
    // Best effort.
  }
}

/** Tests only: forget the loaded module and the state, or use a fake widget. */
export function __setParkWidgetForTests(w: ParkWidgetHandle | null | undefined): void {
  widget = w;
  parked = null;
  nearest = null;
  lastPushKey = null;
  lastPushAt = 0;
  if (pending) clearTimeout(pending);
  pending = null;
}
