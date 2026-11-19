import { addDays, eachDay, toDateKey } from '../dates';
import {
  bestRun,
  completionRate,
  currentStreak,
  dayStatus,
  longestStreak,
  streakRuns,
  totalCompletions,
} from '../streaks';
import { makeHabit, makeLog, rng } from './helpers';

const TODAY = '2026-09-29'; // Tuesday

describe('currentStreak', () => {
  const daily = makeHabit();

  it('is 0 with no history', () => {
    expect(currentStreak(daily, makeLog(), TODAY)).toBe(0);
  });

  it('counts consecutive completed days including today', () => {
    const log = makeLog(eachDay('2026-09-25', TODAY));
    expect(currentStreak(daily, log, TODAY)).toBe(5);
  });

  it('keeps yesterday’s streak alive while today is pending (midnight rollover)', () => {
    const log = makeLog(eachDay('2026-09-25', '2026-09-28'));
    // At 00:00:01 on the 29th the streak must still read 4, not 0.
    expect(currentStreak(daily, log, TODAY)).toBe(4);
    expect(dayStatus(daily, log, TODAY, TODAY)).toBe('pending');
  });

  it('breaks on a missed past day', () => {
    const log = makeLog(['2026-09-25', '2026-09-26', '2026-09-28']); // 27th missed
    expect(currentStreak(daily, log, '2026-09-28')).toBe(1);
    expect(currentStreak(daily, log, TODAY)).toBe(1); // today pending
    expect(currentStreak(daily, makeLog(['2026-09-26']), TODAY)).toBe(0);
  });

  it('restarts at 1 when completing today after a gap', () => {
    const log = makeLog(['2026-09-20', '2026-09-21', TODAY]);
    expect(currentStreak(daily, log, TODAY)).toBe(1);
  });

  it('EDGE: user returns after 3 days of inactivity → current 0, longest preserved', () => {
    const log = makeLog(eachDay('2026-09-10', '2026-09-25')); // 16-day run, then silence
    expect(currentStreak(daily, log, TODAY)).toBe(0);
    expect(longestStreak(daily, log, TODAY)).toBe(16);
  });

  it('treats non-scheduled weekdays as neutral (weekdays habit over a weekend)', () => {
    const weekdays = makeHabit({ frequency: { type: 'weekdays' } });
    // Thu 24, Fri 25 done; Sat/Sun rest; Mon 28 done
    const log = makeLog(['2026-09-24', '2026-09-25', '2026-09-28']);
    expect(currentStreak(weekdays, log, TODAY)).toBe(3);
  });

  it('supports custom days (Mon/Wed/Fri)', () => {
    const mwf = makeHabit({ frequency: { type: 'custom', days: [1, 3, 5] } });
    const log = makeLog(['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28']);
    expect(currentStreak(mwf, log, TODAY)).toBe(4);
    // Skipping Wed 23 breaks it
    const broken = makeLog(['2026-09-21', '2026-09-25', '2026-09-28']);
    expect(currentStreak(mwf, broken, TODAY)).toBe(2);
  });

  it('counts a bonus completion on a rest day', () => {
    const weekdays = makeHabit({ frequency: { type: 'weekdays' } });
    const log = makeLog(['2026-09-25', '2026-09-26', '2026-09-28']); // Sat 26 is a bonus
    expect(currentStreak(weekdays, log, TODAY)).toBe(3);
  });

  it('lets frozen days bridge a gap without adding to the count', () => {
    const log = makeLog(['2026-09-25', '2026-09-26', '2026-09-28'], ['2026-09-27']);
    expect(currentStreak(daily, log, TODAY)).toBe(3);
  });

  it('lets a pause bridge a gap and resumes counting afterwards', () => {
    const paused = makeHabit({ pauses: [{ start: '2026-09-20', end: '2026-09-27' }] });
    const log = makeLog(['2026-09-18', '2026-09-19', '2026-09-27', '2026-09-28']);
    expect(currentStreak(paused, log, TODAY)).toBe(4);
    expect(dayStatus(paused, log, '2026-09-22', TODAY)).toBe('paused');
  });

  it('never counts days before the habit existed as missed', () => {
    const fresh = makeHabit({ creationDate: TODAY });
    expect(currentStreak(fresh, makeLog(), TODAY)).toBe(0);
    expect(dayStatus(fresh, makeLog(), '2026-09-28', TODAY)).toBe('before-start');
    const yesterdayHabit = makeHabit({ creationDate: '2026-09-28' });
    expect(currentStreak(yesterdayHabit, makeLog(['2026-09-28']), TODAY)).toBe(1);
  });

  it('requires targetPerDay completions for a day to count', () => {
    const thrice = makeHabit({ targetPerDay: 3 });
    const partial = makeLog(['2026-09-28'], [], 2);
    const full = makeLog(['2026-09-28'], [], 3);
    expect(currentStreak(thrice, partial, TODAY)).toBe(0);
    expect(currentStreak(thrice, full, TODAY)).toBe(1);
  });

  it('ignores future-dated entries (clock skew / time travel)', () => {
    const log = makeLog(['2026-09-28', '2026-10-01']);
    expect(currentStreak(daily, log, TODAY)).toBe(1);
    expect(totalCompletions(daily, log, TODAY)).toBe(1);
  });

  it('produces identical results whichever time zone the check-offs happened in', () => {
    // A user in India checks off at 23:59:30 IST each night. Converting those
    // instants in Asia/Kolkata must give consecutive days; a naive UTC
    // conversion would scatter them.
    const instants = [0, 1, 2].map((d) => new Date(Date.UTC(2026, 8, 26 + d, 18, 29, 30)));
    const keys = instants.map((i) => toDateKey(i, 'Asia/Kolkata'));
    expect(keys).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
    expect(currentStreak(daily, makeLog(keys), TODAY)).toBe(3);
  });
});

