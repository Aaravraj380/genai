/**
 * Global theme provider + responsive layout helpers.
 *
 * The theme follows the user's choice in Settings: Dark (the original
 * Kinetic Obsidian look), Light, or System (follows the phone setting).
 * Screens never import tokens directly — they call `useTheme()` — so the
 * whole app re-colours instantly when the choice changes.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { useSettingsStore } from '@/store/useSettingsStore';

import { makeTheme, theme as defaultTheme, type Theme, type ThemeMode } from './tokens';

const ThemeContext = createContext<Theme>(defaultTheme);

export function useResolvedThemeMode(): ThemeMode {
  const pref = useSettingsStore((s) => s.theme);
  const system = useColorScheme();
  if (pref === 'system') return system === 'light' ? 'light' : 'dark';
  return pref;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useResolvedThemeMode();
  const value = useMemo(() => makeTheme(mode), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Breakpoints from DESIGN.md "Layout & Spacing":
 *  - compact  < 360 (small Androids / iPhone SE): tighter type & 2-col grids collapse
 *  - phone    < 768: single column, 16px margins
 *  - tablet   ≥ 768: 32px margins, content capped and centred
 */
export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return useMemo(() => {
    const isCompact = width < 360;
    const isTablet = width >= 768;
    const gutter = isTablet ? 32 : 16;
    const maxContentWidth = isTablet ? 720 : 560;
    const contentWidth = Math.min(width, maxContentWidth) - gutter * 2;
    return {
      width,
      height,
      fontScale,
      isCompact,
      isTablet,
      gutter,
      maxContentWidth,
      contentWidth,
      /** Columns for stat tiles: 1 on tiny screens, 2 on phones, 4 on tablets. */
      statColumns: isCompact ? 1 : isTablet ? 4 : 2,
    };
  }, [width, height, fontScale]);
}
