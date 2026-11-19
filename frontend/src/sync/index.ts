/**
 * Wires the sync engine into the app: one instance, started after the local
 * database has loaded. Syncs on launch, when the app comes back to the
 * foreground, when the browser goes back online, and every 30 s while open.
 */
import { AppState, Platform } from 'react-native';

import { defaultApiUrl } from '@/api/config';
import type { DbClient } from '@/db/client';
import { getMeta, setMeta } from '@/db/repository';
import { toDateKey } from '@/domain/dates';
import { cancelAllReminders, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';

import { CloudSync, type KeyValueStore } from './engine';
import { memoryOutbox, sqliteOutbox, type Serialize } from './outbox';

export { useCloud, type CloudPhase } from './engine';

const SYNC_EVERY_MS = 30_000;
let instance: CloudSync | null = null;

/** The running sync engine (available once the app has loaded). */
export function cloudSync(): CloudSync {
  if (!instance) throw new Error('Cloud sync not started yet');
  return instance;
}

function memoryKV(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => void (v === null ? map.delete(k) : map.set(k, v)),
  };
}

/** Changes from another device may add, edit or remove reminders on this one. */
async function rescheduleReminders() {
  try {
    await cancelAllReminders();
    const today = toDateKey(new Date());
    for (const h of useHabitStore.getState().habits) await syncHabitReminder(h, today);
  } catch (e) {
    console.warn('[sync] could not reschedule reminders', e);
  }
}

export async function startCloudSync(db: DbClient | null, serialize: Serialize): Promise<void> {
  if (instance) return;
  const meta: KeyValueStore = db
    ? { get: (k) => serialize(() => getMeta(db, k)), set: (k, v) => serialize(() => setMeta(db, k, v)) }
    : memoryKV();
  instance = new CloudSync({
    outbox: db ? sqliteOutbox(db, serialize) : memoryOutbox(),
    meta,
    defaultApiUrl: defaultApiUrl(),
    onRemoteChange: () => void rescheduleReminders(),
  });
  await instance.init();
  const sync = instance;
  void sync.syncNow();

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void sync.syncNow();
  });
  setInterval(() => {
    if (AppState.currentState === 'active' || Platform.OS === 'web') void sync.syncNow();
  }, SYNC_EVERY_MS);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => void sync.syncNow());
  }
}
