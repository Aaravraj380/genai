import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  endOfMonth,
  isValidDateKey,
  msUntilNextMidnight,
  startOfWeek,
  toDateKey,
  weekdayOf,
} from '../dates';

describe('toDateKey — local device time', () => {
  // These use the local Date constructor, so they must pass in ANY process TZ
  // (run `npm run test:tz` to execute the whole suite across several zones).
  it('maps 23:59:59.999 to the same day and 00:00 to the next (midnight rollover)', () => {
    expect(toDateKey(new Date(2026, 8, 28, 23, 59, 59, 999))).toBe('2026-09-28');
    expect(toDateKey(new Date(2026, 8, 29, 0, 0, 0, 0))).toBe('2026-09-29');
  });

  it('handles year and leap-day boundaries', () => {
    expect(toDateKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(toDateKey(new Date(2028, 1, 29, 12))).toBe('2028-02-29');
  });

  it('rejects invalid dates', () => {
    expect(() => toDateKey(new Date('nope'))).toThrow(RangeError);
  });
});

describe('toDateKey — explicit IANA time zones', () => {
  it('splits the day exactly at local midnight in India (UTC+05:30)', () => {
    expect(toDateKey(new Date('2026-09-28T18:29:59.999Z'), 'Asia/Kolkata')).toBe('2026-09-28');
    expect(toDateKey(new Date('2026-09-28T18:30:00.000Z'), 'Asia/Kolkata')).toBe('2026-09-29');
  });

  it('is unaffected by US DST spring-forward and fall-back', () => {
    // 2026-03-08 02:00 EST → 03:00 EDT
    expect(toDateKey(new Date('2026-03-08T04:59:59Z'), 'America/New_York')).toBe('2026-03-07');
    expect(toDateKey(new Date('2026-03-08T05:00:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(toDateKey(new Date('2026-03-09T03:59:59Z'), 'America/New_York')).toBe('2026-03-08');
    // 2026-11-01 02:00 EDT → 01:00 EST (a 25-hour day)
    expect(toDateKey(new Date('2026-11-01T04:00:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(toDateKey(new Date('2026-11-02T04:59:59Z'), 'America/New_York')).toBe('2026-11-01');
    expect(toDateKey(new Date('2026-11-02T05:00:00Z'), 'America/New_York')).toBe('2026-11-02');
  });

  it('gives different days for the same instant on opposite sides of the date line', () => {
    const instant = new Date('2026-06-15T11:00:00Z');
    expect(toDateKey(instant, 'Pacific/Kiritimati')).toBe('2026-06-16'); // UTC+14
    expect(toDateKey(instant, 'Pacific/Pago_Pago')).toBe('2026-06-15'); // UTC-11
  });
});

describe('day arithmetic', () => {
  it('adds days across DST, month, year and leap boundaries', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    // 25-hour and 23-hour local days: a naive "+24h in local time" would
    // return the same day / skip a day here when TZ has DST (see test:tz).
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08');
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05'); // Lord Howe / AU DST start
    expect(eachDay('2026-10-31', '2026-11-03')).toHaveLength(4);
  });

  it('diffDays counts DST days as exactly one day', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
    expect(diffDays('2026-09-29', '2026-09-26')).toBe(-3);
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-01-01')).toBe(4); // Thursday
    expect(weekdayOf('2024-02-29')).toBe(4); // Thursday
    expect(weekdayOf('2026-09-28')).toBe(1); // Monday
  });

  it('computes Monday-first week starts and month ends', () => {
    expect(startOfWeek('2026-09-30')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday belongs to the prior Monday
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('clamps when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-11-30', 14)).toBe('2028-01-30');
  });

  it('lists inclusive ranges', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('validates keys', () => {
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2028-02-29')).toBe(true);
    expect(isValidDateKey('2026-9-1')).toBe(false);
  });

  it('schedules the midnight timer within the current local day', () => {
    const now = new Date(2026, 8, 28, 23, 59, 0);
    expect(msUntilNextMidnight(now)).toBe(60_000);
    const ms = msUntilNextMidnight(new Date(2026, 8, 28, 0, 0, 0));
    expect(ms).toBeGreaterThan(22 * 3_600_000);
    expect(ms).toBeLessThanOrEqual(25 * 3_600_000);
  });
});
