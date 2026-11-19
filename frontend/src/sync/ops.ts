/**
 * Pure helpers that turn app state into server operations and back.
 *
 * `diffToOps` mirrors the SQLite write-through in src/db/sync.ts: because the
 * stores are immutable, comparing references tells us exactly which habits,
 * days and settings changed, and each change becomes one small operation for
 * the server's offline queue (`POST /sync/push`).
 */
import type { HabitDto, LogDto, SnapshotDto, SyncedSettings, SyncOp } from '@/api/types';
import type { Habit, HabitLog } from '@/domain/types';
import type { SettingsValues } from '@/store/useSettingsStore';

export interface HabitData {
  habits: Habit[];
  logs: Record<string, HabitLog>;
}

/** Preferences that follow the account. The photo (avatarUri) is a file on this device, so it stays local. */
export const SYNCED_SETTINGS = ['theme', 'language', 'weekStartsOn', 'freezesPerMonth', 'customCategories', 'profileName'] as const;
type SyncedKey = (typeof SYNCED_SETTINGS)[number];

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

export function habitToDto(h: Habit, sortOrder: number): HabitDto {
  return {
    id: h.id,
    title: h.title,
    frequency: h.frequency,
    creationDate: h.creationDate,
    createdAt: h.createdAt,
    icon: h.icon,
    color: h.color,
    category: h.category,
    targetPerDay: h.targetPerDay,
    pauses: h.pauses,
    sortOrder,
    ...(h.note ? { note: h.note } : {}),
    ...(h.reminder ? { reminder: h.reminder } : {}),
    ...(h.templateKey ? { templateKey: h.templateKey } : {}),
  };
}

/** Server → app. Drops nulls so the result is identical to what the app itself creates. */
export function dtoToHabit(d: HabitDto): Habit {
  const habit: Habit = {
    id: d.id,
    title: d.title,
    frequency: d.frequency.type === 'custom' ? { type: 'custom', days: d.frequency.days } : { type: d.frequency.type },
    creationDate: d.creationDate,
    createdAt: d.createdAt,
    icon: d.icon,
    color: d.color,
    category: d.category,
    targetPerDay: d.targetPerDay,
    pauses: (d.pauses ?? []).map((p) => (p.end ? { start: p.start, end: p.end } : { start: p.start })),
  };
  if (d.note) habit.note = d.note;
  if (d.reminder) {
    const { enabled, hour, minute, message } = d.reminder;
    habit.reminder = message ? { enabled, hour, minute, message } : { enabled, hour, minute };
  }
  if (d.templateKey) habit.templateKey = d.templateKey;
  return habit;
}

export function pickSyncedSettings(s: Partial<SettingsValues>): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) if (s[k] !== undefined) out[k] = s[k];
  return out as SyncedSettings;
}

export function toSnapshotDto(data: HabitData, settings: Partial<SettingsValues>): Omit<SnapshotDto, 'serverTime'> {
  const logs: Record<string, LogDto> = {};
  for (const h of data.habits) {
    const log = data.logs[h.id];
    logs[h.id] = { completions: { ...(log?.completions ?? {}) }, frozen: { ...(log?.frozen ?? {}) } };
  }
  return { habits: data.habits.map(habitToDto), logs, settings: pickSyncedSettings(settings) };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Server snapshot → store state. Objects that didn't change keep their old
 * reference, so applying a pull only re-renders (and re-saves) what changed.
 */
export function fromSnapshotDto(snap: SnapshotDto, current: HabitData): HabitData & { changed: boolean } {
  const byId = new Map(current.habits.map((h) => [h.id, h]));
  let changed = snap.habits.length !== current.habits.length;
  const habits = snap.habits.map((dto, i) => {
    const incoming = dtoToHabit(dto);
    const old = byId.get(incoming.id);
    if (old && sameJson(old, incoming)) {
      if (current.habits[i] !== old) changed = true; // order changed
      return old;
    }
    changed = true;
    return incoming;
  });
  const logs: Record<string, HabitLog> = {};
  for (const h of habits) {
    const dto = snap.logs[h.id] ?? { completions: {}, frozen: {} };
    const incoming: HabitLog = { completions: { ...dto.completions }, frozen: { ...dto.frozen } };
    const old = current.logs[h.id];
    if (old && sameJson(sortKeys(old.completions), sortKeys(incoming.completions)) && sameJson(sortKeys(old.frozen), sortKeys(incoming.frozen))) {
      logs[h.id] = old;
    } else {
      logs[h.id] = incoming;
      changed = true;
    }
  }
  return { habits: changed ? habits : current.habits, logs: changed ? logs : current.logs, changed };
}

function sortKeys<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Diffs → operations                                                  */
/* ------------------------------------------------------------------ */

export function diffToOps(prev: HabitData, next: HabitData): SyncOp[] {
  const ops: SyncOp[] = [];
  if (prev.habits !== next.habits) {
    const nextIds = new Set(next.habits.map((h) => h.id));
    for (const h of prev.habits) if (!nextIds.has(h.id)) ops.push({ type: 'deleteHabit', habitId: h.id });
    const prevIndex = new Map(prev.habits.map((h, i) => [h.id, { h, i }]));
    next.habits.forEach((h, i) => {
      const before = prevIndex.get(h.id);
      if (!before || before.h !== h || before.i !== i) ops.push({ type: 'upsertHabit', habit: habitToDto(h, i) });
    });
  }
  if (prev.logs !== next.logs) {
    const live = new Set(next.habits.map((h) => h.id));
    for (const [id, log] of Object.entries(next.logs)) {
      const old = prev.logs[id];
      if (old === log || !live.has(id)) continue;
      const empty = { completions: {}, frozen: {} };
      const before = old ?? empty;
      if (before.completions !== log.completions) {
        for (const day of unionKeys(before.completions, log.completions)) {
          if (before.completions[day] !== log.completions[day]) {
            ops.push({ type: 'setCompletion', habitId: id, date: day, count: log.completions[day] ?? 0 });
          }
        }
      }
      if (before.frozen !== log.frozen) {
        for (const day of unionKeys(before.frozen, log.frozen)) {
          if (before.frozen[day] !== log.frozen[day]) {
            ops.push({ type: 'setFreeze', habitId: id, date: day, frozen: log.frozen[day] === true });
          }
        }
      }
    }
  }
  return ops;
}

function unionKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

/** One `setSettings` op with only the synced preferences that changed, or null. */
export function settingsOp(prev: Partial<SettingsValues>, next: Partial<SettingsValues>): SyncOp | null {
  const changed: Partial<Record<SyncedKey, unknown>> = {};
  for (const k of SYNCED_SETTINGS) if (prev[k] !== next[k] && next[k] !== undefined) changed[k] = next[k];
  return Object.keys(changed).length ? { type: 'setSettings', settings: changed as SyncedSettings } : null;
}
