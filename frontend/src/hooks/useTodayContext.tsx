/**
 * Shares one `useToday()` instance app-wide so every screen agrees on the
 * date and only one midnight timer runs.
 */
import { createContext, useContext, type ReactNode } from 'react';

import { todayKey } from '@/domain/dates';

import { useToday } from './useToday';

const TodayContext = createContext<string>(todayKey());

export function TodayProvider({ children }: { children: ReactNode }) {
  const today = useToday();
  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export const useTodayKey = () => useContext(TodayContext);
