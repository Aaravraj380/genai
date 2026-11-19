/**
 * User preferences (Zustand + AsyncStorage), kept separate from habit data so
 * existing installs keep working and a reset of habits never wipes preferences.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FREEZES_PER_MONTH } from '@/domain/freezes';
import type { Weekday } from '@/domain/types';

export type ThemePreference = 'system' | 'dark' | 'light';
export type Language = 'en' | 'hi' | 'bn';

export const MAX_FREEZES = 5;
export const MAX_CATEGORY_LENGTH = 20;

export interface SettingsValues {
  theme: ThemePreference;
  language: Language;
  /** 1 = Monday (default), 0 = Sunday. */
  weekStartsOn: Weekday;
  /** Streak freezes each habit gets per calendar month (0–5). */
  freezesPerMonth: number;
  /** Tags the user created in addition to the six built-in ones. */
  customCategories: string[];
  profileName: string;
  /** Local file URI of the chosen profile photo, or null for initials. */
  avatarUri: string | null;
}

export interface SettingsState extends SettingsValues {
  hasHydrated: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language) => void;
  setWeekStartsOn: (day: Weekday) => void;
  setFreezesPerMonth: (n: number) => void;
  /** Returns the cleaned tag, or null if it was empty. */
  addCategory: (name: string) => string | null;
  removeCategory: (name: string) => void;
  setProfileName: (name: string) => void;
  setAvatarUri: (uri: string | null) => void;
  /** Apply settings from a backup file (avatar is device-specific, so it's kept). */
  applyImported: (values: Partial<SettingsValues>) => void;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  theme: 'dark',
  language: 'en',
  weekStartsOn: 1,
  freezesPerMonth: FREEZES_PER_MONTH,
  customCategories: [],
  profileName: '',
  avatarUri: null,
};

export const cleanCategory = (name: string) =>
  name.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_LENGTH);
export const clampFreezes = (n: number) => Math.max(0, Math.min(MAX_FREEZES, Math.round(n)));

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      hasHydrated: false,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setWeekStartsOn: (weekStartsOn) => set({ weekStartsOn }),
      setFreezesPerMonth: (n) => set({ freezesPerMonth: clampFreezes(n) }),

      addCategory: (name) => {
        const clean = cleanCategory(name);
        if (!clean) return null;
        const exists = get().customCategories.some((c) => c.toLowerCase() === clean.toLowerCase());
        if (!exists) set({ customCategories: [...get().customCategories, clean] });
        return clean;
      },
      removeCategory: (name) => set({ customCategories: get().customCategories.filter((c) => c !== name) }),

      setProfileName: (profileName) => set({ profileName: profileName.slice(0, 40) }),
      setAvatarUri: (avatarUri) => set({ avatarUri }),

      applyImported: (v) =>
        set((s) => ({
          theme: v.theme ?? s.theme,
          language: v.language ?? s.language,
          weekStartsOn: v.weekStartsOn ?? s.weekStartsOn,
          freezesPerMonth: v.freezesPerMonth !== undefined ? clampFreezes(v.freezesPerMonth) : s.freezesPerMonth,
          customCategories: v.customCategories
            ? [...new Set([...s.customCategories, ...v.customCategories.map(cleanCategory).filter(Boolean)])]
            : s.customCategories,
          profileName: v.profileName ?? s.profileName,
        })),
    }),
    {
      name: 'streak-habit/settings/v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): SettingsValues => ({
        theme: s.theme,
        language: s.language,
        weekStartsOn: s.weekStartsOn,
        freezesPerMonth: s.freezesPerMonth,
        customCategories: s.customCategories,
        profileName: s.profileName,
        avatarUri: s.avatarUri,
      }),
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hasHydrated: true });
      },
    },
  ),
);

/** Snapshot of the persisted values (for backups). */
export function currentSettings(): SettingsValues {
  const s = useSettingsStore.getState();
  return {
    theme: s.theme,
    language: s.language,
    weekStartsOn: s.weekStartsOn,
    freezesPerMonth: s.freezesPerMonth,
    customCategories: s.customCategories,
    profileName: s.profileName,
    avatarUri: s.avatarUri,
  };
}
