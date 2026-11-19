/**
 * "Kinetic Obsidian" design tokens, extracted 1:1 from the Stitch export
 * (Design/kinetic_obsidian/DESIGN.md and the Tailwind config embedded in each
 * screen's code.html). Keep this file the single source of visual truth.
 */
import type { TextStyle } from 'react-native';

export const darkPalette = {
  // Neutral stack (tonal stepping, no muddy shadows)
  surfaceBase: '#0F1115', // root canvas
  surface: '#111317', // screen background used by the Stitch screens
  surfaceElevated: '#181A20', // level 1: cards, sheets
  surfaceContainer: '#222630', // level 2: insets, segmented tracks, troughs
  surfaceContainerLow: '#1A1C20',
  surfaceContainerHigh: '#282A2E',
  surfaceContainerHighest: '#333539',
  borderSubtle: '#2E3440',
  ghostBorder: 'rgba(255,255,255,0.07)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  onSurface: '#E2E2E8',

  // Accents
  primary: '#4EDEA3', // bright emerald used for fills in the mockups
  primaryContainer: '#10B981', // "Electric Emerald" (success-electric)
  onPrimary: '#003824',
  streakFire: '#F97316', // "Flame Orange" — streaks only
  secondary: '#FFB690',
  tertiary: '#ADC6FF', // "Focus Cobalt" family — meta info, frozen days
  tertiaryContainer: '#71A1FF',
  error: '#FFB4AB',

  // Glows
  glowLime: 'rgba(16,185,129,0.25)',
  glowOrange: 'rgba(249,115,22,0.25)',
};

export type Palette = typeof darkPalette;

/**
 * Light mode: same roles, re-tuned for white surfaces. Accents are darkened
 * so text and icons keep ≥4.5:1 / 3:1 contrast on light backgrounds.
 */
export const lightPalette: Palette = {
  surfaceBase: '#EEF0F3',
  surface: '#F6F7F9',
  surfaceElevated: '#FFFFFF',
  surfaceContainer: '#EDEFF3',
  surfaceContainerLow: '#F2F3F6',
  surfaceContainerHigh: '#E4E7EC',
  surfaceContainerHighest: '#D5D9E0',
  borderSubtle: '#D9DDE3',
  ghostBorder: 'rgba(15,17,21,0.08)',

  textPrimary: '#111317',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  onSurface: '#1F2329',

  primary: '#047857',
  primaryContainer: '#10B981',
  onPrimary: '#FFFFFF',
  streakFire: '#C2410C',
  secondary: '#B45309',
  tertiary: '#1D4ED8',
  tertiaryContainer: '#60A5FA',
  error: '#B91C1C',

  glowLime: 'rgba(16,185,129,0.18)',
  glowOrange: 'rgba(249,115,22,0.18)',
};

/** Kept for code that only needs the default (dark) values, e.g. the splash. */
export const palette = darkPalette;

/** Tag chip colours seen on the Today screen (#Mindfulness, #Health …). */
export const darkTagTints = {
  cobalt: { bg: 'rgba(113,161,255,0.16)', fg: '#ADC6FF' },
  emerald: { bg: 'rgba(16,185,129,0.16)', fg: '#4EDEA3' },
  flame: { bg: 'rgba(249,115,22,0.16)', fg: '#FFB690' },
};
export type TagTints = typeof darkTagTints;
export const lightTagTints: TagTints = {
  cobalt: { bg: 'rgba(29,78,216,0.10)', fg: '#1D4ED8' },
  emerald: { bg: 'rgba(4,120,87,0.10)', fg: '#047857' },
  flame: { bg: 'rgba(194,65,12,0.10)', fg: '#C2410C' },
};
export const tagTints = darkTagTints;

/** "Atmosphere & Glow Theme" swatches from the New Habit screen. */
export const habitColors = ['#4EDEA3', '#C2570F', '#5B7FD1', '#8C9CCB', '#C88A6E', '#C9B2A6'] as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

/** Letter-spacing in the spec is in `em`; RN needs absolute points. */
const em = (size: number, value: number) => size * value;

export const typography = {
  displayHero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: em(40, -0.02) },
  headlineLg: { fontFamily: fonts.displaySemi, fontSize: 28, lineHeight: 36, letterSpacing: em(28, -0.01) },
  headlineMd: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 32, letterSpacing: em(24, -0.01) },
  headlineSm: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 28 },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24 },
  bodySm: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  labelLg: { fontFamily: fonts.displaySemi, fontSize: 14, lineHeight: 20, letterSpacing: em(14, 0.02) },
  labelMd: { fontFamily: fonts.displaySemi, fontSize: 12, lineHeight: 16, letterSpacing: em(12, 0.04) },
  labelSm: { fontFamily: fonts.display, fontSize: 10, lineHeight: 14, letterSpacing: em(10, 0.06) },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const radii = { sm: 4, base: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, gutter: 16 } as const;

/** Luminous glows (DESIGN.md "Elevation & Depth"). RN ≥0.76 supports `boxShadow` on iOS, Android and web. */
export const glows = {
  emerald: '0px 0px 20px rgba(16, 185, 129, 0.25)',
  emeraldStrong: '0px 0px 24px rgba(78, 222, 163, 0.40)',
  flame: '0px 0px 16px rgba(249, 115, 22, 0.30)',
} as const;

export const motion = {
  pressScale: 0.98,
  spring: { damping: 14, stiffness: 180, mass: 0.8 },
  fast: 180,
  medium: 320,
} as const;

export type ThemeMode = 'dark' | 'light';

export function makeTheme(mode: ThemeMode) {
  return {
    mode,
    palette: mode === 'light' ? lightPalette : darkPalette,
    tagTints: mode === 'light' ? lightTagTints : darkTagTints,
    habitColors,
    fonts,
    typography,
    radii,
    spacing,
    glows,
    motion,
  };
}

export type Theme = ReturnType<typeof makeTheme>;
export const theme: Theme = makeTheme('dark');
