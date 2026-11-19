/**
 * All SQL lives here. Every value is bound as a parameter (never string-built),
 * and multi-row changes run inside a transaction.
 */
import type { DateKey, Frequency, Habit, HabitIcon, HabitLog, PausePeriod, Weekday } from '@/domain/types';

import type { DbClient, SqlValue } from './client';

/* ------------------------------------------------------------------ */
/* Row ⇄ model mapping                                                 */
/* ------------------------------------------------------------------ */

interface HabitRow {
  id: string;
  sort_order: number;
  title: string;
  frequency_type: Frequency['type'];
  frequency_days: string | null;
  creation_date: string;
  created_at: string;
  icon: string;
  color: string;
  category: string;
  note: string | null;
  target_per_day: number;
  reminder_enabled: number | null;
  reminder_hour: number | null;
  reminder_minute: number | null;
  reminder_message: string | null;
  template_key: string | null;
}

function rowToHabit(r: HabitRow, pauses: PausePeriod[]): Habit {
  const frequency: Frequency =
    r.frequency_type === 'custom'
      ? { type: 'custom', days: (r.frequency_days ?? '').split(',').filter(Boolean).map(Number) as Weekday[] }
      : { type: r.frequency_type };
  return {
    id: r.id,
    title: r.title,
    frequency,
    creationDate: r.creation_date,
    createdAt: r.created_at,
    icon: r.icon as HabitIcon,
    color: r.color,
    category: r.category,
    targetPerDay: r.target_per_day,
    pauses,
    ...(r.note !== null ? { note: r.note } : {}),
    ...(r.reminder_hour !== null && r.reminder_minute !== null
      ? {
          reminder: {
            enabled: r.reminder_enabled === 1,
            hour: r.reminder_hour,
            minute: r.reminder_minute,
            ...(r.reminder_message !== null ? { message: r.reminder_message } : {}),
          },
        }
      : {}),
    ...(r.template_key !== null ? { templateKey: r.template_key } : {}),
  };
}

