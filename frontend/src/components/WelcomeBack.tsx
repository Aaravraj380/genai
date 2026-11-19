/**
 * Re-entry flow — the "opened the app after 3 days of inactivity" edge case.
 *
 * On launch/resume we compare `lastActiveDate` with today. If 2+ days passed
 * and streaks died in the gap, this sheet explains exactly what happened and
 * offers to spend streak freezes to repair them (when the monthly budget and
 * 7-day repair window allow). Otherwise it silently records today as active.
 */
import { useEffect, useMemo } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analyzeReturn } from '@/domain/freezes';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT } from '@/i18n';
import { haptic } from '@/services/haptics';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { habitIconGlyph } from '@/theme/icons';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText, Button, Icon, Pill } from './primitives';

export function WelcomeBackGate() {
  const t = useTheme();
  const { t: tr } = useT();
  const allowance = useSettingsStore((s) => s.freezesPerMonth);
  const insets = useSafeAreaInsets();
  const today = useTodayKey();
  const hydrated = useHabitStore((s) => s.hasHydrated);
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const lastActive = useHabitStore((s) => s.lastActiveDate);

  // Derived, not stored: repairing (freezes) or "start fresh" (markActive)
  // naturally makes the report empty and the sheet disappears.
  const found = useMemo(
    () => (hydrated ? analyzeReturn(habits, logs, lastActive, today, allowance) : null),
    [hydrated, habits, logs, lastActive, today, allowance],
  );
  const report = found && found.broken.length > 0 ? found : null;

  // Nothing to report → simply record today as an active day.
  useEffect(() => {
    if (hydrated && !report && lastActive !== today) useHabitStore.getState().markActive(today);
  }, [hydrated, report, lastActive, today]);

  const byId = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);

  if (!report) return null;
  const repairable = report.broken.filter((b) => b.repairable);
  const freezesNeeded = repairable.reduce((n, b) => n + b.missedDays.length, 0);

  const close = () => useHabitStore.getState().markActive(today);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,6,8,0.72)', justifyContent: 'flex-end' }}>
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          style={{
            backgroundColor: t.palette.surfaceElevated,
            borderTopLeftRadius: t.radii.xl,
            borderTopRightRadius: t.radii.xl,
            borderWidth: 1,
            borderColor: t.palette.borderSubtle,
            padding: 20,
            paddingBottom: insets.bottom + 20,
            gap: 16,
            maxHeight: '85%',
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.palette.borderSubtle }} />
          <View style={{ gap: 6 }}>
            <Pill tone="cobalt">
              <Icon name="waving-hand" size={13} color={t.palette.tertiary} />
              <AppText variant="labelSm" color={t.palette.tertiary}>
                {tr('wb.daysSince', { n: report.daysAway })}
              </AppText>
            </Pill>
            <AppText variant="headlineMd">{tr('wb.title')}</AppText>
            <AppText variant="bodyMd" color={t.palette.textSecondary}>
              {report.broken.length === 1 ? tr('wb.brokenOne') : tr('wb.brokenMany', { n: report.broken.length })}
              {repairable.length > 0 ? tr('wb.canRepair', { n: allowance }) : tr('wb.cannotRepair')}
            </AppText>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
            {report.broken.map((b) => {
              const h = byId.get(b.habitId);
              if (!h) return null;
              return (
                <View
                  key={b.habitId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: t.radii.md,
                    backgroundColor: t.palette.surfaceContainer,
                  }}>
                  <Icon name={habitIconGlyph[h.icon]} size={22} color={h.color} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="labelLg" numberOfLines={1}>
                      {h.title}
                    </AppText>
                    <AppText variant="bodySm" color={t.palette.textSecondary}>
                      {tr('wb.line', { streak: b.previousStreak, n: b.missedDays.length })}
                    </AppText>
                  </View>
                  <Icon
                    name={b.repairable ? 'ac-unit' : 'block'}
                    size={18}
                    color={b.repairable ? t.palette.tertiary : t.palette.textMuted}
                  />
                </View>
              );
            })}
          </ScrollView>

          {repairable.length > 0 ? (
            <Button
              label={tr('wb.repair', { n: freezesNeeded })}
              icon="ac-unit"
              onPress={() => {
                useHabitStore.getState().repairStreaks(report, today, allowance);
                haptic.success();
                close();
              }}
            />
          ) : null}
          <Button label={tr('wb.fresh')} tone="ghost" icon="bolt" onPress={close} />
        </Animated.View>
      </View>
    </Modal>
  );
}
