import { makeHabit, makeLog } from '@/domain/__tests__/helpers';
import { DEFAULT_SETTINGS } from '@/store/useSettingsStore';

import { BackupError, backupFileName, buildBackup, parseBackup } from '../backup';

// Hoisted above the imports by babel-jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Native modules aren't needed for the pure parse/build functions under test.
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));

const settings = { ...DEFAULT_SETTINGS, language: 'hi' as const, avatarUri: 'file:///photo.jpg', customCategories: ['Family'] };

describe('backup round trip', () => {
  it('restores exactly what was exported (minus the device-only photo)', () => {
    const habit = makeHabit({ reminder: { enabled: true, hour: 7, minute: 30, message: 'Go!' }, templateKey: 'meditation' });
    const logs = { h1: makeLog(['2026-09-01', '2026-09-02'], ['2026-09-03']) };
    const json = buildBackup([habit], logs, settings, new Date('2026-09-29T10:00:00Z'));
    expect(json).not.toContain('photo.jpg');
    const back = parseBackup(json);
    expect(back.habits).toEqual([habit]);
    expect(back.logs).toEqual(logs);
    expect(back.settings).toMatchObject({ language: 'hi', customCategories: ['Family'] });
    expect(back.exportedAt).toBe('2026-09-29T10:00:00.000Z');
  });

  it('still accepts the earlier version-1 export format', () => {
    const v1 = JSON.stringify({ exportedAt: '2026-09-01T00:00:00Z', version: 1, habits: [makeHabit()], logs: {} });
    expect(parseBackup(v1).habits).toHaveLength(1);
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 8, 5))).toBe('focus-flow-backup-2026-09-05.json');
  });
});

describe('backup validation', () => {
  const err = (text: string) => {
    try {
      parseBackup(text);
    } catch (e) {
      return (e as BackupError).code;
    }
    return 'ok';
  };

  it('rejects non-JSON, foreign JSON and future versions', () => {
    expect(err('not json')).toBe('notJson');
    expect(err('{"hello":1}')).toBe('notBackup');
    expect(err('{"app":"other","habits":[]}')).toBe('notBackup');
    expect(err('{"app":"focus-flow","version":99,"habits":[]}')).toBe('tooNew');
  });

  it('sanitises bad fields instead of trusting them', () => {
    const json = JSON.stringify({
      app: 'focus-flow',
      version: 2,
      habits: [
        { ...makeHabit({ id: 'ok' }), icon: 'rocket', color: 'red', targetPerDay: 99, frequency: { type: 'custom', days: [9] } },
        { id: 'no-date', title: 'Broken', creationDate: '2026-02-30' },
        { ...makeHabit({ id: 'ok' }), title: 'Duplicate id' },
      ],
      logs: { ok: { completions: { '2026-09-01': 5, 'bad-key': 1, '2026-09-02': -3 }, frozen: { '2026-09-03': true, '2026-09-04': 'yes' } } },
      settings: { theme: 'neon', language: 'bn', freezesPerMonth: 50, weekStartsOn: 0 },
    });
    const out = parseBackup(json);
    expect(out.habits).toHaveLength(1);
    const h = out.habits[0];
    expect(h).toMatchObject({ icon: 'focus', color: '#4EDEA3', targetPerDay: 1, frequency: { type: 'daily' } });
    expect(out.logs.ok).toEqual({ completions: { '2026-09-01': 1 }, frozen: { '2026-09-03': true } });
    expect(out.settings).toEqual({ language: 'bn', weekStartsOn: 0 });
  });
});
