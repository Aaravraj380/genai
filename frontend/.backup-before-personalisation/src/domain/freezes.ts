/**
 * Streak freezes and the "welcome back" re-entry analysis.
 *
 * Freezes let a user protect a missed day (or pre-plan a rest day) without
 * breaking the chain. Each habit gets FREEZES_PER_MONTH per calendar month,
 * and a missed day can only be repaired within REPAIR_WINDOW_DAYS so the
 * feature can't be used to rewrite ancient history.
 */
import { addDays, diffDays, eachDay, monthId } from './dates';
import { currentStreak, dayStatus } from './streaks';
import type { DateKey, Habit, HabitLog } from './types';

export const FREEZES_PER_MONTH = 2;
export const REPAIR_WINDOW_DAYS = 7;

export function freezesUsedInMonth(log: HabitLog, key: DateKey): number {
  const m = monthId(key);
  return Object.keys(log.frozen).filter((k) => monthId(k) === m).length;
}

export function freezesAvailable(log: HabitLog, key: DateKey): number {
  return Math.max(0, FREEZES_PER_MONTH - freezesUsedInMonth(log, key));
}

export type FreezeCheck =
  | { ok: true }
  | { ok: false; reason: 'completed' | 'future' | 'today' | 'too-old' | 'not-needed' | 'no-freezes' | 'already' };

/**
 * Can `key` be frozen? Only past, scheduled, un-completed days inside the
 * repair window qualify, and the month must still have freezes left.
 */
export function canFreeze(habit: Habit, log: HabitLog, key: DateKey, today: DateKey): FreezeCheck {
  if (log.frozen[key]) return { ok: false, reason: 'already' };
  const status = dayStatus(habit, log, key, today);
  if (status === 'future') return { ok: false, reason: 'future' };
  if (status === 'pending') return { ok: false, reason: 'today' };
  if (status === 'completed') return { ok: false, reason: 'completed' };
  if (status !== 'missed') return { ok: false, reason: 'not-needed' };
  if (diffDays(key, today) > REPAIR_WINDOW_DAYS) return { ok: false, reason: 'too-old' };
  if (freezesAvailable(log, key) <= 0) return { ok: false, reason: 'no-freezes' };
  return { ok: true };
}

export interface BrokenStreak {
  habitId: string;
  /** Streak that was alive right before the first missed day. */
  previousStreak: number;
  missedDays: DateKey[];
  /** True when every missed day can be covered by freezes (per-month budget respected). */
  repairable: boolean;
}

export interface ReentryReport {
  /** Whole days since the app was last opened. */
  daysAway: number;
  broken: BrokenStreak[];
  /** Habits that kept their streak alive (e.g. only rest days in between). */
  intactCount: number;
}

/**
 * Called on launch / resume. If the user has been away for 2+ days, work out
 * which streaks died while they were gone and whether freezes can save them.
 *
 * Example: last opened Mon, reopened Thu → daysAway = 3; Mon (if left
 * unfinished), Tue and Wed are inspected. Thu is today and still pending.
 */
export function analyzeReturn(
  habits: Habit[],
  logs: Record<string, HabitLog>,
  lastActive: DateKey | null,
  today: DateKey,
): ReentryReport | null {
  if (!lastActive) return null;
  const daysAway = diffDays(lastActive, today);
  if (daysAway < 2) return null; // same day or opened yesterday: nothing surprising happened

  const window = eachDay(lastActive, addDays(today, -1));
  const broken: BrokenStreak[] = [];
  let intactCount = 0;

  for (const habit of habits) {
    const log = logs[habit.id] ?? { completions: {}, frozen: {} };
    const missedDays = window.filter((k) => dayStatus(habit, log, k, today) === 'missed');
    if (missedDays.length === 0) {
      intactCount++;
      continue;
    }
    // Treat the first missed day as "today" to read the streak that was alive just before it.
    const previousStreak = currentStreak(habit, log, missedDays[0]);
    if (previousStreak === 0) continue; // nothing was lost

    broken.push({
      habitId: habit.id,
      previousStreak,
      missedDays,
      repairable: isRepairable(log, missedDays, today),
    });
  }
  return { daysAway, broken, intactCount };
}

function isRepairable(log: HabitLog, missed: DateKey[], today: DateKey): boolean {
  if (missed.some((k) => diffDays(k, today) > REPAIR_WINDOW_DAYS)) return false;
  const needByMonth = new Map<string, number>();
  for (const k of missed) needByMonth.set(monthId(k), (needByMonth.get(monthId(k)) ?? 0) + 1);
  for (const [m, need] of needByMonth) {
    if (freezesAvailable(log, `${m}-01`) < need) return false;
  }
  return true;
}
