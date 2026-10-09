import type { Parking } from '@/data/types';

export type OpenState = 'open' | 'closed' | 'unknown';

type OpenInput = Partial<Pick<Parking, 'isOpen' | 'nonstop' | 'openingHours' | 'openingHoursText'>>;

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

const RANGE = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/;

/** "HH:MM–HH:MM" (en dash or hyphen) as [start, end] minutes, or null. */
function parseRange(text: string): [number, number] | null {
  const m = RANGE.exec(text.trim());
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (Number(m[2]) > 59 || Number(m[4]) > 59 || start > 24 * 60 || end > 24 * 60) return null;
  return [start, end];
}

/** Overnight ranges (22:00–02:00) are open after the start and before the end. */
function inRange([start, end]: [number, number], minutes: number): boolean {
  if (start === end) return true; // 00:00–00:00 / 24h
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function fromText(text: string, day: number, minutes: number): OpenState {
  const [hours, ...rest] = text.split(',').map((s) => s.trim());
  const range = parseRange(hours ?? '');
  if (!range) return 'unknown';
  // Extra parts such as "Pazar Günleri Kapalı"; anything else makes the text unreadable.
  for (const part of rest) {
    const m = /^(\S+)\s+günleri\s+kapalı$/i.exec(part.toLocaleLowerCase('tr'));
    const closedDay = m ? TR_DAYS.indexOf(m[1]!) : -1;
    if (closedDay < 0) return 'unknown';
    if (closedDay === day) return 'closed';
  }
  return inRange(range, minutes) ? 'open' : 'closed';
}

const TURKEY_OFFSET_MS = 3 * 3600_000;

/** Weekday (0 = Sunday) and minutes since midnight in Turkey (fixed UTC+3, no DST). */
export function istanbulClock(now: Date): { day: number; minutes: number } {
  const d = new Date(now.getTime() + TURKEY_OFFSET_MS);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/**
 * Whether a car park is open at `now` (Turkey time, UTC+3). Order: live
 * `isOpen`, `nonstop`, the per-day table, then static "HH:MM–HH:MM" text.
 * Anything it cannot read is 'unknown', never guessed.
 */
export function openState(p: OpenInput, now: Date = new Date()): OpenState {
  if (p.isOpen != null) return p.isOpen ? 'open' : 'closed';
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
