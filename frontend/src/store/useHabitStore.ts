/**
 * Global state (Zustand) — offline-first. Saved to the on-device SQLite
 * database by `src/db` (see db/index.ts: load on launch, write-through on change).
 *
 * The store only holds raw facts (habits + per-day logs). Everything derived —
 * streaks, rates, charts — is computed by the pure functions in `src/domain`
 * and memoised in components. That keeps persistence small and makes it
 * impossible for a cached streak to drift out of sync with the log.
 */
import { create } from 'zustand';

import { canFreeze, type ReentryReport } from '@/domain/freezes';
import { EMPTY_LOG } from '@/domain/stats';
import { buildDemoData, createId, habitFromTemplate, type HabitTemplate } from '@/domain/templates';
import { mergeSnapshots } from '@/services/sync';
import type { DateKey, Habit, HabitLog } from '@/domain/types';

export type HabitInput = Omit<Habit, 'id' | 'creationDate' | 'createdAt' | 'pauses'>;

export interface HabitState {
  habits: Habit[];
  logs: Record<string, HabitLog>;
  /** Last local day the app was opened — drives the "welcome back" flow. */
  lastActiveDate: DateKey | null;
  /** True once the database has been read (avoid flashing the empty state). */
  hasHydrated: boolean;

  addHabit: (input: HabitInput, today: DateKey) => Habit;
  addFromTemplate: (template: HabitTemplate, today: DateKey) => Habit;
  updateHabit: (id: string, patch: Partial<HabitInput>) => void;
  deleteHabit: (id: string) => void;

  /** Tap on a habit: +1 towards the daily target; tapping a completed day clears it. Returns the new count. */
  tapHabit: (id: string, key: DateKey, today: DateKey) => number;
  setCount: (id: string, key: DateKey, count: number, today: DateKey) => void;

  /** `allowance` = the user's freezes-per-month setting (defaults to 2). */
  freezeDay: (id: string, key: DateKey, today: DateKey, allowance?: number) => boolean;
  unfreezeDay: (id: string, key: DateKey) => void;
  repairStreaks: (report: ReentryReport, today: DateKey, allowance?: number) => number;

  pauseHabit: (id: string, today: DateKey) => void;
  resumeHabit: (id: string, today: DateKey) => void;

  markActive: (today: DateKey) => void;
  loadDemoData: (today: DateKey, localize?: (t: HabitTemplate) => HabitTemplate) => void;
  /** Restore from a backup: 'replace' swaps everything, 'merge' unions with current data. */
  importData: (data: { habits: Habit[]; logs: Record<string, HabitLog> }, mode: 'merge' | 'replace') => void;
  resetAll: () => void;
}

const logOf = (s: HabitState, id: string): HabitLog => s.logs[id] ?? EMPTY_LOG;

export const useHabitStore = create<HabitState>()((set, get) => ({
  habits: [],
  logs: {},
  lastActiveDate: null,
  hasHydrated: false,

  addHabit: (input, today) => {
    const habit: Habit = {
      ...input,
      title: input.title.trim(),
      targetPerDay: Math.max(1, Math.round(input.targetPerDay)),
      id: createId(),
      creationDate: today,
      createdAt: new Date().toISOString(),
      pauses: [],
    };
    set((s) => ({ habits: [...s.habits, habit], logs: { ...s.logs, [habit.id]: { completions: {}, frozen: {} } } }));
    return habit;
  },

  addFromTemplate: (template, today) => {
    const habit = habitFromTemplate(template, today);
    set((s) => ({ habits: [...s.habits, habit], logs: { ...s.logs, [habit.id]: { completions: {}, frozen: {} } } }));
    return habit;
  },

  updateHabit: (id, patch) =>
    set((s) => ({
      habits: s.habits.map((h) =>
        h.id === id
          ? {
              ...h,
              ...patch,
              title: (patch.title ?? h.title).trim(),
              targetPerDay: Math.max(1, Math.round(patch.targetPerDay ?? h.targetPerDay)),
            }
          : h,
      ),
    })),

  deleteHabit: (id) =>
    set((s) => {
      const { [id]: _removed, ...logs } = s.logs;
      return { habits: s.habits.filter((h) => h.id !== id), logs };
    }),

  tapHabit: (id, key, today) => {
    const habit = get().habits.find((h) => h.id === id);
    if (!habit) return 0;
    const current = logOf(get(), id).completions[key] ?? 0;
    const next = current >= habit.targetPerDay ? 0 : current + 1;
    get().setCount(id, key, next, today);
    return next;
  },

  setCount: (id, key, count, today) => {
    const habit = get().habits.find((h) => h.id === id);
    // Guards: no logging the future or before the habit existed.
    if (!habit || key > today || key < habit.creationDate) return;
    set((s) => {
      const log = logOf(s, id);
      const completions = { ...log.completions };
      if (count <= 0) delete completions[key];
      else completions[key] = Math.min(count, habit.targetPerDay);
      // A real completion supersedes a freeze and refunds it.
      const frozen = { ...log.frozen };
      if (count >= habit.targetPerDay) delete frozen[key];
      return { logs: { ...s.logs, [id]: { completions, frozen } } };
    });
  },

  freezeDay: (id, key, today, allowance) => {
    const habit = get().habits.find((h) => h.id === id);
    if (!habit) return false;
    if (!canFreeze(habit, logOf(get(), id), key, today, allowance).ok) return false;
    set((s) => {
      const log = logOf(s, id);
      return { logs: { ...s.logs, [id]: { ...log, frozen: { ...log.frozen, [key]: true } } } };
    });
    return true;
  },

  unfreezeDay: (id, key) =>
    set((s) => {
      const log = logOf(s, id);
      const { [key]: _gone, ...frozen } = log.frozen;
      return { logs: { ...s.logs, [id]: { ...log, frozen } } };
    }),

  repairStreaks: (report, today, allowance) => {
    let repaired = 0;
    for (const b of report.broken) {
      if (!b.repairable) continue;
      const ok = b.missedDays.every((k) => get().freezeDay(b.habitId, k, today, allowance));
      if (ok) repaired++;
    }
    return repaired;
  },

  pauseHabit: (id, today) =>
    set((s) => ({
      habits: s.habits.map((h) =>
        h.id === id && !h.pauses.some((p) => !p.end) ? { ...h, pauses: [...h.pauses, { start: today }] } : h,
      ),
    })),

  resumeHabit: (id, today) =>
    set((s) => ({
      habits: s.habits.map((h) => {
        if (h.id !== id) return h;
        const pauses = h.pauses
          .map((p) => (p.end ? p : { ...p, end: today }))
          // A pause started and ended on the same day never happened.
          .filter((p) => p.start !== p.end);
        return { ...h, pauses };
      }),
    })),

  markActive: (today) => set({ lastActiveDate: today }),

  loadDemoData: (today, localize) => {
    const demo = buildDemoData(today, localize);
    set({ habits: demo.habits, logs: demo.logs, lastActiveDate: today });
  },

  importData: (data, mode) => {
    if (mode === 'replace') {
      set({ habits: data.habits, logs: data.logs });
      return;
    }
    const merged = mergeSnapshots({ habits: get().habits, logs: get().logs }, data);
    set({ habits: merged.habits, logs: merged.logs });
  },

  resetAll: () => set({ habits: [], logs: {}, lastActiveDate: null }),
}));

/* Selectors (stable references keep re-renders minimal). */
export const selectHabits = (s: HabitState) => s.habits;
export const selectLogs = (s: HabitState) => s.logs;
