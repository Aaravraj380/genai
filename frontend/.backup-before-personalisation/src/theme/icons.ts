/**
 * Icon mapping. The Stitch screens use Google "Material Symbols"; the closest
 * bundled set in Expo is MaterialIcons from @expo/vector-icons, which shares
 * the same glyph names (snake_case → kebab-case).
 */
import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { HabitIcon } from '@/domain/types';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export const habitIconGlyph: Record<HabitIcon, IconName> = {
  reading: 'menu-book',
  workout: 'fitness-center',
  hydrate: 'water-drop',
  mind: 'self-improvement',
  focus: 'psychology',
  run: 'directions-run',
  sleep: 'nights-stay',
  nutrition: 'restaurant',
  journal: 'edit-note',
  code: 'terminal',
};

/** "Quick icon presets" row on the New Habit screen. */
export const iconPresets: { icon: HabitIcon; label: string }[] = [
  { icon: 'reading', label: 'Reading' },
  { icon: 'workout', label: 'Workout' },
  { icon: 'hydrate', label: 'Hydrate' },
  { icon: 'mind', label: 'Mind' },
  { icon: 'focus', label: 'Focus' },
  { icon: 'run', label: 'Run' },
  { icon: 'sleep', label: 'Sleep' },
  { icon: 'nutrition', label: 'Nutrition' },
  { icon: 'journal', label: 'Journal' },
  { icon: 'code', label: 'Code' },
];

export const categories = ['Mindfulness', 'Health', 'Focus', 'Fitness', 'Learning', 'Recovery'] as const;

/** Tag tint per category, matching the chips on the Today mockup. */
export const categoryTint: Record<string, 'cobalt' | 'emerald' | 'flame'> = {
  Mindfulness: 'cobalt',
  Health: 'emerald',
  Focus: 'cobalt',
  Fitness: 'flame',
  Learning: 'flame',
  Recovery: 'cobalt',
};
