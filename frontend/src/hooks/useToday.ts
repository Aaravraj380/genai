/**
 * `useToday()` — the current local DateKey, kept fresh across midnight.
 *
 * Three things can make "today" change while the app is alive:
 *  1. The clock passes midnight while the app is open → a timer fires.
 *  2. The app sat in the background overnight (timers are frozen) → we
 *     re-check on every AppState → 'active' transition.
 *  3. The user flew to another time zone → same AppState re-check.
 * Everything downstream (streaks, today's list) re-derives from this value.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextMidnight, todayKey } from '@/domain/dates';

export function useToday(): string {
  const [today, setToday] = useState(() => todayKey());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setToday((prev) => (prev === todayKey() ? prev : todayKey()));
    const schedule = () => {
      clearTimeout(timer);
      // +500ms guard so we land safely after midnight even with timer jitter.
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextMidnight() + 500);
    };
    schedule();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
