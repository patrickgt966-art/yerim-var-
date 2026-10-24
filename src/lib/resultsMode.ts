import { firstParam } from '@/lib/params';

/** What the near-me results show: both jobs, only car parks, or only food. */
export type ResultsMode = 'all' | 'park' | 'food';

const ALIASES: Record<string, ResultsMode> = {
  all: 'all',
  tumu: 'all',
  park: 'park',
  otopark: 'park',
  food: 'food',
  yemek: 'food',
  restoran: 'food',
};

/**
 * The mode a link asks for: `mode=park|food|all` (or its Turkish names). The locate button, a typed
 * place and every older link (`near=1`, lat/lng/label only) carry no mode and start on "all".
 */
export function entryMode(params: { mode?: string | string[] }): ResultsMode {
  const raw = firstParam(params.mode)?.trim().toLowerCase();
  return (raw && ALIASES[raw]) || 'all';
}

// Session memory only (gone when the app is closed): the mode last chosen after each kind of entry.
const lastMode: Partial<Record<ResultsMode, ResultsMode>> = {};

/** Where the screen starts: what the person last chose after this entry, else the entry itself. */
export function startMode(entry: ResultsMode): ResultsMode {
  return lastMode[entry] ?? entry;
}

export function rememberMode(entry: ResultsMode, chosen: ResultsMode): void {
  lastMode[entry] = chosen;
}

/** For tests. */
export function forgetModes(): void {
  delete lastMode.all;
  delete lastMode.park;
  delete lastMode.food;
}
