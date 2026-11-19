/**
 * Streak Calculation Engine.
 *
 * Rules (documented once here, enforced everywhere):
 *  1. A day is COMPLETED when `completions[day] >= habit.targetPerDay`.
 *     Every completed day adds 1 to the running streak — including a bonus
 *     completion on a non-scheduled day.
 *  2. A SCHEDULED past day that is not completed and not frozen is MISSED and
 *     resets the streak to 0.
 *  3. TODAY is never "missed". Until midnight it is PENDING: the streak shown
 *     is the chain that ended yesterday, and completing today extends it.
 *  4. Rest days (not scheduled), paused days, frozen days and days before the
 *     habit existed are NEUTRAL: they bridge a streak without adding to it.
 *  5. All comparisons are on local calendar `DateKey`s (see dates.ts), so a
 *     check-off at 23:59 belongs to that day, and one at 00:00 to the next,
 *     regardless of time zone or DST.
 */
import { addDays, dayIndex, eachDay, fromDayIndex, minKey, weekdayOf } from './dates';
import type { DateKey, DayStatus, Frequency, Habit, HabitLog, StreakRun, Weekday } from './types';

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

export function frequencyDays(freq: Frequency): Weekday[] {
  switch (freq.type) {
    case 'daily':
      return [0, 1, 2, 3, 4, 5, 6];
    case 'weekdays':
      return [1, 2, 3, 4, 5];
    case 'weekends':
      return [0, 6];
    case 'custom':
      return [...new Set(freq.days)].sort() as Weekday[];
  }
}

export function isWeekdayScheduled(freq: Frequency, weekday: Weekday): boolean {
  return frequencyDays(freq).includes(weekday);
}

export function isPausedOn(habit: Pick<Habit, 'pauses'>, key: DateKey): boolean {
  return habit.pauses.some((p) => key >= p.start && (p.end === undefined || key < p.end));
}

export function isCurrentlyPaused(habit: Pick<Habit, 'pauses'>, today: DateKey): boolean {
  return isPausedOn(habit, today);
}

/** Is the habit *expected* to be done on this day? */
export function isScheduledOn(habit: Habit, key: DateKey): boolean {
  if (key < habit.creationDate) return false;
  if (isPausedOn(habit, key)) return false;
  return isWeekdayScheduled(habit.frequency, weekdayOf(key));
}

export function isCompleteOn(habit: Habit, log: HabitLog, key: DateKey): boolean {
  return (log.completions[key] ?? 0) >= Math.max(1, habit.targetPerDay);
}

/* ------------------------------------------------------------------ */
/* Day status                                                          */
/* ------------------------------------------------------------------ */

export function dayStatus(habit: Habit, log: HabitLog, key: DateKey, today: DateKey): DayStatus {
  if (key > today) return 'future';
  if (key < habit.creationDate) return 'before-start';
  if (isCompleteOn(habit, log, key)) return 'completed';
  if (log.frozen[key]) return 'frozen';
  if (isPausedOn(habit, key)) return 'paused';
  if (!isWeekdayScheduled(habit.frequency, weekdayOf(key))) return 'rest';
  if (key === today) return 'pending';
  return 'missed';
}

/* ------------------------------------------------------------------ */
/* Streaks                                                             */
/* ------------------------------------------------------------------ */

/**
 * Current active streak as of `today`.
 * Walks backwards from today to the creation date — O(days since creation),
 * which stays well under a millisecond even for multi-year habits.
 */
export function currentStreak(habit: Habit, log: HabitLog, today: DateKey): number {
  let streak = 0;
  const stop = dayIndex(habit.creationDate);
  for (let i = dayIndex(today); i >= stop; i--) {
    const status = dayStatus(habit, log, fromDayIndex(i), today);
    if (status === 'completed') streak++;
    else if (status === 'missed') break;
    // frozen / rest / paused / pending → neutral, keep walking
  }
  return streak;
}

/**
 * Every streak run from creation to `today`, oldest first. A run is closed by
 * a missed day; the final run may still be open (the current streak).
 */
export function streakRuns(habit: Habit, log: HabitLog, today: DateKey): StreakRun[] {
  const runs: StreakRun[] = [];
  if (today < habit.creationDate) return runs;
  let open: StreakRun | null = null;
  for (const key of eachDay(habit.creationDate, today)) {
    const status = dayStatus(habit, log, key, today);
    if (status === 'completed') {
      if (open) {
        open.end = key;
        open.length++;
      } else {
        open = { start: key, end: key, length: 1 };
      }
    } else if (status === 'missed' && open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  return runs;
}

/** Historical longest streak (includes the current one). */
export function longestStreak(habit: Habit, log: HabitLog, today: DateKey): number {
  return bestRun(habit, log, today)?.length ?? 0;
}

/** The longest run; on ties the most recent wins (so "Best: <month>" is fresh). */
export function bestRun(habit: Habit, log: HabitLog, today: DateKey): StreakRun | null {
  let best: StreakRun | null = null;
  for (const run of streakRuns(habit, log, today)) {
    if (!best || run.length >= best.length) best = run;
  }
  return best;
}

/** Total completed days up to and including today (future entries are ignored). */
export function totalCompletions(habit: Habit, log: HabitLog, today: DateKey): number {
  let total = 0;
  for (const key of Object.keys(log.completions)) {
    if (key <= today && key >= habit.creationDate && isCompleteOn(habit, log, key)) total++;
  }
  return total;
}

export interface RateResult {
  completed: number;
  scheduled: number;
  /** 0–1, or null when nothing was scheduled in the range. */
  rate: number | null;
}

/**
 * Completion rate over [from, to] ∩ [creationDate, today].
 * Denominator = scheduled days that are decided (completed or missed).
 * Today counts only once it's completed, so the rate never dips during the day.
 * Frozen days are excluded from both sides.
 */
export function completionRate(
  habit: Habit,
  log: HabitLog,
  from: DateKey,
  to: DateKey,
  today: DateKey,
): RateResult {
  let completed = 0;
  let scheduled = 0;
  const end = minKey(to, today);
  const start = from < habit.creationDate ? habit.creationDate : from;
  if (end < start) return { completed, scheduled, rate: null };
  for (const key of eachDay(start, end)) {
    if (!isScheduledOn(habit, key)) continue;
    const status = dayStatus(habit, log, key, today);
    if (status === 'completed') {
      completed++;
      scheduled++;
    } else if (status === 'missed') {
      scheduled++;
    }
  }
  return { completed, scheduled, rate: scheduled ? completed / scheduled : null };
}

/** Convenience bundle used by the Habit Detail screen. */
export function habitSummary(habit: Habit, log: HabitLog, today: DateKey) {
  const best = bestRun(habit, log, today);
  return {
    current: currentStreak(habit, log, today),
    longest: best?.length ?? 0,
    bestRun: best,
    total: totalCompletions(habit, log, today),
    rate: completionRate(habit, log, habit.creationDate, today, today).rate,
  };
}

/** Days until the streak beats the personal best (0 if it already equals/beats it). */
export function daysToBeatBest(current: number, longest: number): number {
  return Math.max(0, longest - current + (current >= longest ? 0 : 1));
}

/** Next date on/after `from` when the habit is scheduled (for "next up" hints). */
export function nextScheduledDay(habit: Habit, from: DateKey, horizon = 14): DateKey | null {
  for (let i = 0; i <= horizon; i++) {
    const key = addDays(from, i);
    if (isScheduledOn(habit, key)) return key;
  }
  return null;
}
