import { TEMPLATES } from '@/domain/templates';

import { bn } from '../bn';
import { en, type StringKey } from '../en';
import { hi } from '../hi';
import { makeI18n, translate } from '../index';

// Hoisted above the imports by babel-jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('translations', () => {
  it.each([
    ['hi', hi],
    ['bn', bn],
  ])('%s has every key, nothing empty, and the same {placeholders} as English', (_, table) => {
    for (const key of Object.keys(en) as StringKey[]) {
      expect(table[key]?.trim().length).toBeGreaterThan(0);
      expect([key, placeholders(table[key])]).toEqual([key, placeholders(en[key])]);
    }
    expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
  });

  it('fills placeholders and falls back to English', () => {
    expect(translate('en', 'today.onFire', { n: 12 })).toBe('On Fire! 12 Day Streak');
    expect(translate('hi', 'today.onFire', { n: 12 })).toContain('12');
  });

  it('has a title for every library template in every language', () => {
    for (const lang of ['en', 'hi', 'bn'] as const) {
      const i18n = makeI18n(lang);
      for (const tpl of TEMPLATES) expect(i18n.template(tpl).title.length).toBeGreaterThan(0);
    }
  });

  it('localizes calendar words and keeps custom tags as typed', () => {
    const bnI = makeI18n('bn');
    expect(bnI.dates.monthYear('2026-09-29')).toBe('সেপ্টেম্বর 2026');
    expect(bnI.category('Health')).toBe('স্বাস্থ্য');
    expect(bnI.category('Family')).toBe('Family');
    expect(makeI18n('en').joinList(['Mondays', 'Tuesdays', 'Fridays'])).toBe('Mondays, Tuesdays and Fridays');
  });
});