function habitParams(h: Habit, sortOrder: number): SqlValue[] {
  return [
    h.id,
    sortOrder,
    h.title,
    h.frequency.type,
    h.frequency.type === 'custom' ? h.frequency.days.join(',') : null,
    h.creationDate,
    h.createdAt,
    h.icon,
    h.color,
    h.category,
    h.note ?? null,
    h.targetPerDay,
    h.reminder ? (h.reminder.enabled ? 1 : 0) : null,
    h.reminder?.hour ?? null,
    h.reminder?.minute ?? null,
    h.reminder?.message ?? null,
    h.templateKey ?? null,
  ];
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface Snapshot {
  habits: Habit[];
  logs: Record<string, HabitLog>;
  lastActiveDate: DateKey | null;
}

export async function loadSnapshot(db: DbClient): Promise<Snapshot> {
  const rows = await db.getAllAsync<HabitRow>('SELECT * FROM habits ORDER BY sort_order, rowid', []);
  const pauseRows = await db.getAllAsync<{ habit_id: string; start_date: string; end_date: string | null }>(
    'SELECT habit_id, start_date, end_date FROM pauses ORDER BY start_date',
    [],
  );
  const done = await db.getAllAsync<{ habit_id: string; date: string; count: number }>(
    'SELECT habit_id, date, count FROM completions',
    [],
  );
  const frozen = await db.getAllAsync<{ habit_id: string; date: string }>('SELECT habit_id, date FROM freezes', []);

  const pausesBy = new Map<string, PausePeriod[]>();
  for (const p of pauseRows) {
    const list = pausesBy.get(p.habit_id) ?? [];
    list.push(p.end_date ? { start: p.start_date, end: p.end_date } : { start: p.start_date });
    pausesBy.set(p.habit_id, list);
  }
  const habits = rows.map((r) => rowToHabit(r, pausesBy.get(r.id) ?? []));
  const logs: Record<string, HabitLog> = {};
  for (const h of habits) logs[h.id] = { completions: {}, frozen: {} };
  for (const c of done) if (logs[c.habit_id]) logs[c.habit_id].completions[c.date] = c.count;
  for (const f of frozen) if (logs[f.habit_id]) logs[f.habit_id].frozen[f.date] = true;

  return { habits, logs, lastActiveDate: await getMeta(db, 'last_active_date') };
}

/* ------------------------------------------------------------------ */
/* Writes (call inside a transaction when doing several)               */
/* ------------------------------------------------------------------ */

const UPSERT_HABIT = `
  INSERT INTO habits (id, sort_order, title, frequency_type, frequency_days, creation_date, created_at, icon, color,
                      category, note, target_per_day, reminder_enabled, reminder_hour, reminder_minute, reminder_message, template_key)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    sort_order = excluded.sort_order, title = excluded.title, frequency_type = excluded.frequency_type,
    frequency_days = excluded.frequency_days, creation_date = excluded.creation_date, created_at = excluded.created_at,
    icon = excluded.icon, color = excluded.color, category = excluded.category, note = excluded.note,
    target_per_day = excluded.target_per_day, reminder_enabled = excluded.reminder_enabled,
    reminder_hour = excluded.reminder_hour, reminder_minute = excluded.reminder_minute,
    reminder_message = excluded.reminder_message, template_key = excluded.template_key`;

export async function writeHabit(db: DbClient, h: Habit, sortOrder: number): Promise<void> {
  await db.runAsync(UPSERT_HABIT, habitParams(h, sortOrder));
  await db.runAsync('DELETE FROM pauses WHERE habit_id = ?', [h.id]);
  for (const p of h.pauses) {
    await db.runAsync('INSERT INTO pauses (habit_id, start_date, end_date) VALUES (?, ?, ?)', [h.id, p.start, p.end ?? null]);
  }
}

/** Deleting a habit also deletes its pauses, completions and freezes (ON DELETE CASCADE). */
export async function deleteHabit(db: DbClient, id: string): Promise<void> {
  await db.runAsync('DELETE FROM habits WHERE id = ?', [id]);
}

export async function setCompletion(db: DbClient, habitId: string, date: DateKey, count: number): Promise<void> {
  if (count > 0) {
    await db.runAsync(
      'INSERT INTO completions (habit_id, date, count) VALUES (?, ?, ?) ON CONFLICT(habit_id, date) DO UPDATE SET count = excluded.count',
      [habitId, date, count],
    );
  } else {
    await db.runAsync('DELETE FROM completions WHERE habit_id = ? AND date = ?', [habitId, date]);
  }
}

export async function setFrozen(db: DbClient, habitId: string, date: DateKey, frozen: boolean): Promise<void> {
  if (frozen) await db.runAsync('INSERT OR IGNORE INTO freezes (habit_id, date) VALUES (?, ?)', [habitId, date]);
  else await db.runAsync('DELETE FROM freezes WHERE habit_id = ? AND date = ?', [habitId, date]);
}

/** Wipe all habit data and write a complete snapshot (used by the one-time migration). */
export async function replaceAll(db: DbClient, habits: Habit[], logs: Record<string, HabitLog>): Promise<void> {
  await db.runAsync('DELETE FROM habits', []);
  for (let i = 0; i < habits.length; i++) {
    const h = habits[i];
    await writeHabit(db, h, i);
    const log = logs[h.id];
    if (!log) continue;
    for (const [date, count] of Object.entries(log.completions)) await setCompletion(db, h.id, date, count);
    for (const date of Object.keys(log.frozen)) await setFrozen(db, h.id, date, true);
  }
}

/* ------------------------------------------------------------------ */
/* Settings & metadata                                                 */
/* ------------------------------------------------------------------ */

export async function loadSettings(db: DbClient): Promise<Record<string, unknown>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings', []);
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      /* skip a corrupt value rather than failing the launch */
    }
  }
  return out;
}

export async function saveSetting(db: DbClient, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value ?? null)],
  );
}

export async function getMeta(db: DbClient, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: DbClient, key: string, value: string | null): Promise<void> {
  if (value === null) await db.runAsync('DELETE FROM app_meta WHERE key = ?', [key]);
  else
    await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
}

export interface DbStats {
  habits: number;
  completions: number;
  freezes: number;
}

export async function getStats(db: DbClient): Promise<DbStats> {
  const one = async (sql: string) => (await db.getFirstAsync<{ n: number }>(sql, []))?.n ?? 0;
  return {
    habits: await one('SELECT COUNT(*) AS n FROM habits'),
    completions: await one('SELECT COUNT(*) AS n FROM completions'),
    freezes: await one('SELECT COUNT(*) AS n FROM freezes'),
  };
}
