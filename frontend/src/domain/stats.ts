/**
 * Cross-habit statistics for the Today and Analytics screens.
 * Pure functions over (habits, logs, today) so they are trivially testable
 * and can be memoised with `useMemo` in the UI.
 */
import {
  addDays,
  addMonths,
  dayIndex,
  eachDay,
  endOfMonth,
  endOfYear,
  fromDayIndex,
  maxKey,
  minKey,
  monthLabel,
  startOfMonth,
  startOfWeek,
  startOfYear,
  weekdayOf,
} from './dates';
import { completionRate, currentStreak, dayStatus, isScheduledOn, longestStreak } from './streaks';
import type { DateKey, Habit, HabitLog, Weekday } from './types';

export type Logs = Record<string, HabitLog>;
export const EMPTY_LOG: HabitLog = { completions: {}, frozen: {} };
export const logFor = (logs: Logs, id: string): HabitLog => logs[id] ?? EMPTY_LOG;

export type Period = 'weekly' | 'monthly' | 'yearly' | 'all-time';

export interface Range {
  from: DateKey;
  to: DateKey; // may extend past today (used for "target" totals)
}

/** Calendar range for the period containing `today` (weeks start Monday). */
export function periodRange(period: Period, today: DateKey, habits: Habit[], weekStartsOn: Weekday = 1): Range {
  switch (period) {
    case 'weekly':
      return { from: startOfWeek(today, weekStartsOn), to: addDays(startOfWeek(today, weekStartsOn), 6) };
    case 'monthly':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'yearly':
      return { from: startOfYear(today), to: endOfYear(today) };
    case 'all-time': {
      const first = habits.reduce((m, h) => minKey(m, h.creationDate), today);
      return { from: first, to: today };
    }
  }
}

/** The period immediately before, for "+4% vs last wk" deltas. */
export function previousRange(
  period: Period,
  today: DateKey,
  habits: Habit[],
  weekStartsOn: Weekday = 1,
): Range | null {
  const cur = periodRange(period, today, habits, weekStartsOn);
  switch (period) {
    case 'weekly':
      return { from: addDays(cur.from, -7), to: addDays(cur.from, -1) };
    case 'monthly': {
      const from = addMonths(cur.from, -1);
      return { from, to: endOfMonth(from) };
    }
    case 'yearly': {
      const from = addMonths(cur.from, -12);
      return { from, to: endOfYear(from) };
    }
    case 'all-time':
      return null;
  }
}

/** Scheduled vs completed habits on one day (today's pending habits count in `total`). */
export function dayProgress(habits: Habit[], logs: Logs, key: DateKey, today: DateKey) {
  let done = 0;
  let total = 0;
  for (const h of habits) {
    if (!isScheduledOn(h, key)) continue;
    const s = dayStatus(h, logFor(logs, h.id), key, today);
    if (s === 'frozen') continue;
    total++;
    if (s === 'completed') done++;
  }
  return { done, total, ratio: total ? done / total : 0 };
}

/** Aggregate completion rate across habits for a range. */
export function overallRate(habits: Habit[], logs: Logs, range: Range, today: DateKey) {
  let completed = 0;
  let scheduled = 0;
  for (const h of habits) {
    const r = completionRate(h, logFor(logs, h.id), range.from, range.to, today);
    completed += r.completed;
    scheduled += r.scheduled;
  }
  return { completed, scheduled, rate: scheduled ? completed / scheduled : null };
}

/** Days in range (≤ today) where every scheduled habit was completed. */
export function perfectDays(habits: Habit[], logs: Logs, range: Range, today: DateKey): number {
  let count = 0;
  const end = minKey(range.to, today);
  if (end < range.from) return 0;
  for (const key of eachDay(range.from, end)) {
    const p = dayProgress(habits, logs, key, today);
    if (p.total > 0 && p.done === p.total) count++;
  }
  return count;
}

/** Completed habit-days in range and how many were scheduled across the whole range. */
export function repsInRange(habits: Habit[], logs: Logs, range: Range, today: DateKey) {
  let reps = 0;
  let target = 0;
  for (const h of habits) {
    const log = logFor(logs, h.id);
    const start = maxKey(range.from, h.creationDate);
    if (range.to < start) continue;
    for (const key of eachDay(start, range.to)) {
      if (isScheduledOn(h, key)) target++;
      if (key <= today && dayStatus(h, log, key, today) === 'completed') reps++;
    }
  }
  return { reps, target };
}

/**
 * "Momentum" streak shown in the header flame: consecutive days on which the
 * user completed at least one habit. Days with nothing scheduled are neutral,
 * and today is pending until midnight.
 */
export function momentumStreak(habits: Habit[], logs: Logs, today: DateKey): number {
  return momentumSeries(habits, logs, today, 1)[0]?.streak ?? 0;
}

/**
 * Momentum streak value at the end of each of the last `days` days — the data
 * behind the "Streak History" chart. Computed in one forward pass.
 */
