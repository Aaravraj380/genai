/**
 * Shapes exchanged with the FastAPI backend (backend/app/schemas.py).
 * JSON is camelCase on both sides, so habits travel in the app's own format.
 */
import type { Frequency, HabitIcon, PausePeriod, Reminder } from '@/domain/types';
import type { Language, ThemePreference } from '@/store/useSettingsStore';

export interface ApiUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'bearer';
  expiresIn: number;
  user: ApiUser;
}

/** A habit as the server stores it: the app's Habit plus its position in the list. */
export interface HabitDto {
  id: string;
  title: string;
  frequency: Frequency;
  creationDate: string;
  createdAt: string;
  icon: HabitIcon;
  color: string;
  category: string;
  note?: string | null;
  targetPerDay: number;
  reminder?: (Omit<Reminder, 'message'> & { message?: string | null }) | null;
  pauses: (Omit<PausePeriod, 'end'> & { end?: string | null })[];
  templateKey?: string | null;
  sortOrder?: number;
}

export interface LogDto {
  completions: Record<string, number>;
  frozen: Record<string, true>;
}

/** Preferences that follow the account across devices (the photo stays on the device). */
export interface SyncedSettings {
  theme?: ThemePreference;
  language?: Language;
  weekStartsOn?: 0 | 1;
  freezesPerMonth?: number;
  customCategories?: string[];
  profileName?: string;
}

export interface SnapshotDto {
  habits: HabitDto[];
  logs: Record<string, LogDto>;
  settings: SyncedSettings;
  serverTime?: string;
}

export type SyncOp =
  | { type: 'upsertHabit'; habit: HabitDto }
  | { type: 'deleteHabit'; habitId: string }
  | { type: 'setCompletion'; habitId: string; date: string; count: number }
  | { type: 'setFreeze'; habitId: string; date: string; frozen: boolean }
  | { type: 'setSettings'; settings: SyncedSettings };

export interface PushResponse {
  applied: number;
  skipped: { index: number; reason: string }[];
  serverTime: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  app: string;
  version: string;
}
