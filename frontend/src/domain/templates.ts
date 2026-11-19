/**
 * Habit templates (the "Explore" library) and deterministic demo data.
 */
import { addDays, eachDay } from './dates';
import type { DateKey, Frequency, Habit, HabitIcon, HabitLog, Reminder } from './types';

export interface HabitTemplate {
  key: string;
  title: string;
  icon: HabitIcon;
  category: string;
  note?: string;
  color: string;
  frequency: Frequency;
  reminder?: Reminder;
  targetPerDay?: number;
}

/** The six rituals shown on the Stitch "Today" screen, plus a few extras. */
export const TEMPLATES: HabitTemplate[] = [
  { key: 'meditation', title: 'Morning Meditation', icon: 'mind', category: 'Mindfulness', note: '15 min', color: '#8C9CCB', frequency: { type: 'daily' }, reminder: { enabled: true, hour: 7, minute: 0 } },
  { key: 'hydration', title: 'Cold Hydration 4L', icon: 'hydrate', category: 'Health', note: 'Electrolytes', color: '#4EDEA3', frequency: { type: 'daily' }, reminder: { enabled: true, hour: 8, minute: 0 } },
  { key: 'deep-work', title: 'Deep Work (90m Session)', icon: 'code', category: 'Focus', color: '#5B7FD1', frequency: { type: 'weekdays' }, reminder: { enabled: true, hour: 10, minute: 0 } },
  { key: 'gym', title: 'Gym / Resistance Workout', icon: 'workout', category: 'Fitness', color: '#C2570F', frequency: { type: 'custom', days: [1, 3, 5] }, reminder: { enabled: true, hour: 16, minute: 30 } },
  { key: 'reading', title: 'Read 20 Pages', icon: 'reading', category: 'Learning', note: 'Atomic Habits', color: '#C88A6E', frequency: { type: 'daily' }, reminder: { enabled: true, hour: 21, minute: 0 } },
  { key: 'screen-free', title: 'Screen-Free at 10 PM', icon: 'sleep', category: 'Recovery', color: '#C9B2A6', frequency: { type: 'daily' }, reminder: { enabled: true, hour: 22, minute: 0 } },
  { key: 'run', title: 'Morning Run 5K', icon: 'run', category: 'Fitness', color: '#C2570F', frequency: { type: 'custom', days: [2, 4, 6] }, reminder: { enabled: true, hour: 6, minute: 30 } },
  { key: 'journal', title: 'Evening Journal', icon: 'journal', category: 'Mindfulness', note: '3 wins, 1 lesson', color: '#8C9CCB', frequency: { type: 'daily' }, reminder: { enabled: true, hour: 21, minute: 30 } },
  { key: 'water', title: 'Drink 8 Glasses', icon: 'hydrate', category: 'Health', color: '#4EDEA3', frequency: { type: 'daily' }, targetPerDay: 8 },
  { key: 'protein', title: 'Protein-First Breakfast', icon: 'nutrition', category: 'Health', color: '#C9B2A6', frequency: { type: 'weekdays' }, reminder: { enabled: false, hour: 8, minute: 30 } },
];

export const STARTER_KEYS = ['meditation', 'hydration', 'deep-work', 'gym', 'reading', 'screen-free'];

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function habitFromTemplate(t: HabitTemplate, today: DateKey, now = new Date()): Habit {
  return {
    id: createId(),
    title: t.title,
    icon: t.icon,
    category: t.category,
    note: t.note,
    color: t.color,
    frequency: t.frequency,
    reminder: t.reminder,
    targetPerDay: t.targetPerDay ?? 1,
    creationDate: today,
    createdAt: now.toISOString(),
    pauses: [],
    templateKey: t.key,
  };
}

/**
 * Demo history: 60 days of plausible, *deterministic* check-offs so the
 * Analytics and Detail screens have something to show on first run.
 * Clearly labelled "sample data" in the UI and removable via Reset.
 */
export function buildDemoData(
  today: DateKey,
  /** Optional translator so sample habits appear in the user's language. */
  localize: (t: HabitTemplate) => HabitTemplate = (t) => t,
): { habits: Habit[]; logs: Record<string, HabitLog> } {
  const start = addDays(today, -60);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const reliability = [0.96, 0.93, 0.85, 0.8, 0.97, 0.75];
  const habits = STARTER_KEYS.map((k) => {
    const h = habitFromTemplate(localize(TEMPLATES.find((t) => t.key === k)!), start);
    return h;
  });
  const logs: Record<string, HabitLog> = {};
  habits.forEach((h, i) => {
    const completions: Record<DateKey, number> = {};
    for (const key of eachDay(start, addDays(today, -1))) {
      if (rand() < reliability[i]) completions[key] = h.targetPerDay;
    }
    // Guarantee a healthy live chain for the first few habits so streak UI is visible.
    const chain = [24, 18, 12, 5, 31, 7][i];
    for (const key of eachDay(addDays(today, -chain), addDays(today, -1))) completions[key] = h.targetPerDay;
    logs[h.id] = { completions, frozen: {} };
  });
  return { habits, logs };
}
