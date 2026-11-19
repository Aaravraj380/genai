/**
 * "Your Data" card — export a backup file, restore one (merge or replace),
 * load sample data, reset. Shared by Explore and Settings.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { databaseStats, DB_NAME, useStorageStatus } from '@/db';
import { parseDateKey, toDateKey } from '@/domain/dates';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT, type StringKey } from '@/i18n';
import { BackupError, buildBackup, exportBackupFile, parseBackup, pickBackupText } from '@/services/backup';
import { haptic } from '@/services/haptics';
import { cancelAllReminders, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { currentSettings, useSettingsStore } from '@/store/useSettingsStore';
import { useTheme } from '@/theme/ThemeProvider';

import { useConfirm } from './ConfirmDialog';
import { AppText, Button, Card, Icon } from './primitives';
import { SectionHeader } from './today';

export function DataSection({ onToast }: { onToast: (msg: string) => void }) {
  const t = useTheme();
  const i18n = useT();
  const { t: tr, dates } = i18n;
  const today = useTodayKey();
  const habitCount = useHabitStore((s) => s.habits.length);
  const logs = useHabitStore((s) => s.logs);
  const storage = useStorageStatus();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof databaseStats>> | null>(null);
  const [dialog, confirm, choose] = useConfirm();

  // Live row counts straight from SQLite (refreshed whenever the data changes).
  useEffect(() => {
    if (storage.state !== 'ready') return;
    let alive = true;
    databaseStats()
      .then((s) => alive && setStats(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [storage.state, habitCount, logs]);

  const resyncReminders = async () => {
    await cancelAllReminders();
    for (const h of useHabitStore.getState().habits) await syncHabitReminder(h, today);
  };

  const exportData = async () => {
    const { habits, logs } = useHabitStore.getState();
    try {
      await exportBackupFile(buildBackup(habits, logs, currentSettings()), tr('data.export'));
      onToast(tr('data.exported'));
    } catch {
      onToast(tr('data.err.read'));
    }
  };

  const importData = async () => {
    try {
      const text = await pickBackupText();
      if (text === null) return; // cancelled
      const data = parseBackup(text);
      const savedOn = data.exportedAt ? toDateKey(new Date(data.exportedAt)) : today;
      const choice =
        habitCount === 0
          ? 'confirm'
          : await choose({
              title: tr('data.importTitle'),
              message: tr('data.importBody', {
                habits: data.habits.length,
                date: `${parseDateKey(savedOn).day} ${dates.monthYearShort(savedOn)}`,
              }),
              altLabel: tr('data.merge'),
              confirmLabel: tr('data.replace'),
              destructive: true,
            });
      if (choice === 'cancel') return;
      useHabitStore.getState().importData({ habits: data.habits, logs: data.logs }, choice === 'alt' ? 'merge' : 'replace');
      if (data.settings) useSettingsStore.getState().applyImported(data.settings);
      // Imported history shouldn't trigger the "welcome back" sheet.
      useHabitStore.getState().markActive(today);
      await resyncReminders();
      haptic.success();
      onToast(tr('data.imported', { n: useHabitStore.getState().habits.length }));
    } catch (e) {
      const code = e instanceof BackupError ? e.code : 'read';
      haptic.warning();
      onToast(tr(`data.err.${code}` as StringKey));
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader icon="shield" iconColor={t.palette.textSecondary} title={tr('data.title')} />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="cloud-off" size={20} color={t.palette.textSecondary} />
          <AppText variant="bodySm" color={t.palette.textSecondary} style={{ flex: 1 }}>
            {tr('data.offline')}
          </AppText>
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
            padding: 10,
            borderRadius: t.radii.md,
            backgroundColor: t.palette.surfaceContainer,
          }}>
          <Icon
            name={storage.state === 'unavailable' ? 'error-outline' : 'storage'}
            size={20}
            color={storage.state === 'unavailable' ? t.palette.streakFire : t.palette.primary}
          />
          <View style={{ flex: 1, gap: 2 }}>
            {storage.state === 'unavailable' ? (
              <AppText variant="bodySm" color={t.palette.streakFire}>
                {tr('data.storageUnavailable')}
              </AppText>
            ) : (
              <>
                <AppText variant="labelLg">{tr('data.storage', { file: DB_NAME })}</AppText>
                {stats ? (
                  <AppText variant="bodySm" color={t.palette.textSecondary} tabular>
                    {tr('data.storageStats', { habits: stats.habits, checkins: stats.completions, freezes: stats.freezes })}
                  </AppText>
                ) : null}
              </>
            )}
          </View>
        </View>
        <Button label={tr('data.export')} icon="file-upload" tone="ghost" size="sm" onPress={exportData} />
        <Button label={tr('data.import')} icon="file-download" tone="ghost" size="sm" onPress={importData} />
        <Button
          label={tr('data.sample')}
          icon="auto-awesome"
          tone="ghost"
          size="sm"
          onPress={async () => {
            const ok =
              habitCount === 0 ||
              (await confirm({
                title: tr('data.sampleTitle'),
                message: tr('data.sampleBody'),
                confirmLabel: tr('data.replace'),
                destructive: true,
              }));
            if (ok) {
              await cancelAllReminders();
              useHabitStore.getState().loadDemoData(today, i18n.template);
              onToast(tr('data.sampleLoaded'));
            }
          }}
        />
        <Button
          label={tr('data.reset')}
          icon="restart-alt"
          tone="ghost"
          size="sm"
          onPress={async () => {
            if (
              await confirm({
                title: tr('data.resetTitle'),
                message: tr('data.resetBody'),
                confirmLabel: tr('data.deleteAll'),
                destructive: true,
              })
            ) {
              await cancelAllReminders();
              useHabitStore.getState().resetAll();
              useHabitStore.getState().markActive(today);
              onToast(tr('data.cleared'));
            }
          }}
        />
      </Card>
      {dialog}
    </View>
  );
}
