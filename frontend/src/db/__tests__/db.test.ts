/**
 * Runs the real SQL (schema, migrations, repository, write-through sync)
 * against Node's built-in SQLite. Skipped automatically on Node < 22.13.
 */
import { eachDay } from '@/domain/dates';
import { makeHabit, makeLog } from '@/domain/__tests__/helpers';
import { useHabitStore, type HabitInput } from '@/store/useHabitStore';
import { DEFAULT_SETTINGS, SETTINGS_KEYS, useSettingsStore } from '@/store/useSettingsStore';

import { importLegacyData } from '../index';
import { getStats, loadSettings, loadSnapshot, replaceAll, writeHabit } from '../repository';
import { migrate, SCHEMA_VERSION } from '../schema';
import { createWriteQueue, syncHabitState, syncSettings } from '../sync';
import { nodeSqliteAvailable, openMemoryDb } from './nodeSqlite';

// Hoisted above the imports by babel-jest.
jest.mock('expo-sqlite', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const d = nodeSqliteAvailable() ? describe : describe.skip;
const TODAY = '2026-09-29';

async function freshDb() {
  const db = openMemoryDb();
  await migrate(db);
  return db;
}

d('schema & migrations', () => {
  it('creates every table at the current version and is safe to re-run', async () => {
    const db = await freshDb();
    await migrate(db); // second launch: no-op
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(v?.user_version).toBe(SCHEMA_VERSION);
    const tables = (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", [])).map(
      (r) => r.name,
    );
    expect(tables).toEqual(['app_meta', 'completions', 'freezes', 'habits', 'pauses', 'settings', 'sqlite_sequence', 'sync_outbox']);
  });

  it('refuses a database from a newer app version instead of corrupting it', async () => {
    const db = openMemoryDb();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer/);
  });
});

d('repository', () => {
  const rich = makeHabit({
    id: 'rich',
    frequency: { type: 'custom', days: [1, 3, 5] },
    note: 'It’s "quoted"; DROP TABLE habits; --',
    reminder: { enabled: true, hour: 7, minute: 5, message: 'নমস্কার! Time to go' },
    pauses: [{ start: '2026-09-10', end: '2026-09-12' }, { start: '2026-09-20' }],
    templateKey: 'meditation',
    targetPerDay: 3,
  });
  const plain = makeHabit({ id: 'plain', title: 'Plain', reminder: undefined });

  it('round-trips every habit field, log count and freeze exactly', async () => {
    const db = await freshDb();
    const logs = {
      rich: { completions: { '2026-09-01': 3, '2026-09-02': 1 }, frozen: { '2026-09-03': true as const } },
      plain: makeLog(['2026-09-05']),
    };
    await db.withTransactionAsync(() => replaceAll(db, [rich, plain], logs));
    const snap = await loadSnapshot(db);
    expect(snap.habits).toEqual([rich, plain]);
    expect(snap.logs).toEqual(logs);
    expect(await getStats(db)).toEqual({ habits: 2, completions: 3, freezes: 1 });
  });

  it('cascades a habit delete to its pauses, completions and freezes', async () => {
    const db = await freshDb();
    await replaceAll(db, [rich], { rich: makeLog(['2026-09-01'], ['2026-09-02']) });
    await db.runAsync('DELETE FROM habits WHERE id = ?', ['rich']);
    expect(await getStats(db)).toEqual({ habits: 0, completions: 0, freezes: 0 });
    expect(await db.getAllAsync('SELECT * FROM pauses', [])).toEqual([]);
  });

  it('rolls the whole transaction back when one write fails', async () => {
    const db = await freshDb();
    await replaceAll(db, [plain], {});
    const bad = { ...makeHabit({ id: 'bad' }), targetPerDay: 99 }; // violates CHECK (1–20)
    await expect(
      db.withTransactionAsync(async () => {
        await writeHabit(db, { ...plain, title: 'Renamed' }, 0);
        await writeHabit(db, bad, 1);
      }),
    ).rejects.toThrow();
    const snap = await loadSnapshot(db);
    expect(snap.habits.map((h) => h.title)).toEqual(['Plain']); // rename was rolled back too
  });
});

