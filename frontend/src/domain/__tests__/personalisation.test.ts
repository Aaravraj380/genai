import { eachDay } from '../dates';
import { describeFrequency } from '../format';
import { analyzeReturn, canFreeze, freezesAvailable } from '../freezes';
import { completionTrend, periodRange, previousRange, weekdayRates } from '../stats';
import { makeHabit, makeLog } from './helpers';

const TODAY = '2026-09-29'; // Tuesday

describe('week start setting', () => {
  const habits = [makeHabit({ creationDate: '2026-09-01' })];

  it('Sunday-first weeks start on the previous Sunday', () => {
    expect(periodRange('weekly', TODAY, habits, 0)).toEqual({ from: '2026-09-27', to: '2026-10-03' });
    expect(previousRange('weekly', TODAY, habits, 0)).toEqual({ from: '2026-09-20', to: '2026-09-26' });
  });

  it('Monday-first stays the default', () => {
    expect(periodRange('weekly', TODAY, habits)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('orders weekday rates from the chosen first day', () => {
    const logs = { h1: makeLog(['2026-09-20']) }; // a Sunday
    const range = { from: '2026-09-20', to: '2026-09-26' };
    const sundayFirst = weekdayRates(habits, logs, range, TODAY, 0);
    const mondayFirst = weekdayRates(habits, logs, range, TODAY, 1);
    expect(sundayFirst[0]).toBe(1); // Sunday is first
    expect(mondayFirst[6]).toBe(1); // Sunday is last
  });

  it('gives trend points a key so labels can be localized', () => {
    const points = completionTrend(habits, {}, 'weekly', TODAY, 0);
    expect(points[0].key).toBe('2026-09-27');
  });

  it('orders custom-day labels by week start', () => {
    const freq = { type: 'custom' as const, days: [0, 1, 3] as (0 | 1 | 3)[] };
    expect(describeFrequency(freq)).toBe('Mon · Wed · Sun');
    expect(describeFrequency(freq, undefined, 0)).toBe('Sun · Mon · Wed');
  });

  it('uses translated labels when provided', () => {
    const labels = { daily: 'रोज़', weekdays: 'कार्यदिवस', weekends: 'सप्ताहांत', dayNames: ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] };
    expect(describeFrequency({ type: 'daily' }, labels)).toBe('रोज़');
    expect(describeFrequency({ type: 'custom', days: [1, 3] }, labels)).toBe('सो · बु');
  });
});

describe('freezes-per-month setting', () => {
  const daily = makeHabit();

  it('respects a custom allowance, including 0 (off)', () => {
    const log = makeLog([], ['2026-09-10', '2026-09-11']);
    expect(freezesAvailable(log, TODAY, 5)).toBe(3);
    expect(freezesAvailable(log, TODAY, 0)).toBe(0);
    expect(canFreeze(daily, makeLog(), '2026-09-28', TODAY, 0)).toEqual({ ok: false, reason: 'no-freezes' });
    expect(canFreeze(daily, log, '2026-09-28', TODAY, 3)).toEqual({ ok: true });
  });

  it('lets a bigger allowance repair a longer absence', () => {
    const logs = { h1: makeLog(eachDay('2026-09-20', '2026-09-25')) }; // 26, 27, 28 missed
    expect(analyzeReturn([daily], logs, '2026-09-25', TODAY)!.broken[0].repairable).toBe(false); // default 2
    expect(analyzeReturn([daily], logs, '2026-09-25', TODAY, 3)!.broken[0].repairable).toBe(true);
  });
});
