/**
 * Calendar-date utilities built on `DateKey` strings (`YYYY-MM-DD`).
 *
 * Design rule: *all* day arithmetic is done on integer "day indexes" computed
 * with `Date.UTC`, never by adding 24h to a local timestamp. Local days are
 * 23 or 25 hours long on DST transition days, which is the classic source of
 * off-by-one streak bugs. Converting to UTC midnight first sidesteps that.
 */
import type { DateKey, Weekday } from './types';

const MS_PER_DAY = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Build a key from calendar parts (month is 1-based). */
export function makeDateKey(year: number, month: number, day: number): DateKey {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Intl formatters are expensive to construct, so cache one per time zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/**
 * Convert an instant to the calendar day it falls on.
 * - Without `timeZone`: the device's current local zone (normal app usage).
 * - With an IANA `timeZone`: that zone (used by tests and by sync code that
 *   must reason about another device's day).
 */
export function toDateKey(date: Date, timeZone?: string): DateKey {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid Date');
  if (!timeZone) {
    return makeDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return makeDateKey(get('year'), get('month'), get('day'));
}

/** Today's key for the device (or the given zone). `now` is injectable for tests. */
export function todayKey(now: Date = new Date(), timeZone?: string): DateKey {
  return toDateKey(now, timeZone);
}

export function isValidDateKey(key: string): key is DateKey {
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = KEY_RE.exec(key);
  if (!m) throw new RangeError(`Invalid DateKey: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Days since 1970-01-01 for a calendar date. Integer, DST-proof. */
export function dayIndex(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromDayIndex(index: number): DateKey {
  const d = new Date(index * MS_PER_DAY);
  return makeDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromDayIndex(dayIndex(key) + days);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: DateKey, b: DateKey): number {
  return dayIndex(b) - dayIndex(a);
}

export function weekdayOf(key: DateKey): Weekday {
  return new Date(dayIndex(key) * MS_PER_DAY).getUTCDay() as Weekday;
}

/** Keys are zero-padded, so lexical comparison equals chronological comparison. */
export const isBefore = (a: DateKey, b: DateKey) => a < b;
export const isAfter = (a: DateKey, b: DateKey) => a > b;
export const minKey = (a: DateKey, b: DateKey) => (a < b ? a : b);
export const maxKey = (a: DateKey, b: DateKey) => (a > b ? a : b);

/** Inclusive list of keys from `start` to `end` (empty if end < start). */
export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const s = dayIndex(start);
  const e = dayIndex(end);
  for (let i = s; i <= e; i++) out.push(fromDayIndex(i));
  return out;
}

/** Start of the week containing `key`. Default Monday-first, matching the design. */
export function startOfWeek(key: DateKey, weekStartsOn: Weekday = 1): DateKey {
  const offset = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key);
  return makeDateKey(year, month, 1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function endOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key);
  return makeDateKey(year, month, daysInMonth(year, month));
}

/** Shift by whole months, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeDateKey(y, m, Math.min(day, daysInMonth(y, m)));
}

export function startOfYear(key: DateKey): DateKey {
  return makeDateKey(parseDateKey(key).year, 1, 1);
}

export function endOfYear(key: DateKey): DateKey {
  return makeDateKey(parseDateKey(key).year, 12, 31);
}

/** `YYYY-MM` bucket id, used for per-month freeze allowances and charts. */
export function monthId(key: DateKey): string {
  return key.slice(0, 7);
}

/**
 * Milliseconds until the next local midnight. Uses the local `Date`
 * constructor so DST days (23h/25h) are handled by the platform.
 */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const formatMonthShort = (key: DateKey) =>
  `${MONTHS[parseDateKey(key).month - 1]} ${parseDateKey(key).year}`;
export const formatMonthLong = (key: DateKey) =>
  `${MONTHS_LONG[parseDateKey(key).month - 1]} ${parseDateKey(key).year}`;
export const monthLabel = (key: DateKey) => MONTHS[parseDateKey(key).month - 1];
export const weekdayShort = (key: DateKey) => WEEKDAYS_SHORT[weekdayOf(key)];
export const WEEKDAY_LABELS = WEEKDAYS_SHORT;
