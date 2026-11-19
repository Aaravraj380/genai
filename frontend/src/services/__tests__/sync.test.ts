import { makeHabit, makeLog } from '@/domain/__tests__/helpers';

import { mergeLogs, mergeSnapshots } from '../sync';

describe('offline-first sync merge', () => {
  it('keeps the highest count per day and drops freezes on completed days', () => {
    const a = { completions: { '2026-09-27': 1 }, frozen: { '2026-09-28': true as const } };
    const b = { completions: { '2026-09-27': 3, '2026-09-28': 3 }, frozen: {} };
    expect(mergeLogs(a, b, 3)).toEqual({ completions: { '2026-09-27': 3, '2026-09-28': 3 }, frozen: {} });
  });

  it('unions habits from both devices', () => {
    const h1 = makeHabit({ id: 'one' });
    const h2 = makeHabit({ id: 'two' });
    const merged = mergeSnapshots(
      { habits: [h1], logs: { one: makeLog(['2026-09-01']) } },
      { habits: [h2], logs: { two: makeLog(['2026-09-02']) } },
    );
    expect(merged.habits.map((h) => h.id).sort()).toEqual(['one', 'two']);
    expect(merged.logs.two.completions).toEqual({ '2026-09-02': 1 });
  });
});