describe('longest streak and runs', () => {
  const daily = makeHabit();

  it('finds every run and the longest', () => {
    const log = makeLog([
      ...eachDay('2026-09-01', '2026-09-05'), // 5
      ...eachDay('2026-09-10', '2026-09-20'), // 11
      ...eachDay('2026-09-27', TODAY), // 3 (current)
    ]);
    const runs = streakRuns(daily, log, TODAY);
    expect(runs.map((r) => r.length)).toEqual([5, 11, 3]);
    expect(longestStreak(daily, log, TODAY)).toBe(11);
    expect(bestRun(daily, log, TODAY)).toEqual({ start: '2026-09-10', end: '2026-09-20', length: 11 });
    expect(currentStreak(daily, log, TODAY)).toBe(3);
  });

  it('prefers the most recent run on ties', () => {
    const log = makeLog(['2026-09-01', '2026-09-02', '2026-09-10', '2026-09-11']);
    expect(bestRun(daily, log, TODAY)?.start).toBe('2026-09-10');
  });

  it('PROPERTY: current ≤ longest, and current equals the last open run', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const habit = makeHabit({
        creationDate: '2026-06-01',
        frequency: rand() < 0.5 ? { type: 'daily' } : { type: 'custom', days: [1, 3, 5] },
      });
      const done = eachDay('2026-06-01', TODAY).filter(() => rand() < 0.8);
      const frozen = eachDay('2026-06-01', TODAY).filter((k) => !done.includes(k) && rand() < 0.05);
      const log = makeLog(done, frozen);
      const cur = currentStreak(habit, log, TODAY);
      const runs = streakRuns(habit, log, TODAY);
      const longest = longestStreak(habit, log, TODAY);
      expect(cur).toBeLessThanOrEqual(longest);
      // If the last run is still open (no missed day after it), it IS the current streak.
      const last = runs[runs.length - 1];
      const missedAfter =
        last &&
        eachDay(addDays(last.end, 1), TODAY).some((k) => dayStatus(habit, log, k, TODAY) === 'missed');
      expect(cur).toBe(last && !missedAfter ? last.length : 0);
    }
  });
});

describe('totals and rates', () => {
  const daily = makeHabit({ creationDate: '2026-09-20' });

  it('counts total completions only for complete, non-future days', () => {
    const log = makeLog(['2026-09-20', '2026-09-21', '2026-09-19']); // 19th predates creation
    expect(totalCompletions(daily, log, TODAY)).toBe(2);
  });

  it('excludes today from the rate while it is pending', () => {
    const log = makeLog(eachDay('2026-09-20', '2026-09-28'));
    expect(completionRate(daily, log, '2026-09-20', TODAY, TODAY)).toEqual({
      completed: 9,
      scheduled: 9,
      rate: 1,
    });
    const withToday = makeLog(eachDay('2026-09-20', TODAY));
    expect(completionRate(daily, withToday, '2026-09-20', TODAY, TODAY).scheduled).toBe(10);
  });

  it('excludes frozen days and returns null when nothing is scheduled', () => {
    const log = makeLog(['2026-09-20'], ['2026-09-21']);
    expect(completionRate(daily, log, '2026-09-20', '2026-09-22', TODAY)).toEqual({
      completed: 1,
      scheduled: 2,
      rate: 0.5,
    });
    expect(completionRate(daily, log, '2026-09-01', '2026-09-10', TODAY).rate).toBeNull();
  });
});