d('write-through sync from the Zustand store', () => {
  const input: HabitInput = {
    title: 'Read',
    icon: 'reading',
    category: 'Learning',
    color: '#4EDEA3',
    frequency: { type: 'daily' },
    targetPerDay: 2,
  };

  it('keeps SQLite identical to the in-memory state through a full session', async () => {
    const db = await freshDb();
    const queue = createWriteQueue((e) => {
      throw e;
    });
    useHabitStore.getState().resetAll();
    const unsub = useHabitStore.subscribe((next, prev) => {
      queue.push(() => syncHabitState(db, prev, next));
    });
    const s = useHabitStore.getState;
    const expectInSync = async () => {
      await queue.idle();
      const snap = await loadSnapshot(db);
      expect(snap.habits).toEqual(s().habits);
      for (const h of s().habits) expect(snap.logs[h.id]).toEqual(s().logs[h.id]);
      expect(snap.lastActiveDate).toEqual(s().lastActiveDate);
    };

    const a = s().addHabit(input, '2026-09-20');
    const b = s().addHabit({ ...input, title: 'Run', targetPerDay: 1 }, '2026-09-20');
    await expectInSync();

    s().tapHabit(a.id, TODAY, TODAY); // 1/2
    s().tapHabit(a.id, TODAY, TODAY); // 2/2
    for (const day of eachDay('2026-09-20', '2026-09-26')) s().setCount(b.id, day, 1, TODAY);
    expect(s().freezeDay(b.id, '2026-09-27', TODAY)).toBe(true);
    s().markActive(TODAY);
    await expectInSync();

    s().updateHabit(a.id, { title: 'Read 20 pages', reminder: { enabled: true, hour: 21, minute: 0, message: 'Book time' } });
    s().pauseHabit(b.id, TODAY);
    s().tapHabit(a.id, TODAY, TODAY); // reset to 0 → row deleted
    s().setCount(b.id, '2026-09-27', 1, TODAY); // completing a frozen day removes the freeze
    await expectInSync();
    expect(await getStats(db)).toEqual({ habits: 2, completions: 8, freezes: 0 });

    s().deleteHabit(b.id);
    await expectInSync();
    expect(await getStats(db)).toEqual({ habits: 1, completions: 0, freezes: 0 });

    s().loadDemoData(TODAY);
    await expectInSync();
    s().importData({ habits: [makeHabit({ id: 'imp' })], logs: { imp: makeLog(['2026-09-01']) } }, 'merge');
    await expectInSync();
    s().resetAll();
    await expectInSync();
    expect(await getStats(db)).toEqual({ habits: 0, completions: 0, freezes: 0 });
    unsub();
  });

  it('persists settings, one row per changed preference', async () => {
    const db = await freshDb();
    const queue = createWriteQueue((e) => {
      throw e;
    });
    useSettingsStore.setState({ ...DEFAULT_SETTINGS });
    const unsub = useSettingsStore.subscribe((next, prev) => {
      queue.push(() =>
        syncSettings(db, prev as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, SETTINGS_KEYS),
      );
    });
    useSettingsStore.getState().setLanguage('hi');
    useSettingsStore.getState().addCategory('Family');
    useSettingsStore.getState().setWeekStartsOn(0);
    await queue.idle();
    expect(await loadSettings(db)).toEqual({ language: 'hi', customCategories: ['Family'], weekStartsOn: 0 });
    unsub();
  });
});

d('one-time import from the old AsyncStorage version', () => {
  const legacy: Record<string, string> = {
    'streak-habit/v1': JSON.stringify({
      state: {
        habits: [makeHabit({ id: 'old', title: 'Old habit' })],
        logs: { old: makeLog(['2026-09-01', '2026-09-02'], ['2026-09-03']) },
        lastActiveDate: '2026-09-28',
      },
      version: 1,
    }),
    'streak-habit/settings/v1': JSON.stringify({
      state: { theme: 'light', language: 'bn', weekStartsOn: 0, freezesPerMonth: 3, customCategories: ['Prayer'], profileName: 'Sameer', avatarUri: 'file:///me.jpg' },
      version: 1,
    }),
  };
  const read = async (k: string) => legacy[k] ?? null;

  it('copies habits, history and settings once, then never again', async () => {
    const db = await freshDb();
    expect(await importLegacyData(db, read)).toBe(true);
    const snap = await loadSnapshot(db);
    expect(snap.habits.map((h) => h.title)).toEqual(['Old habit']);
    expect(snap.logs.old).toEqual(makeLog(['2026-09-01', '2026-09-02'], ['2026-09-03']));
    expect(snap.lastActiveDate).toBe('2026-09-28');
    expect(await loadSettings(db)).toMatchObject({ theme: 'light', language: 'bn', profileName: 'Sameer', avatarUri: 'file:///me.jpg' });

    // Second launch: the flag prevents re-importing over newer data.
    await db.runAsync('DELETE FROM habits', []);
    expect(await importLegacyData(db, read)).toBe(false);
    expect((await loadSnapshot(db)).habits).toEqual([]);
  });

  it('does nothing harmful on a brand-new install', async () => {
    const db = await freshDb();
    expect(await importLegacyData(db, async () => null)).toBe(false);
    expect(await getStats(db)).toEqual({ habits: 0, completions: 0, freezes: 0 });
  });
});
