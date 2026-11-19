/**
 * App database bootstrap.
 *
 * On launch:
 *  1. open `focus-flow.db` with expo-sqlite (phone: app sandbox; web: the
 *     browser's private file system via WebAssembly SQLite) and migrate it;
 *  2. the first time only, copy any data saved by the previous AsyncStorage
 *     version into SQLite (the old copy is left untouched as a safety net);
 *  3. load everything into the Zustand stores;
 *  4. subscribe to the stores so every change is written back to SQLite;
 *  5. start the optional account sync (src/sync) — it only talks to the
 *     server if the user has logged in.
 *
 * If SQLite can't be opened (e.g. a web host without the required headers),
 * the app still runs from memory and the Data card says changes aren't saved.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { create } from 'zustand';

import { parseBackup, sanitizeSettings } from '@/services/backupFormat';
import { useHabitStore } from '@/store/useHabitStore';
import { DEFAULT_SETTINGS, SETTINGS_KEYS, useSettingsStore, type SettingsValues } from '@/store/useSettingsStore';
import { startCloudSync } from '@/sync';

import type { DbClient, SqlValue } from './client';
import { getMeta, getStats, loadSettings, loadSnapshot, replaceAll, saveSetting, setMeta, type DbStats } from './repository';
import { migrate, SCHEMA_VERSION } from './schema';
import { createWriteQueue, syncHabitState, syncSettings } from './sync';

export const DB_NAME = 'focus-flow.db';
const LEGACY_HABITS_KEY = 'streak-habit/v1';
const LEGACY_SETTINGS_KEY = 'streak-habit/settings/v1';

/* ------------------------------------------------------------------ */
/* Status (shown in the "Your Data" card)                              */
/* ------------------------------------------------------------------ */

export interface StorageStatus {
  state: 'opening' | 'ready' | 'unavailable';
  error?: string;
  migratedFromAsyncStorage?: boolean;
}

export const useStorageStatus = create<StorageStatus>(() => ({ state: 'opening' }));

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

/** Adapts expo-sqlite's database to the small DbClient interface. */
function wrap(db: SQLite.SQLiteDatabase): DbClient {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params: SqlValue[]) => db.runAsync(sql, params),
    getAllAsync: <T,>(sql: string, params: SqlValue[]) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlValue[]) => db.getFirstAsync<T>(sql, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

let clientPromise: Promise<DbClient> | null = null;

export function getDatabase(): Promise<DbClient> {
  clientPromise ??= SQLite.openDatabaseAsync(DB_NAME).then(async (raw) => {
    const db = wrap(raw);
    await migrate(db);
    return db;
  });
  return clientPromise;
}

const queue = createWriteQueue();

/** Runs a task on the same queue as the write-through, so database work never overlaps (used by account sync). */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => task().then(resolve, reject));
  });
}

/* ------------------------------------------------------------------ */
/* One-time import of the old AsyncStorage data                        */
/* ------------------------------------------------------------------ */

export async function importLegacyData(
  db: DbClient,
  readLegacy: (key: string) => Promise<string | null>,
): Promise<boolean> {
  if ((await getMeta(db, 'legacy_import_done')) === '1') return false;

  let imported = false;
  const rawHabits = await readLegacy(LEGACY_HABITS_KEY);
  const rawSettings = await readLegacy(LEGACY_SETTINGS_KEY);

  await db.withTransactionAsync(async () => {
    if (rawHabits) {
      const state = (JSON.parse(rawHabits) as { state?: Record<string, unknown> }).state ?? {};
      // Re-use the backup validator so malformed old data can't break the new database.
      const clean = parseBackup(JSON.stringify({ habits: state.habits ?? [], logs: state.logs ?? {} }));
      await replaceAll(db, clean.habits, clean.logs);
      if (typeof state.lastActiveDate === 'string') await setMeta(db, 'last_active_date', state.lastActiveDate);
      imported = clean.habits.length > 0;
    }
    if (rawSettings) {
      const state = (JSON.parse(rawSettings) as { state?: Record<string, unknown> }).state ?? {};
      const clean: Partial<SettingsValues> = { ...sanitizeSettings(state) };
      if (typeof state.avatarUri === 'string') clean.avatarUri = state.avatarUri; // same device, so the photo is still valid
      for (const [k, v] of Object.entries(clean)) await saveSetting(db, k, v);
    }
    await setMeta(db, 'legacy_import_done', '1');
  });
  return imported;
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

let started = false;

export async function bootstrapStorage(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const db = await getDatabase();
    let migrated = false;
    try {
      migrated = await importLegacyData(db, (k) => AsyncStorage.getItem(k));
    } catch (e) {
      console.warn('[db] could not import old AsyncStorage data', e);
    }

    const snapshot = await loadSnapshot(db);
    const stored = await loadSettings(db);
    const settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(stored) } as SettingsValues;
    if (typeof stored.avatarUri === 'string') settings.avatarUri = stored.avatarUri;

    useHabitStore.setState({ ...snapshot, hasHydrated: true });
    useSettingsStore.setState({ ...settings, hasHydrated: true });

    // From now on, every change in memory is mirrored to SQLite, in order.
    useHabitStore.subscribe((next, prev) => {
      queue.push(() => syncHabitState(db, prev, next));
    });
    useSettingsStore.subscribe((next, prev) => {
      queue.push(() =>
        syncSettings(db, prev as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, SETTINGS_KEYS),
      );
    });

    useStorageStatus.setState({ state: 'ready', migratedFromAsyncStorage: migrated });
    await startCloudSync(db, serialized).catch((err) => console.warn('[sync] could not start', err));
  } catch (e) {
    console.warn('[db] SQLite unavailable — running from memory only', e);
    useStorageStatus.setState({ state: 'unavailable', error: e instanceof Error ? e.message : String(e) });
    useHabitStore.setState({ hasHydrated: true });
    useSettingsStore.setState({ hasHydrated: true });
    await startCloudSync(null, (task) => task()).catch((err) => console.warn('[sync] could not start', err));
  }
}

/** Row counts for the Data card. */
export async function databaseStats(): Promise<DbStats & { schema: number }> {
  await queue.idle();
  return { ...(await getStats(await getDatabase())), schema: SCHEMA_VERSION };
}
