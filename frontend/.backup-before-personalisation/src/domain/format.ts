import { WEEKDAY_LABELS } from './dates';
import { frequencyDays } from './streaks';
import type { Frequency } from './types';

/** Human label for a frequency: "Daily", "Weekdays", "Mon · Wed · Fri". */
export function describeFrequency(freq: Frequency): string {
  switch (freq.type) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'custom': {
      const days = frequencyDays(freq);
      if (days.length === 7) return 'Daily';
      // Show Monday-first
      const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return ordered.map((d) => WEEKDAY_LABELS[d]).join(' · ');
    }
  }
}

export function timesPerWeek(freq: Frequency): number {
  return frequencyDays(freq).length;
}
