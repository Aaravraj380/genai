import type { DateKey, Habit, HabitLog } from '../types';

/** Build a habit with sensible defaults; override only what a test cares about. */
export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Test habit',
    frequency: { type: 'daily' },
    creationDate: '2026-01-01',
    createdAt: '2026-01-01T08:00:00.000Z',
    icon: 'mind',
    color: '#4edea3',
    category: 'Test',
    targetPerDay: 1,
    pauses: [],
    ...overrides,
  };
}

/** Build a log from lists of completed and frozen days. */
export function makeLog(done: DateKey[] = [], frozen: DateKey[] = [], count = 1): HabitLog {
  return {
    completions: Object.fromEntries(done.map((k) => [k, count])),
    frozen: Object.fromEntries(frozen.map((k) => [k, true as const])),
  };
}

/** Deterministic PRNG (mulberry32) for property-style tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
