import { DEFAULT_SETTINGS, useSettingsStore } from '../useSettingsStore';

// Hoisted above the imports by babel-jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const s = () => useSettingsStore.getState();
beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

describe('settings store', () => {
  it('cleans and de-duplicates custom tags', () => {
    expect(s().addCategory('  #Family  ')).toBe('Family');
    expect(s().addCategory('family')).toBe('family');
    expect(s().addCategory('   ')).toBeNull();
    expect(s().customCategories).toEqual(['Family']);
    s().removeCategory('Family');
    expect(s().customCategories).toEqual([]);
  });

  it('clamps freezes to 0–5', () => {
    s().setFreezesPerMonth(9);
    expect(s().freezesPerMonth).toBe(5);
    s().setFreezesPerMonth(-1);
    expect(s().freezesPerMonth).toBe(0);
  });

  it('imports settings but keeps this phone’s photo', () => {
    s().setAvatarUri('file:///me.jpg');
    s().applyImported({ language: 'bn', theme: 'light', customCategories: ['Prayer'] });
    expect(s()).toMatchObject({ language: 'bn', theme: 'light', customCategories: ['Prayer'], avatarUri: 'file:///me.jpg' });
  });
});
