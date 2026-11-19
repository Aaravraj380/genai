import { eachDay } from '../dates';
import { analyzeReturn, canFreeze, freezesAvailable } from '../freezes';
import {
  dayProgress,
  milestones,
  momentumSeries,
  momentumStreak,
  overallRate,
  perfectDays,
  periodRange,
  previousRange,
  repsInRange,
  weekdayRates,
} from '../stats';
import { makeHabit, makeLog } from './helpers';

const TODAY = '2026-09-29'; // Tuesday

describe('freezes', () => {
  const daily = makeHabit();

  it('allows 2 per calendar month', () => {
    const log = makeLog([], ['2026-09-10']);
    expect(freezesAvailable(log, '2026-09-28')).toBe(1);
    expect(freezesAvailable(log, '2026-10-01')).toBe(2);
  });

  it('only freezes recent, missed, past days', () => {
    const log = makeLog(['2026-09-27']);
    expect(canFreeze(daily, log, '2026-09-28', TODAY)).toEqual({ ok: true });
    expect(canFreeze(daily, log, '2026-09-27', TODAY)).toEqual({ ok: false, reason: 'completed' });
    expect(canFreeze(daily, log, TODAY, TODAY)).toEqual({ ok: false, reason: 'today' });
    expect(canFreeze(daily, log, '2026-09-30', TODAY)).toEqual({ ok: false, reason: 'future' });
    expect(canFreeze(daily, log, '2026-09-01', TODAY)).toEqual({ ok: false, reason: 'too-old' });
    const spent = makeLog([], ['2026-09-20', '2026-09-21']);
    expect(canFreeze(daily, spent, '2026-09-28', TODAY)).toEqual({ ok: false, reason: 'no-freezes' });
  });
});

describe('analyzeReturn — reopening the app after inactivity', () => {
  const a = makeHabit({ id: 'a' });
  const b = makeHabit({ id: 'b', frequency: { type: 'weekends' } });

  it('returns null when the app was used today or yesterday', () => {
    expect(analyzeReturn([a], {}, TODAY, TODAY)).toBeNull();
    expect(analyzeReturn([a], {}, '2026-09-28', TODAY)).toBeNull();
    expect(analyzeReturn([a], {}, null, TODAY)).toBeNull();
  });

  it('EDGE: after 3 days away reports the broken streak and that it is repairable', () => {
    // Last opened Sat 26 after completing; nothing since. Today Tue 29.
    const logs = { a: makeLog(eachDay('2026-09-20', '2026-09-26')) };
    const report = analyzeReturn([a], logs, '2026-09-26', TODAY)!;
    expect(report.daysAway).toBe(3);
    expect(report.broken).toEqual([
      { habitId: 'a', previousStreak: 7, missedDays: ['2026-09-27', '2026-09-28'], repairable: true },
    ]);
  });

  it('marks it unrepairable when the month has too few freezes', () => {
    const logs = { a: makeLog(eachDay('2026-09-20', '2026-09-25')) }; // 26, 27, 28 missed = 3 > 2
    const report = analyzeReturn([a], logs, '2026-09-25', TODAY)!;
    expect(report.broken[0].missedDays).toHaveLength(3);
    expect(report.broken[0].repairable).toBe(false);
  });

  it('does not report habits whose streak survived (only rest days passed)', () => {
    // Weekend habit done Sat 26 & Sun 27; Mon 28 is a rest day.
    const logs = { b: makeLog(['2026-09-26', '2026-09-27']) };
    const report = analyzeReturn([b], logs, '2026-09-26', TODAY)!;
    expect(report.broken).toEqual([]);
    expect(report.intactCount).toBe(1);
  });

  it('ignores habits that had no streak to lose', () => {
    const report = analyzeReturn([a], { a: makeLog() }, '2026-09-25', TODAY)!;
    expect(report.broken).toEqual([]);
  });
});

describe('aggregate stats', () => {
  const daily = makeHabit({ id: 'd', creationDate: '2026-09-21' });
  const weekdays = makeHabit({ id: 'w', creationDate: '2026-09-21', frequency: { type: 'weekdays' } });
  const habits = [daily, weekdays];

  it('uses Monday-first calendar periods', () => {
    expect(periodRange('weekly', TODAY, habits)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(previousRange('weekly', TODAY, habits)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(periodRange('monthly', TODAY, habits)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange('all-time', TODAY, habits).from).toBe('2026-09-21');
  });

  it('reports today’s progress with pending habits in the total', () => {
    const logs = { d: makeLog([TODAY]) };
    expect(dayProgress(habits, logs, TODAY, TODAY)).toEqual({ done: 1, total: 2, ratio: 0.5 });
    // Saturday: only the daily habit is scheduled
    expect(dayProgress(habits, logs, '2026-09-26', TODAY).total).toBe(1);
  });

  it('counts perfect days, reps and targets', () => {
    const logs = {
      d: makeLog(eachDay('2026-09-21', '2026-09-28')),
      w: makeLog(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']),
    };
    // 21–27 all perfect (weekend only needs `d`); 28 misses `w`.
    expect(perfectDays(habits, logs, { from: '2026-09-21', to: '2026-09-30' }, TODAY)).toBe(7);
    expect(repsInRange(habits, logs, { from: '2026-09-21', to: '2026-09-27' }, TODAY)).toEqual({
      reps: 12,
      target: 12,
    });
    expect(overallRate(habits, logs, { from: '2026-09-21', to: '2026-09-28' }, TODAY).rate).toBeCloseTo(13 / 14);
  });

  it('momentum streak needs ≥1 completion per active day and survives a pending today', () => {
    const logs = { d: makeLog(eachDay('2026-09-24', '2026-09-28')) };
    expect(momentumStreak(habits, logs, TODAY)).toBe(5);
    const series = momentumSeries(habits, logs, TODAY, 3);
    expect(series.map((p) => p.streak)).toEqual([4, 5, 5]);
  });

  it('computes per-weekday rates Monday-first', () => {
    const logs = { d: makeLog(['2026-09-21']), w: makeLog(['2026-09-21', '2026-09-22']) };
    const rates = weekdayRates(habits, logs, { from: '2026-09-21', to: '2026-09-27' }, TODAY);
    expect(rates[0]).toBe(1); // Mon: 2/2
    expect(rates[1]).toBe(0.5); // Tue: 1/2
    expect(rates[5]).toBe(0); // Sat: 0/1
  });

  it('unlocks milestones from the best streak', () => {
    const logs = { d: makeLog(eachDay('2026-09-21', '2026-09-28')) };
    const m = milestones(habits, logs, TODAY);
    expect(m.find((x) => x.id === '7d')?.unlocked).toBe(true);
    expect(m.find((x) => x.id === '30d')).toMatchObject({ unlocked: false, progress: 8 });
  });
});

describe('live progress for today', () => {
  it('counts pending habits in today’s weekday bar and trend point', () => {
    const a = makeHabit({ id: 'a', creationDate: '2026-09-28' });
    const b = makeHabit({ id: 'b', creationDate: '2026-09-28' });
    const logs = { a: makeLog([TODAY]) };
    const rates = weekdayRates([a, b], logs, { from: '2026-09-28', to: '2026-10-04' }, TODAY);
    expect(rates[1]).toBe(0.5); // Tuesday = today: 1 of 2
  });
});
