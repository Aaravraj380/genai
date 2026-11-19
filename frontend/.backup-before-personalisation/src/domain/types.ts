/**
 * Core domain types for the habit tracker.
 *
 * Everything in `src/domain` is pure TypeScript (no React, no React Native),
 * so it can be unit-tested in isolation and reused by any UI or sync layer.
 */

/**
 * A calendar day in the user's *local* time, formatted `YYYY-MM-DD`.
 *
 * We never store instants (timestamps) for completions. A habit is done "on a
 * day", and that day is whatever the user's wall clock said when they checked
 * it off. This makes streak maths immune to DST shifts and UTC offsets: two
 * keys are compared as plain calendar dates.
 */
export type DateKey = string;

/** 0 = Sunday … 6 = Saturday (same convention as `Date#getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Which days of the week a habit is expected to be done. */
export type Frequency =
  | { type: 'daily' }
  | { type: 'weekdays' } // Mon–Fri
  | { type: 'weekends' } // Sat–Sun
  | { type: 'custom'; days: Weekday[] }; // e.g. Mon/Wed/Fri = "3x a week"

/** A span during which the habit is paused. `end` is exclusive (the resume day). */
export interface PausePeriod {
  start: DateKey;
  end?: DateKey;
}

export interface Reminder {
  enabled: boolean;
  hour: number; // 0–23, local time
  minute: number; // 0–59
}

/** Icon identifiers map to MaterialIcons glyphs in `src/theme/icons.ts`. */
export type HabitIcon =
  | 'reading'
  | 'workout'
  | 'hydrate'
  | 'mind'
  | 'focus'
  | 'run'
  | 'sleep'
  | 'nutrition'
  | 'journal'
  | 'code';

/**
 * The Habit model.
 * Required by the brief: `id`, `title`, `frequency`, `creationDate`.
 * The remaining fields power the Stitch design (icons, tags, reminders, colours).
 */
export interface Habit {
  id: string;
  title: string;
  frequency: Frequency;
  /** Local calendar day the habit was created. Days before this never count as missed. */
  creationDate: DateKey;
  /** Exact creation instant (ISO-8601), kept for sync/audit only. */
  createdAt: string;
  icon: HabitIcon;
  /** Accent colour from the "Atmosphere & Glow" palette. */
  color: string;
  /** Tag shown on the card, e.g. "Mindfulness". */
  category: string;
  /** Optional subtitle, e.g. "15 min" or "Atomic Habits". */
  note?: string;
  /** Completions required in one day for the day to count (the "Target Repetition"). */
  targetPerDay: number;
  reminder?: Reminder;
  pauses: PausePeriod[];
}

/**
 * Tracking log: a map of local dates to the number of completions logged that
 * day. A day's completion *status* is `count >= habit.targetPerDay`.
 * Absent key = nothing logged.
 */
export type TrackingLog = Record<DateKey, number>;

/** Days protected by a streak freeze (a planned rest / missed-day repair). */
export type FreezeLog = Record<DateKey, true>;

export interface HabitLog {
  completions: TrackingLog;
  frozen: FreezeLog;
}

/** The status of one habit on one calendar day, as drawn on the calendar. */
export type DayStatus =
  | 'completed' // target met
  | 'frozen' // protected by a freeze: neither breaks nor extends the streak
  | 'missed' // scheduled, in the past, not done → breaks the streak
  | 'pending' // scheduled today, not done yet → does NOT break the streak
  | 'rest' // not a scheduled weekday → neutral
  | 'paused' // habit paused → neutral
  | 'before-start' // before creationDate → neutral
  | 'future'; // after today → neutral

export interface StreakRun {
  start: DateKey;
  end: DateKey;
  /** Number of completed days inside the run (frozen/rest days bridge but don't add). */
  length: number;
}
