/**
 * Backup file format — pure build/parse/validate (no native modules, so the
 * SQLite migration and the unit tests can use it too).
 *
 * Format (version 2):
 *   { app: 'focus-flow', version: 2, exportedAt, habits, logs, settings }
 * Version 1 files (the earlier "copy JSON" export: { version: 1, habits, logs })
 * are still accepted. Every field is validated and sanitised on import, so a
 * hand-edited or corrupted file can never put the app into a bad state.
 */
import { isValidDateKey } from '@/domain/dates';
import type { DateKey, Frequency, Habit, HabitIcon, HabitLog, PausePeriod, Reminder, Weekday } from '@/domain/types';
import { cleanCategory, type Language, type SettingsValues, type ThemePreference } from '@/store/useSettingsStore';

export const BACKUP_APP_ID = 'focus-flow';
export const BACKUP_VERSION = 2;

export type BackupSettings = Partial<Omit<SettingsValues, 'avatarUri'>>;

export interface BackupData {
  exportedAt: string | null;
  habits: Habit[];
  logs: Record<string, HabitLog>;
  settings?: BackupSettings;
}

export class BackupError extends Error {
  constructor(public code: 'notJson' | 'notBackup' | 'tooNew' | 'read') {
    super(code);
  }
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildBackup(
  habits: Habit[],
  logs: Record<string, HabitLog>,
  settings: SettingsValues,
  now: Date = new Date(),
): string {
  // The photo is a file on this phone only, so it is not part of the backup.
  const { avatarUri: _photo, ...portable } = settings;
  return JSON.stringify(
    { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: now.toISOString(), habits, logs, settings: portable },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Parse + validate                                                    */
/* ------------------------------------------------------------------ */

const ICONS: HabitIcon[] = ['reading', 'workout', 'hydrate', 'mind', 'focus', 'run', 'sleep', 'nutrition', 'journal', 'code'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function sanitizeFrequency(v: unknown): Frequency {
  if (isObj(v)) {
    if (v.type === 'daily' || v.type === 'weekdays' || v.type === 'weekends') return { type: v.type };
    if (v.type === 'custom' && Array.isArray(v.days)) {
      const days = [...new Set(v.days.filter((d): d is Weekday => isInt(d, 0, 6)))];
      if (days.length) return { type: 'custom', days };
    }
  }
  return { type: 'daily' };
}

function sanitizeReminder(v: unknown): Reminder | undefined {
  if (!isObj(v) || !isInt(v.hour, 0, 23) || !isInt(v.minute, 0, 59)) return undefined;
  const message = typeof v.message === 'string' && v.message.trim() ? v.message.trim().slice(0, 80) : undefined;
  return { enabled: v.enabled === true, hour: v.hour, minute: v.minute, ...(message ? { message } : {}) };
}

function sanitizePauses(v: unknown): PausePeriod[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .filter((p) => typeof p.start === 'string' && isValidDateKey(p.start))
    .map((p) => {
      const end = typeof p.end === 'string' && isValidDateKey(p.end) && p.end > (p.start as string) ? p.end : undefined;
      return end ? { start: p.start as DateKey, end } : { start: p.start as DateKey };
    });
}

function sanitizeHabit(v: unknown): Habit | null {
  if (!isObj(v)) return null;
  const title = typeof v.title === 'string' ? v.title.trim().slice(0, 60) : '';
  if (typeof v.id !== 'string' || !v.id || !title) return null;
  if (typeof v.creationDate !== 'string' || !isValidDateKey(v.creationDate)) return null;
  const category = typeof v.category === 'string' ? cleanCategory(v.category) : '';
  const note = typeof v.note === 'string' && v.note.trim() ? v.note.trim().slice(0, 40) : undefined;
  const reminder = sanitizeReminder(v.reminder);
  return {
    id: v.id,
    title,
    frequency: sanitizeFrequency(v.frequency),
    creationDate: v.creationDate,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
    icon: ICONS.includes(v.icon as HabitIcon) ? (v.icon as HabitIcon) : 'focus',
    color: typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : '#4EDEA3',
    category: category || 'Focus',
    targetPerDay: isInt(v.targetPerDay, 1, 20) ? v.targetPerDay : 1,
    pauses: sanitizePauses(v.pauses),
    ...(note ? { note } : {}),
    ...(reminder ? { reminder } : {}),
    ...(typeof v.templateKey === 'string' ? { templateKey: v.templateKey } : {}),
  };
}

function sanitizeLog(v: unknown, target: number): HabitLog {
  const completions: Record<DateKey, number> = {};
  const frozen: Record<DateKey, true> = {};
  if (isObj(v)) {
    if (isObj(v.completions)) {
      for (const [k, n] of Object.entries(v.completions)) {
        if (isValidDateKey(k) && typeof n === 'number' && Number.isFinite(n) && n > 0) {
          completions[k] = Math.min(Math.round(n), target);
        }
      }
    }
    if (isObj(v.frozen)) {
      for (const [k, on] of Object.entries(v.frozen)) if (isValidDateKey(k) && on === true) frozen[k] = true;
    }
  }
  return { completions, frozen };
}

export function sanitizeSettings(v: unknown): BackupSettings | undefined {
  if (!isObj(v)) return undefined;
  const out: BackupSettings = {};
  if (v.theme === 'system' || v.theme === 'dark' || v.theme === 'light') out.theme = v.theme as ThemePreference;
  if (v.language === 'en' || v.language === 'hi' || v.language === 'bn') out.language = v.language as Language;
  if (v.weekStartsOn === 0 || v.weekStartsOn === 1) out.weekStartsOn = v.weekStartsOn;
  if (isInt(v.freezesPerMonth, 0, 5)) out.freezesPerMonth = v.freezesPerMonth;
  if (Array.isArray(v.customCategories)) {
    out.customCategories = v.customCategories.filter((c): c is string => typeof c === 'string').map(cleanCategory).filter(Boolean);
  }
  if (typeof v.profileName === 'string') out.profileName = v.profileName.slice(0, 40);
  return out;
}

export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (!isObj(raw) || !Array.isArray(raw.habits) || (raw.logs !== undefined && !isObj(raw.logs))) {
    throw new BackupError('notBackup');
  }
  if (raw.app !== undefined && raw.app !== BACKUP_APP_ID) throw new BackupError('notBackup');
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) throw new BackupError('tooNew');

  const habits: Habit[] = [];
  const seen = new Set<string>();
  for (const h of raw.habits) {
    const clean = sanitizeHabit(h);
    if (clean && !seen.has(clean.id)) {
      seen.add(clean.id);
      habits.push(clean);
    }
  }
  const rawLogs = isObj(raw.logs) ? raw.logs : {};
  const logs: Record<string, HabitLog> = {};
  for (const h of habits) logs[h.id] = sanitizeLog(rawLogs[h.id], h.targetPerDay);

  return {
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    habits,
    logs,
    settings: sanitizeSettings(raw.settings),
  };
}

