/**
 * Write-through persistence: the Zustand stores stay the in-memory source of
 * truth for the UI, and every state change is turned into the *minimal* set
 * of SQL writes by comparing the previous and next state. Because store
 * updates are immutable, unchanged habits/logs keep the same object
 * reference, so the diff is cheap and exact.
 */
import type { Habit, HabitLog } from '@/domain/types';

import type { DbClient } from './client';
import { deleteHabit, saveSetting, setCompletion, setFrozen, setMeta, writeHabit } from './repository';

export interface HabitData {
  habits: Habit[];
  logs: Record<string, HabitLog>;
  lastActiveDate: string | null;
}

/** Persist the difference between two habit-store states in one transaction. */
export async function syncHabitState(db: DbClient, prev: HabitData, next: HabitData): Promise<boolean> {
  const habitsChanged = prev.habits !== next.habits;
  const logsChanged = prev.logs !== next.logs;
  const metaChanged = prev.lastActiveDate !== next.lastActiveDate;
  if (!habitsChanged && !logsChanged && !metaChanged) return false;

  await db.withTransactionAsync(async () => {
    if (habitsChanged) {
      const nextIds = new Set(next.habits.map((h) => h.id));
      for (const h of prev.habits) if (!nextIds.has(h.id)) await deleteHabit(db, h.id);
      const prevIndex = new Map(prev.habits.map((h, i) => [h.id, { h, i }]));
      for (let i = 0; i < next.habits.length; i++) {
        const h = next.habits[i];
        const before = prevIndex.get(h.id);
        if (!before || before.h !== h || before.i !== i) await writeHabit(db, h, i);
      }
    }
    if (logsChanged) {
      const live = new Set(next.habits.map((h) => h.id));
      for (const [id, log] of Object.entries(next.logs)) {
        const old = prev.logs[id];
        if (old === log || !live.has(id)) continue;
        await diffMap(old?.completions ?? {}, log.completions, (date, count) => setCompletion(db, id, date, count ?? 0));
        await diffMap(old?.frozen ?? {}, log.frozen, (date, on) => setFrozen(db, id, date, on === true));
      }
    }
    if (metaChanged) await setMeta(db, 'last_active_date', next.lastActiveDate);
  });
  return true;
}

async function diffMap<V>(a: Record<string, V>, b: Record<string, V>, write: (key: string, value: V | undefined) => Promise<void>) {
  if (a === b) return;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] !== b[key]) await write(key, b[key]);
  }
}

/** Persist only the settings fields whose values changed. */
export async function syncSettings(
  db: DbClient,
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  keys: readonly string[],
): Promise<boolean> {
  const changed = keys.filter((k) => prev[k] !== next[k]);
  if (!changed.length) return false;
  await db.withTransactionAsync(async () => {
    for (const k of changed) await saveSetting(db, k, next[k]);
  });
  return true;
}

/** Runs async writes one after another so they reach SQLite in order. */
export function createWriteQueue(onError: (e: unknown) => void = (e) => console.warn('[db] write failed', e)) {
  let tail: Promise<void> = Promise.resolve();
  return {
    push(task: () => Promise<unknown>) {
      tail = tail.then(task).then(
        () => undefined,
        (e) => onError(e),
      );
      return tail;
    },
    /** Resolves when every queued write has finished (used by tests). */
    idle: () => tail,
  };
}
