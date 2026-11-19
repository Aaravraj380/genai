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

/** "Quick icon presets" row on the New Habit screen (labels come from i18n `icon.<name>`). */
export const iconPresets: HabitIcon[] = ['reading', 'workout', 'hydrate', 'mind', 'focus', 'run', 'sleep', 'nutrition', 'journal', 'code'];

export const categories = ['Mindfulness', 'Health', 'Focus', 'Fitness', 'Learning', 'Recovery'] as const;
export const isBuiltInCategory = (name: string) => (categories as readonly string[]).includes(name);

/** Tag tint per category, matching the chips on the Today mockup. */
export const categoryTint: Record<string, 'cobalt' | 'emerald' | 'flame'> = {
  Mindfulness: 'cobalt',
  Health: 'emerald',
  Focus: 'cobalt',
  Fitness: 'flame',
  Learning: 'flame',
  Recovery: 'cobalt',
};

const TINTS = ['cobalt', 'emerald', 'flame'] as const;

/** Built-in tags keep their design colour; custom tags get a stable colour from their name. */
export function tintForCategory(name: string): 'cobalt' | 'emerald' | 'flame' {
  if (categoryTint[name]) return categoryTint[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TINTS[h % TINTS.length];
}
