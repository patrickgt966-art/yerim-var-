/** Looks up a text by its i18n key (the `food.hoursFmt.*` keys); keeps this file free of i18next. */
export type HoursText = (key: string) => string;

const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const DAY_TOKEN = `(?:${DAY}(?:-${DAY})?|PH)`;
const SELECTOR = new RegExp(`^(${DAY_TOKEN}(?:\\s*,\\s*${DAY_TOKEN})*)\\s+(.+)$`);
const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

const EN_DASH = '–';

function dayName(code: string, text: HoursText): string {
  return text(`food.hoursFmt.${code.toLowerCase()}`);
}

/** "Mo-Fr" -> "Pzt–Cum", "Sa" -> "Cmt", "PH" -> "Resmî tatiller". */
function dayToken(token: string, text: HoursText): string {
  if (token === 'PH') return text('food.hoursFmt.holidays');
  const [from, to] = token.split('-') as [string, string?];
  return to ? `${dayName(from, text)}${EN_DASH}${dayName(to, text)}` : dayName(from, text);
}

function validTime(h: string, m: string): boolean {
  const hour = Number(h);
  const min = Number(m);
  return min <= 59 && (hour < 24 || (hour === 24 && min === 0));
}

/** "9:00-14:00, 17:00-23:00" -> "09:00–14:00, 17:00–23:00"; "off" / "closed" -> "kapalı"; else null. */
function timesText(src: string, text: HoursText): string | null {
  const t = src.trim();
  if (/^(?:off|closed)$/i.test(t)) return text('food.hoursFmt.closed');
  const out: string[] = [];
  for (const part of t.split(',')) {
    const m = TIME_RANGE.exec(part.trim());
    if (!m || !validTime(m[1]!, m[2]!) || !validTime(m[3]!, m[4]!)) return null;
    out.push(`${m[1]!.padStart(2, '0')}:${m[2]}${EN_DASH}${m[3]!.padStart(2, '0')}:${m[4]}`);
  }
  return out.join(', ');
}

/** One ";"-separated rule as a line, or null when any part of it is not understood. */
function ruleLine(rule: string, text: HoursText): string | null {
  if (/^24\s*\/\s*7$/.test(rule)) return text('food.hoursFmt.allDay');
  const m = SELECTOR.exec(rule);
  const times = timesText(m ? m[2]! : rule, text);
  if (times == null) return null;
  if (!m) return times;
  const days = m[1]!.split(',').map((d) => dayToken(d.trim(), text));
  return `${days.join(', ')} ${times}`;
}

/**
 * An OSM `opening_hours` value as readable lines, one per rule: "Mo-Fr 09:00-18:00; Sa off" ->
 * ["Pzt–Cum 09:00–18:00", "Cmt kapalı"]. Reads day names and ranges, "24/7", "off" / "closed",
 * several time ranges and "PH" (public holidays). If any part cannot be read, the whole value is
 * returned unchanged as the only line: a partial or guessed translation would be wrong.
 */
export function formatOpeningHours(raw: string, text: HoursText): string[] {
  const src = raw.trim();
  if (src === '') return [];
  const rules = src
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const rule of rules) {
    const line = ruleLine(rule, text);
    if (line == null) return [raw];
    lines.push(line);
  }
  return lines.length > 0 ? lines : [raw];
}
