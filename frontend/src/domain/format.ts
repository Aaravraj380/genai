import { WEEKDAY_LABELS } from './dates';
import { frequencyDays } from './streaks';
import type { Frequency, Weekday } from './types';

export interface FrequencyLabels {
  daily: string;
  weekdays: string;
  weekends: string;
  /** Short weekday names indexed 0 = Sunday … 6 = Saturday. */
  dayNames: readonly string[];
}

const EN_LABELS: FrequencyLabels = { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', dayNames: WEEKDAY_LABELS };

/**
 * Human label for a frequency: "Daily", "Weekdays", "Mon · Wed · Fri".
 * Pass localized `labels` and the user's `weekStartsOn` to translate and order it.
 */
export function describeFrequency(freq: Frequency, labels: FrequencyLabels = EN_LABELS, weekStartsOn: Weekday = 1): string {
  switch (freq.type) {
    case 'daily':
      return labels.daily;
    case 'weekdays':
      return labels.weekdays;
    case 'weekends':
      return labels.weekends;
    case 'custom': {
      const days = frequencyDays(freq);
      if (days.length === 7) return labels.daily;
      const ordered = [...days].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7));
      return ordered.map((d) => labels.dayNames[d]).join(' · ');
    }
  }
}

export function timesPerWeek(freq: Frequency): number {
  return frequencyDays(freq).length;
}
