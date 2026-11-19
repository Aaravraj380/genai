/** Pure conversion + diff logic used by account sync. */
import type { SnapshotDto, SyncOp } from '@/api/types';
import { makeHabit, makeLog } from '@/domain/__tests__/helpers';
import { useHabitStore, type HabitInput } from '@/store/useHabitStore';
import { DEFAULT_SETTINGS } from '@/store/useSettingsStore';

import { diffToOps, dtoToHabit, fromSnapshotDto, habitToDto, settingsOp, toSnapshotDto } from '../ops';
import { remoteSettingsPatch } from '../engine';

jest.mock('expo-sqlite', () => ({}));

const rich = makeHabit({
  id: 'rich',
  frequency: { type: 'custom', days: [1, 3, 5] },
  note: 'Atomic Habits',
  reminder: { enabled: true, hour: 7, minute: 5, message: 'নমস্কার' },
  pauses: [{ start: '2026-09-10', end: '2026-09-12' }, { start: '2026-09-20' }],
  templateKey: 'reading',
  targetPerDay: 3,
});
const plain = makeHabit({ id: 'plain' });

describe('habit ⇄ server format', () => {
  it('round-trips every field exactly', () => {
    expect(dtoToHabit(habitToDto(rich, 4))).toEqual(rich);
    expect(dtoToHabit(habitToDto(plain, 0))).toEqual(plain);
    expect(habitToDto(rich, 4).sortOrder).toBe(4);
  });

  it('turns server nulls into absent fields, like the app creates them', () => {
    const fromServer = { ...habitToDto(plain, 0), note: null, reminder: null, templateKey: null, pauses: [{ start: '2026-09-01', end: null }] };
    const h = dtoToHabit(fromServer);
    expect(h).toEqual({ ...plain, pauses: [{ start: '2026-09-01' }] });
    expect('note' in h || 'reminder' in h || 'templateKey' in h).toBe(false);
    const msgless = dtoToHabit({ ...fromServer, reminder: { enabled: false, hour: 9, minute: 0, message: null } });
    expect(msgless.reminder).toEqual({ enabled: false, hour: 9, minute: 0 });
  });

  it('builds a snapshot with a log for every habit and only the synced settings', () => {
    const snap = toSnapshotDto({ habits: [rich, plain], logs: { rich: makeLog(['2026-09-01']) } }, { ...DEFAULT_SETTINGS, avatarUri: 'file:///me.jpg' });
    expect(Object.keys(snap.logs)).toEqual(['rich', 'plain']);
    expect(snap.logs.plain).toEqual({ completions: {}, frozen: {} });
    expect(snap.settings).toEqual({ theme: 'dark', language: 'en', weekStartsOn: 1, freezesPerMonth: 2, customCategories: [], profileName: '' });
  });
});

describe('applying a server snapshot', () => {
  const current = { habits: [rich, plain], logs: { rich: makeLog(['2026-09-01']), plain: makeLog() } };
  const same: SnapshotDto = { ...toSnapshotDto(current, {}), settings: {} };

  it('keeps every object when nothing changed (no re-render, no re-save)', () => {
    const r = fromSnapshotDto(same, current);
    expect(r.changed).toBe(false);
    expect(r.habits).toBe(current.habits);
    expect(r.logs).toBe(current.logs);
  });

  it('replaces only what changed', () => {
    const snap: SnapshotDto = {
      ...same,
      habits: [same.habits[0], { ...same.habits[1], title: 'Renamed' }],
      logs: { ...same.logs, rich: { completions: { '2026-09-01': 1, '2026-09-02': 3 }, frozen: {} } },
    };
    const r = fromSnapshotDto(snap, current);
    expect(r.changed).toBe(true);
    expect(r.habits[0]).toBe(rich);
    expect(r.habits[1].title).toBe('Renamed');
    expect(r.logs.plain).toBe(current.logs.plain);
    expect(r.logs.rich.completions).toEqual({ '2026-09-01': 1, '2026-09-02': 3 });
  });

  it('notices reordering and removals', () => {
    expect(fromSnapshotDto({ ...same, habits: [same.habits[1], same.habits[0]] }, current).changed).toBe(true);
    const r = fromSnapshotDto({ ...same, habits: [same.habits[0]] }, current);
    expect(r.habits.map((h) => h.id)).toEqual(['rich']);
    expect(Object.keys(r.logs)).toEqual(['rich']);
  });

  it('only patches settings that differ', () => {
    expect(remoteSettingsPatch({ theme: 'dark', language: 'hi', customCategories: ['A'] }, { ...DEFAULT_SETTINGS, customCategories: ['A'] })).toEqual({
      language: 'hi',
    });
    expect(remoteSettingsPatch(undefined, DEFAULT_SETTINGS)).toEqual({});
  });
});

describe('store changes → server operations', () => {
  const input: HabitInput = { title: 'Read', icon: 'reading', category: 'Learning', color: '#4EDEA3', frequency: { type: 'daily' }, targetPerDay: 2 };

  it('emits the minimal operations for a whole session', () => {
    useHabitStore.getState().resetAll();
    const ops: SyncOp[] = [];
    const unsub = useHabitStore.subscribe((next, prev) => ops.push(...diffToOps(prev, next)));
    const s = useHabitStore.getState;

    const a = s().addHabit(input, '2026-09-20');
    expect(ops).toEqual([{ type: 'upsertHabit', habit: habitToDto(s().habits[0], 0) }]);
    ops.length = 0;

    s().tapHabit(a.id, '2026-09-29', '2026-09-29');
    s().tapHabit(a.id, '2026-09-29', '2026-09-29');
    expect(ops).toEqual([
      { type: 'setCompletion', habitId: a.id, date: '2026-09-29', count: 1 },
      { type: 'setCompletion', habitId: a.id, date: '2026-09-29', count: 2 },
    ]);
    ops.length = 0;

    s().tapHabit(a.id, '2026-09-29', '2026-09-29'); // past target → resets to 0
    expect(ops).toEqual([{ type: 'setCompletion', habitId: a.id, date: '2026-09-29', count: 0 }]);
    ops.length = 0;

    expect(s().freezeDay(a.id, '2026-09-27', '2026-09-29')).toBe(true);
    s().unfreezeDay(a.id, '2026-09-27');
    expect(ops).toEqual([
      { type: 'setFreeze', habitId: a.id, date: '2026-09-27', frozen: true },
      { type: 'setFreeze', habitId: a.id, date: '2026-09-27', frozen: false },
    ]);
    ops.length = 0;

    const b = s().addHabit({ ...input, title: 'Run' }, '2026-09-20');
    ops.length = 0;
    s().updateHabit(a.id, { title: 'Read more' });
    expect(ops).toEqual([{ type: 'upsertHabit', habit: expect.objectContaining({ id: a.id, title: 'Read more', sortOrder: 0 }) }]);
    ops.length = 0;

    s().deleteHabit(a.id); // b moves from position 1 to 0
    expect(ops).toEqual([
      { type: 'deleteHabit', habitId: a.id },
      { type: 'upsertHabit', habit: expect.objectContaining({ id: b.id, sortOrder: 0 }) },
    ]);
    ops.length = 0;

    s().markActive('2026-09-29'); // device-only bookkeeping: nothing to send
    expect(ops).toEqual([]);
    unsub();
  });

  it('only sends synced settings that changed', () => {
    expect(settingsOp(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, language: 'bn' })).toEqual({ type: 'setSettings', settings: { language: 'bn' } });
    expect(settingsOp(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, avatarUri: 'file:///x.jpg' })).toBeNull();
    expect(settingsOp(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toBeNull();
  });
});
