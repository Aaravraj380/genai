/**
 * Explore — manage your habits, add from the template library, and control
 * local data (export, sample data, reset).
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useConfirm } from '@/components/ConfirmDialog';
import { TabHeader } from '@/components/chrome';
import { AppText, Button, Card, Icon, Pill, PressableScale } from '@/components/primitives';
import { SectionHeader } from '@/components/today';
import { describeFrequency } from '@/domain/format';
import { momentumStreak } from '@/domain/stats';
import { isCurrentlyPaused } from '@/domain/streaks';
import { TEMPLATES } from '@/domain/templates';
import { useTodayKey } from '@/hooks/useTodayContext';
import { haptic } from '@/services/haptics';
import { cancelAllReminders, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { habitIconGlyph } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

export default function ExploreScreen() {
  const t = useTheme();
  const { gutter, maxContentWidth } = useLayout();
  const today = useTodayKey();
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const addFromTemplate = useHabitStore((s) => s.addFromTemplate);
  const [dialog, confirm] = useConfirm();
  const [toast, setToast] = useState<string | null>(null);

  const momentum = useMemo(() => momentumStreak(habits, logs, today), [habits, logs, today]);
  const available = TEMPLATES.filter((tpl) => !habits.some((h) => h.title === tpl.title));

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const exportData = async () => {
    const { habits: hs, logs: ls } = useHabitStore.getState();
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, habits: hs, logs: ls }, null, 2);
    if (Platform.OS === 'web') {
      await navigator.clipboard?.writeText(json).catch(() => undefined);
      flash('Backup copied to clipboard');
      return;
    }
    await Share.share({ message: json, title: 'Habit backup' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title="Explore" streak={momentum} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32, gap: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        {/* ---- Your habits ---- */}
        <View style={{ gap: 10 }}>
          <SectionHeader icon="checklist" iconColor={t.palette.primary} title="Your Habits" count={String(habits.length)} />
          {habits.length === 0 ? (
            <AppText variant="bodySm" color={t.palette.textSecondary}>
              No habits yet — pick one from the library below or create your own.
            </AppText>
          ) : (
            habits.map((h) => {
              const paused = isCurrentlyPaused(h, today);
              return (
                <PressableScale key={h.id} accessibilityRole="button" onPress={() => router.push(`/habit/${h.id}`)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: paused ? 0.7 : 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${h.color}22` }}>
                      <Icon name={habitIconGlyph[h.icon]} size={20} color={h.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="labelLg" numberOfLines={1}>
                        {h.title}
                      </AppText>
                      <AppText variant="bodySm" color={t.palette.textSecondary}>
                        {describeFrequency(h.frequency)}
                        {h.targetPerDay > 1 ? ` · ${h.targetPerDay}× per day` : ''}
                      </AppText>
                    </View>
                    {paused ? (
                      <Pill tone="neutral">
                        <Icon name="pause" size={12} color={t.palette.textSecondary} />
                        <AppText variant="labelSm" color={t.palette.textSecondary}>
                          Paused
                        </AppText>
                      </Pill>
                    ) : null}
                    <Icon name="chevron-right" size={22} color={t.palette.textMuted} />
                  </Card>
                </PressableScale>
              );
            })
          )}
          <Button label="Create custom habit" icon="add" tone="ghost" onPress={() => router.push('/habit/new')} />
        </View>

        {/* ---- Library ---- */}
        {available.length > 0 ? (
          <View style={{ gap: 10 }}>
            <SectionHeader icon="auto-awesome" iconColor={t.palette.tertiary} title="Habit Library" />
            {available.map((tpl) => (
              <Card key={tpl.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainer }}>
                  <Icon name={habitIconGlyph[tpl.icon]} size={20} color={tpl.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="labelLg" numberOfLines={1}>
                    {tpl.title}
                  </AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    #{tpl.category} · {describeFrequency(tpl.frequency)}
                  </AppText>
                </View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${tpl.title}`}
                  scaleTo={0.9}
                  onPress={() => {
                    const h = addFromTemplate(tpl, today);
                    syncHabitReminder(h, today);
                    haptic.success();
                    flash(`Added “${tpl.title}”`);
                  }}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(78,222,163,0.14)' }}>
                  <Icon name="add" size={22} color={t.palette.primary} />
                </PressableScale>
              </Card>
            ))}
          </View>
        ) : null}

        {/* ---- Data ---- */}
        <View style={{ gap: 10 }}>
          <SectionHeader icon="shield" iconColor={t.palette.textSecondary} title="Your Data" />
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="cloud-off" size={20} color={t.palette.textSecondary} />
              <AppText variant="bodySm" color={t.palette.textSecondary} style={{ flex: 1 }}>
                Offline-first: everything is stored on this device and works without a connection. Export a backup any time.
              </AppText>
            </View>
            <Button label="Export backup (JSON)" icon="file-download" tone="ghost" size="sm" onPress={exportData} />
            <Button
              label="Load sample data"
              icon="auto-awesome"
              tone="ghost"
              size="sm"
              onPress={async () => {
                const ok =
                  habits.length === 0 ||
                  (await confirm({
                    title: 'Replace with sample data?',
                    message: 'This replaces your current habits and history with 60 days of demo data.',
                    confirmLabel: 'Replace',
                    destructive: true,
                  }));
                if (ok) {
                  await cancelAllReminders();
                  useHabitStore.getState().loadDemoData(today);
                  flash('Sample data loaded');
                }
              }}
            />
            <Button
              label="Reset all data"
              icon="restart-alt"
              tone="ghost"
              size="sm"
              onPress={async () => {
                if (
                  await confirm({
                    title: 'Reset everything?',
                    message: 'All habits, streaks and history on this device will be permanently deleted.',
                    confirmLabel: 'Delete all',
                    destructive: true,
                  })
                ) {
                  await cancelAllReminders();
                  useHabitStore.getState().resetAll();
                  useHabitStore.getState().markActive(today);
                  flash('All data cleared');
                }
              }}
            />
          </Card>
        </View>
      </ScrollView>

      {toast ? (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 20,
            alignSelf: 'center',
            backgroundColor: t.palette.surfaceContainerHigh,
            borderColor: t.palette.borderSubtle,
            borderWidth: 1,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
          }}>
          <AppText variant="labelLg">{toast}</AppText>
        </Animated.View>
      ) : null}
      {dialog}
    </View>
  );
}
