import { analyzeReturn } from '@/domain/freezes';
import { currentStreak } from '@/domain/streaks';

import { useHabitStore, type HabitInput } from '../useHabitStore';

// Hoisted above the imports by babel-jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TODAY = '2026-09-29';
const input: HabitInput = {
  title: '  Read 20 pages  ',
  icon: 'reading',
  category: 'Learning',
  color: '#4EDEA3',
  frequency: { type: 'daily' },
  targetPerDay: 1,
};

const s = () => useHabitStore.getState();

beforeEach(() => s().resetAll());

describe('habit store', () => {
  it('creates habits with trimmed titles and a local creationDate', () => {
    const h = s().addHabit(input, TODAY);
    expect(h.title).toBe('Read 20 pages');
    expect(h.creationDate).toBe(TODAY);
    expect(s().logs[h.id]).toEqual({ completions: {}, frozen: {} });
  });

  it('toggles a single-target habit on and off', () => {
    const h = s().addHabit(input, TODAY);
    expect(s().tapHabit(h.id, TODAY, TODAY)).toBe(1);
    expect(s().tapHabit(h.id, TODAY, TODAY)).toBe(0);
    expect(s().logs[h.id].completions[TODAY]).toBeUndefined();
  });

  it('counts up to a multi-target and then resets', () => {
    const h = s().addHabit({ ...input, targetPerDay: 3 }, TODAY);
    expect([1, 2, 3, 0].map(() => s().tapHabit(h.id, TODAY, TODAY))).toEqual([1, 2, 3, 0]);
  });

  it('refuses to log the future or before creation', () => {
    const h = s().addHabit(input, TODAY);
    s().setCount(h.id, '2026-09-30', 1, TODAY);
    s().setCount(h.id, '2026-09-28', 1, TODAY);
    expect(s().logs[h.id].completions).toEqual({});
  });

  it('freezes a recent miss and refunds the freeze when the day is logged', () => {
    const h = s().addHabit(input, TODAY);
    useHabitStore.setState({ habits: [{ ...h, creationDate: '2026-09-25' }] });
    s().setCount(h.id, '2026-09-26', 1, TODAY);
    expect(s().freezeDay(h.id, '2026-09-27', TODAY)).toBe(true);
    s().setCount(h.id, '2026-09-28', 1, TODAY);
    expect(currentStreak(s().habits[0], s().logs[h.id], TODAY)).toBe(2);
    s().setCount(h.id, '2026-09-27', 1, TODAY);
    expect(s().logs[h.id].frozen).toEqual({});
    expect(currentStreak(s().habits[0], s().logs[h.id], TODAY)).toBe(3);
  });

  it('pauses and resumes, and a same-day pause leaves no trace', () => {
    const h = s().addHabit(input, TODAY);
    s().pauseHabit(h.id, TODAY);
    expect(s().habits[0].pauses).toEqual([{ start: TODAY }]);
    s().resumeHabit(h.id, TODAY);
    expect(s().habits[0].pauses).toEqual([]);
    s().pauseHabit(h.id, '2026-09-20');
    s().resumeHabit(h.id, TODAY);
    expect(s().habits[0].pauses).toEqual([{ start: '2026-09-20', end: TODAY }]);
  });

  it('repairs streaks after 3 days away using freezes', () => {
    const h = s().addHabit(input, TODAY);
    useHabitStore.setState({ habits: [{ ...h, creationDate: '2026-09-20' }] });
    for (const d of ['20', '21', '22', '23', '24', '25', '26']) s().setCount(h.id, `2026-09-${d}`, 1, TODAY);
    const report = analyzeReturn(s().habits, s().logs, '2026-09-26', TODAY)!;
    expect(report.broken).toHaveLength(1);
    expect(s().repairStreaks(report, TODAY)).toBe(1);
    expect(currentStreak(s().habits[0], s().logs[h.id], TODAY)).toBe(7);
  });

  it('deletes a habit together with its log', () => {
    const h = s().addHabit(input, TODAY);
    s().deleteHabit(h.id);
    expect(s().habits).toEqual([]);
    expect(s().logs[h.id]).toBeUndefined();
  });
});

describe('restore from backup', () => {
  it('replace swaps everything; merge keeps current habits and unions history', () => {
    const mine = s().addHabit(input, TODAY);
    s().setCount(mine.id, TODAY, 1, TODAY);
    const other = { ...mine, id: 'from-backup', title: 'Backup habit' };
    const data = { habits: [other], logs: { 'from-backup': { completions: { '2026-09-28': 1 }, frozen: {} } } };

    s().importData(data, 'merge');
    expect(s().habits.map((h) => h.id).sort()).toEqual([mine.id, 'from-backup'].sort());
    expect(s().logs[mine.id].completions[TODAY]).toBe(1);

    s().importData(data, 'replace');
    expect(s().habits.map((h) => h.id)).toEqual(['from-backup']);
  });
});
