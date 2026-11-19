/**
 * Tiny, dependency-free i18n layer.
 *
 *   const { t, dates, category } = useT();
 *   t('today.onFire', { n: 12 })   →  "On Fire! 12 Day Streak" / "शानदार! 12 दिन की स्ट्रीक"
 *
 * Language comes from the settings store, so switching it in Settings
 * re-renders every screen immediately. Non-React code (notifications) uses
 * `translate(lang, key)`.
 */
import { useMemo } from 'react';

import { parseDateKey, weekdayOf } from '@/domain/dates';
import type { FrequencyLabels } from '@/domain/format';
import type { HabitTemplate } from '@/domain/templates';
import type { DateKey, Weekday } from '@/domain/types';
import { useSettingsStore, type Language } from '@/store/useSettingsStore';

import { bn } from './bn';
import { en, type StringKey, type Strings } from './en';
import { hi } from './hi';

const TABLES: Record<Language, Strings> = { en, hi, bn };

export type Vars = Record<string, string | number>;

export function translate(lang: Language, key: StringKey, vars?: Vars): string {
  const template = TABLES[lang]?.[key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Native names, always shown in their own script in the language picker. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'हिन्दी', bn: 'বাংলা' };

/* ------------------------------------------------------------------ */
/* Calendar vocabulary                                                 */
/* ------------------------------------------------------------------ */

interface DateWords {
  weekdayShort: readonly string[]; // 0 = Sunday
  weekdayLetter: readonly string[];
  weekdayLong: readonly string[];
  monthShort: readonly string[];
  monthLong: readonly string[];
}

const DATE_WORDS: Record<Language, DateWords> = {
  en: {
    weekdayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdayLetter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    weekdayLong: ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'],
    monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  hi: {
    weekdayShort: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
    weekdayLetter: ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'],
    weekdayLong: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
    monthShort: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सितं', 'अक्टू', 'नवं', 'दिसं'],
    monthLong: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  },
  bn: {
    weekdayShort: ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'],
    weekdayLetter: ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'],
    weekdayLong: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
    monthShort: ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
    monthLong: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  },
};

const BUILT_IN_CATEGORIES = ['Mindfulness', 'Health', 'Focus', 'Fitness', 'Learning', 'Recovery'];

export function makeI18n(lang: Language) {
  const w = DATE_WORDS[lang];
  const t = (key: StringKey, vars?: Vars) => translate(lang, key, vars);
  const has = (key: string): key is StringKey => key in en;

  const dates = {
    weekdayShort: (key: DateKey) => w.weekdayShort[weekdayOf(key)],
    weekdayShortOf: (d: Weekday) => w.weekdayShort[d],
    weekdayLetter: (d: Weekday) => w.weekdayLetter[d],
    weekdayLong: (d: Weekday) => w.weekdayLong[d],
    monthShort: (key: DateKey) => w.monthShort[parseDateKey(key).month - 1],
    monthLong: (key: DateKey) => w.monthLong[parseDateKey(key).month - 1],
    /** "September 2026" / "सितंबर 2026" */
    monthYear: (key: DateKey) => `${w.monthLong[parseDateKey(key).month - 1]} ${parseDateKey(key).year}`,
    /** "Sep 2026" */
    monthYearShort: (key: DateKey) => `${w.monthShort[parseDateKey(key).month - 1]} ${parseDateKey(key).year}`,
    /** "Wed, Sep 23" style */
    dayLabel: (key: DateKey) =>
      `${w.weekdayShort[weekdayOf(key)]}, ${w.monthShort[parseDateKey(key).month - 1]} ${parseDateKey(key).day}`,
  };

  /** Built-in tags are stored in English and shown translated; custom tags show as typed. */
  const category = (name: string) => {
    const k = `cat.${name}`;
    return BUILT_IN_CATEGORIES.includes(name) && has(k) ? t(k) : name;
  };

  /** Template with title/note in the current language (used when adding from the library). */
  const template = (tpl: HabitTemplate): HabitTemplate => {
    const titleKey = `tpl.${tpl.key}`;
    const noteKey = `tpl.${tpl.key}.note`;
    return {
      ...tpl,
      title: has(titleKey) ? t(titleKey) : tpl.title,
      note: tpl.note && has(noteKey) ? t(noteKey) : tpl.note,
    };
  };

  const freqLabels: FrequencyLabels = {
    daily: t('freq.daily'),
    weekdays: t('freq.weekdays'),
    weekends: t('freq.weekends'),
    dayNames: w.weekdayShort,
  };

  /** "Mondays and Tuesdays" / "सोमवार और मंगलवार" */
  const joinList = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${t('common.and')} ${items[items.length - 1]}`;

  return { lang, t, dates, category, template, freqLabels, joinList };
}

export type I18n = ReturnType<typeof makeI18n>;

export function useT(): I18n {
  const lang = useSettingsStore((s) => s.language);
  return useMemo(() => makeI18n(lang), [lang]);
}

export type { StringKey };