export function momentumSeries(
  habits: Habit[],
  logs: Logs,
  today: DateKey,
  days: number,
): { key: DateKey; streak: number }[] {
  if (habits.length === 0) return [];
  const first = habits.reduce((m, h) => minKey(m, h.creationDate), today);
  const out: { key: DateKey; streak: number }[] = [];
  const windowStart = dayIndex(today) - days + 1;
  let streak = 0;
  for (let i = dayIndex(first); i <= dayIndex(today); i++) {
    const key = fromDayIndex(i);
    let anyDone = false;
    let anyMissed = false;
    for (const h of habits) {
      const s = dayStatus(h, logFor(logs, h.id), key, today);
      if (s === 'completed') anyDone = true;
      else if (s === 'missed') anyMissed = true;
    }
    if (anyDone) streak++;
    else if (anyMissed) streak = 0;
    if (i >= windowStart) out.push({ key, streak });
  }
  return out;
}

/**
 * Completion rate per weekday for the momentum bars. Index 0 is the user's
 * first day of the week (`weekStartsOn`: 1 = Monday default, 0 = Sunday).
 * Unlike `completionRate`, today's pending habits count in the denominator so
 * today's bar shows live progress instead of a misleading 100%.
 */
export function weekdayRates(habits: Habit[], logs: Logs, range: Range, today: DateKey, weekStartsOn: Weekday = 1) {
  const done = Array(7).fill(0);
  const sched = Array(7).fill(0);
  const end = minKey(range.to, today);
  if (end >= range.from) {
    for (const key of eachDay(range.from, end)) {
      const idx = (weekdayOf(key) - weekStartsOn + 7) % 7;
      for (const h of habits) {
        if (!isScheduledOn(h, key)) continue;
        const s = dayStatus(h, logFor(logs, h.id), key, today);
        if (s === 'completed') {
          done[idx]++;
          sched[idx]++;
        } else if (s === 'missed' || s === 'pending') sched[idx]++; // today shows live progress
      }
    }
  }
  return done.map((d, i) => (sched[i] ? d / sched[i] : null));
}

export interface TrendPoint {
  /** First day of the bucket (a day, or the 1st of a month) — lets the UI localize labels. */
  key: DateKey;
  label: string;
  rate: number | null;
}

/**
 * Completion-rate series for the trend chart:
 * weekly → 7 days, monthly → one point per day, yearly/all-time → one per month (max 12).
 */
export function completionTrend(
  habits: Habit[],
  logs: Logs,
  period: Period,
  today: DateKey,
  weekStartsOn: Weekday = 1,
): TrendPoint[] {
  const range = periodRange(period, today, habits, weekStartsOn);
  if (period === 'weekly' || period === 'monthly') {
    return eachDay(range.from, minKey(range.to, today)).map((key) => {
      // Today's point is live progress (pending habits included), like the Orbit ring.
      const live = key === today ? dayProgress(habits, logs, key, today) : null;
      return {
        key,
        label: key.slice(8),
        rate: live ? (live.total ? live.ratio : null) : overallRate(habits, logs, { from: key, to: key }, today).rate,
      };
    });
  }
  const points: TrendPoint[] = [];
  let m = period === 'yearly' ? range.from : startOfMonth(addMonths(today, -11));
  m = maxKey(m, startOfMonth(range.from));
  while (m <= today) {
    points.push({
      key: m,
      label: monthLabel(m),
      rate: overallRate(habits, logs, { from: m, to: endOfMonth(m) }, today).rate,
    });
    m = addMonths(m, 1);
  }
  return points;
}

/** Per-habit leaderboard for "Streak Telemetry". */
export function telemetry(habits: Habit[], logs: Logs, today: DateKey) {
  return habits
    .map((h) => {
      const log = logFor(logs, h.id);
      const current = currentStreak(h, log, today);
      const longest = longestStreak(h, log, today);
      return {
        habit: h,
        current,
        longest,
        isPersonalBest: current > 0 && current === longest,
        rate: completionRate(h, log, h.creationDate, today, today).rate,
      };
    })
    .sort((a, b) => b.current - a.current || (b.rate ?? 0) - (a.rate ?? 0));
}

export interface Milestone {
  id: string;
  title: string;
  target: number;
  progress: number;
  unlocked: boolean;
  icon: 'military-tech' | 'workspace-premium' | 'emoji-events' | 'bolt';
}

/** Badges unlocked by the best streak of any habit (and total reps). */
export function milestones(habits: Habit[], logs: Logs, today: DateKey): Milestone[] {
  let best = 0;
  let reps = 0;
  for (const h of habits) {
    best = Math.max(best, longestStreak(h, logFor(logs, h.id), today));
    reps += repsInRange([h], logs, { from: h.creationDate, to: today }, today).reps;
  }
  const streakBadge = (id: string, title: string, target: number, icon: Milestone['icon']): Milestone => ({
    id,
    title,
    target,
    progress: Math.min(best, target),
    unlocked: best >= target,
    icon,
  });
  return [
    streakBadge('7d', '7-Day Warrior', 7, 'military-tech'),
    streakBadge('21d', '21-Day Habit', 21, 'bolt'),
    streakBadge('30d', '30-Day Master', 30, 'workspace-premium'),
    {
      id: '100r',
      title: 'Century Club',
      target: 100,
      progress: Math.min(reps, 100),
      unlocked: reps >= 100,
      icon: 'emoji-events',
    },
  ];
}
