import { liveFlagFresh } from '@/data/freshness';
import type { Parking } from '@/data/types';

export type OpenState = 'open' | 'closed' | 'unknown';

type OpenInput = Partial<
  Pick<
    Parking,
    'isOpen' | 'nonstop' | 'openingHours' | 'openingHoursText' | 'updatedAt' | 'fetchedAt'
  >
>;

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

// Turkish day names as written in "Pazar Günleri Kapalı" (folded to lower case).
const TR_DAYS = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

const RANGE = /^(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})$/;

type Range = [number, number];

/** "HH:MM–HH:MM" (en dash or hyphen; "10.00-22.00" too) as [start, end] minutes, or null. */
function parseRange(text: string): Range | null {
  const m = RANGE.exec(text.trim());
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (Number(m[2]) > 59 || Number(m[4]) > 59 || start > 24 * 60 || end > 24 * 60) return null;
  return [start, end];
}

/** Overnight ranges (22:00–02:00) are open after the start and before the end. */
function inRange([start, end]: Range, minutes: number): boolean {
  if (start === end) return true; // 00:00–00:00 / 24h
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Ranges per weekday (0 = Sunday); an empty list is a closed day. */
type Week = Range[][];

const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)';
const DAY_LIST = new RegExp(`^(${DAY}(?:\\s*-\\s*${DAY})?(?:\\s*,\\s*${DAY}(?:\\s*-\\s*${DAY})?)*)\\s+(.+)$`);
const FULL_DAY: Range = [0, 0];

/** "Mo-Fr,Su" -> [1..5, 0]; wrapping ranges ("Fr-Mo") go round the week. Holidays are skipped. */
function selectorDays(selector: string): number[] {
  const days: number[] = [];
  for (const part of selector.split(',')) {
    const [from, to] = part.split('-').map((d) => OSM_DAYS.indexOf(d.trim()));
    if (from == null || from < 0) continue; // PH / SH: holidays are not known here
    const last = to == null ? from : to;
    if (last < 0) continue;
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === last) break;
    }
  }
  return days;
}

/** "10:00-14:00, 18:00-23:00" -> ranges; "off" / "closed" -> []; anything else null. */
function parseTimes(text: string): Range[] | null {
  const t = text.trim().toLowerCase();
  if (t === 'off' || t === 'closed') return [];
  const out: Range[] = [];
  for (const part of t.split(',')) {
    const r = parseRange(part);
    if (!r) return null;
    out.push(r);
  }
  return out;
}

/** The bundled form "07:00–20:00, Pazar Günleri Kapalı": one range, Turkish closed days. */
function turkishWeek(text: string): Week | null {
  const [hours, ...rest] = text.split(',').map((s) => s.trim());
  const range = parseRange(hours ?? '');
  if (!range) return null;
  const week: Week = Array.from({ length: 7 }, () => [range]);
  for (const part of rest) {
    const m = /^(\S+)\s+günleri\s+kapalı$/i.exec(part.toLocaleLowerCase('tr'));
    const closedDay = m ? TR_DAYS.indexOf(m[1]!) : -1;
    if (closedDay < 0) return null;
    week[closedDay] = [];
  }
  return week;
}

/**
 * The opening hours as a week, or null when any part cannot be read (never guessed). Reads the
 * OSM forms in the bundled data: "24/7", "Mo-Su 10:00-22:00", "Mo-Fr 09:00-18:00; Sa 10:00-14:00",
 * day lists ("Su,Tu-Sa"), wrapping day ranges ("We-Mo"), several ranges a day, "off" / "closed",
 * overnight ranges ("18:00-02:00") and a bare range for every day. Later rules override earlier
 * ones for their days; days no rule names are closed. Holiday-only rules ("PH off") are skipped.
 */
function parseWeek(text: string): Week | null {
  const src = text.trim();
  if (/^24\s*\/\s*7$/.test(src)) return Array.from({ length: 7 }, () => [FULL_DAY]);
  if (/günleri\s+kapalı/i.test(src.toLocaleLowerCase('tr'))) return turkishWeek(src);
  const week: (Range[] | undefined)[] = Array.from({ length: 7 }, () => undefined);
  const rules = src
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean);
  if (rules.length === 0) return null;
  for (const rule of rules) {
    const m = DAY_LIST.exec(rule);
    const times = parseTimes(m ? m[2]! : rule);
    const days = m ? selectorDays(m[1]!) : [0, 1, 2, 3, 4, 5, 6];
    // A holiday-only rule says nothing about ordinary days, whatever it says.
    if (m && days.length === 0) continue;
    if (!times) return null;
    for (const d of days) week[d] = times;
  }
  return week.map((d) => d ?? []);
}

/** Open at `minutes` of `day`: one of today's ranges, or yesterday's overnight one running on. */
function weekOpen(week: Week, day: number, minutes: number): boolean {
  // Today's overnight range only counts from its start; its small hours belong to tomorrow.
  if (week[day]!.some(([start, end]) => (end < start ? minutes >= start : inRange([start, end], minutes))))
    return true;
  return week[(day + 6) % 7]!.some(([start, end]) => end < start && minutes < end);
}

function fromText(text: string, day: number, minutes: number): OpenState {
  const week = parseWeek(text);
  if (!week) return 'unknown';
  return weekOpen(week, day, minutes) ? 'open' : 'closed';
}

const TURKEY_OFFSET_MS = 3 * 3600_000;

/** Weekday (0 = Sunday) and minutes since midnight in Turkey (fixed UTC+3, no DST). */
export function istanbulClock(now: Date): { day: number; minutes: number } {
  const d = new Date(now.getTime() + TURKEY_OFFSET_MS);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/**
 * Whether a car park is open at `now` (Turkey time, UTC+3). Order: live
 * `isOpen` (only while its download is fresh, see liveFlagFresh), `nonstop`,
 * the per-day table, then the opening-hours text (see parseWeek).
 * Anything it cannot read is 'unknown', never guessed.
 */
export function openState(p: OpenInput, now: Date = new Date()): OpenState {
  if (p.isOpen != null && liveFlagFresh(p, now)) return p.isOpen ? 'open' : 'closed';
  if (p.nonstop) return 'open';
  const { day, minutes } = istanbulClock(now);

  const today = p.openingHours?.[DAY_KEYS[day]!];
  if (today) {
    const range = parseRange(today);
    if (range) return inRange(range, minutes) ? 'open' : 'closed';
  }
  if (p.openingHoursText) return fromText(p.openingHoursText, day, minutes);
  return 'unknown';
}

export function isClosedNow(p: OpenInput, now: Date = new Date()): boolean {
  return openState(p, now) === 'closed';
}

/** "Late" means still open at 22:00 or after: it closes at 22:00 or later, past midnight, or never. */
const LATE_MINUTES = 22 * 60;

const isLateRange = ([start, end]: Range): boolean =>
  start === end || end < start || end >= LATE_MINUTES;

/**
 * True when the readable hours say the place closes at 22:00 or later (or is open around the
 * clock) on the day of `at`. Hours it cannot read, or a closed day, are never "late".
 */
export function closesLate(p: OpenInput, at: Date = new Date()): boolean {
  if (p.nonstop) return true;
  const { day } = istanbulClock(at);
  const today = p.openingHours?.[DAY_KEYS[day]!];
  if (today) {
    const range = parseRange(today);
    if (range) return isLateRange(range);
  }
  if (!p.openingHoursText) return false;
  const week = parseWeek(p.openingHoursText);
  return !!week && week[day]!.some(isLateRange);
}
