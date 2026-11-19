/**
 * Global theme provider + responsive layout helpers.
 *
 * The Stitch system is dark-only, so there is one theme object. It is still
 * delivered through context so screens never import tokens directly, which
 * keeps a future light theme (or per-user accent) a one-file change.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { theme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(theme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
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
