// The iOS Live Activity (lock screen + Dynamic Island) for the running park, through the official
// expo-widgets module. Every call is a safe no-op where the native module is missing: Expo Go,
// Android, web, an older build, iOS before 16.2, or Live Activities switched off in Settings.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** What the Live Activity shows. Plain JSON: it is serialised into the activity's state. */
export type ParkActivityProps = {
  /** Car park name. */
  name: string;
  /** "Park hâlinde" / "Parked". */
  label: string;
  /** Start of the park (ms since epoch); the system ticks the timer from here. */
  startedAt: number;
  /** The timer stops here (ms): the activity's 24 h limit. */
  endsAt: number;
  /** Estimated cost so far ("~40 TL"), null when no tariff is known. */
  cost: string | null;
  /** The cost after the next band change ("~60 TL"), null when it does not change within the limit. */
  nextCost: string | null;
  /** "14:30 sonrası ~60 TL": stays true while the app is asleep and cannot update the activity. */
  nextText: string | null;
  colors: { bg: string; text: string; muted: string; accent: string };
};

export type LiveActivityHandle = {
  getId(): string;
  update(props: ParkActivityProps, staleDate?: Date): Promise<void>;
  end(dismissalPolicy?: 'default' | 'immediate', props?: ParkActivityProps): Promise<void>;
};

export type LiveActivityFactory = {
  start(props: ParkActivityProps, url?: string, staleDate?: Date): LiveActivityHandle;
  getInstances(): LiveActivityHandle[];
};

let factory: LiveActivityFactory | null | undefined;
let current: LiveActivityHandle | null = null;

function loadFactory(): LiveActivityFactory | null {
  if (Platform.OS !== 'ios') return null;
  // expo-widgets throws at import time where its native module is not in the binary (Expo Go),
  // so it is only required once the module is known to be there.
  if (!requireOptionalNativeModule('ExpoWidgets')) return null;
  try {
    // A static import would load expo-widgets in Expo Go too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const layout = require('./parkActivityLayout') as typeof import('./parkActivityLayout');
    return layout.createParkActivityFactory();
  } catch {
    return null;
  }
}

function getFactory(): LiveActivityFactory | null {
  if (factory === undefined) factory = loadFactory();
  return factory;
}

/** True when this build can show a Live Activity at all (the user may still have them off). */
export function isLiveActivitySupported(): boolean {
  return getFactory() != null;
}

function instances(f: LiveActivityFactory): LiveActivityHandle[] {
  try {
    return f.getInstances();
  } catch {
    return [];
  }
}

async function endQuietly(h: LiveActivityHandle): Promise<void> {
  try {
    await h.end('immediate');
  } catch {
    // Already ended or dismissed by the user.
  }
}

/**
 * Starts the park's Live Activity, replacing any other one of ours. False when it could not be
 * shown (no native module, Live Activities off, iOS refused).
 */
export function startLiveActivity(
  props: ParkActivityProps,
  options: { url?: string; staleDate?: Date } = {},
): boolean {
  const f = getFactory();
  if (!f) return false;
  const old = instances(f);
  current = null;
  try {
    current = f.start(props, options.url, options.staleDate);
  } catch {
    current = null;
  }
  const keep = current?.getId();
  old.filter((h) => h.getId() !== keep).forEach((h) => void endQuietly(h));
  return current != null;
}

/**
 * Updates the running Live Activity, picking up one that a previous launch started. Never starts
 * a new one: the user may have swiped it away. False when there is none to update.
 */
export async function updateLiveActivity(
  props: ParkActivityProps,
  staleDate?: Date,
): Promise<boolean> {
  const f = getFactory();
  if (!f) return false;
  if (!current) current = instances(f)[0] ?? null;
  if (!current) return false;
  try {
    await current.update(props, staleDate);
    return true;
  } catch {
    // Ended by the system (8 h limit) or dismissed by the user.
    current = null;
    return false;
  }
}

/** Ends every Live Activity of ours and removes it from the lock screen at once. */
export async function endLiveActivity(): Promise<void> {
  const f = getFactory();
  if (!f) return;
  const all = instances(f);
  if (current && !all.some((h) => h.getId() === current?.getId())) all.push(current);
  current = null;
  await Promise.all(all.map(endQuietly));
}

/** Tests only: forget the loaded module, or use a fake one. */
export function __setLiveActivityFactoryForTests(f: LiveActivityFactory | null | undefined): void {
  factory = f;
  current = null;
}
