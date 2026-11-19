/**
 * Habit Detail — streak telemetry, month calendar, freezes and safeguards.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RollingNumber } from '@/components/animated';
import { GlowBackdrop, StackHeader } from '@/components/chrome';
import { useConfirm } from '@/components/ConfirmDialog';
import { MonthCalendar } from '@/components/MonthCalendar';
import { AppText, Button, Card, Icon, IconButton, Pill, PressableScale } from '@/components/primitives';
import { formatTime } from '@/components/today';
import { describeFrequency } from '@/domain/format';
import { canFreeze, freezesAvailable, REPAIR_WINDOW_DAYS } from '@/domain/freezes';
import { EMPTY_LOG } from '@/domain/stats';
import { habitSummary, isCurrentlyPaused } from '@/domain/streaks';
import type { DateKey, DayStatus } from '@/domain/types';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT, type I18n, type StringKey } from '@/i18n';
import { haptic } from '@/services/haptics';
import { cancelHabitReminder, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { habitIconGlyph } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

export default function HabitDetailScreen() {
  const t = useTheme();
  const i18n = useT();
  const { t: tr, dates, category, freqLabels } = i18n;
  const allowance = useSettingsStore((s) => s.freezesPerMonth);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const insets = useSafeAreaInsets();
  const { gutter, maxContentWidth, contentWidth, isCompact } = useLayout();
  const today = useTodayKey();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const log = useHabitStore((s) => s.logs[id ?? ''] ?? EMPTY_LOG);
  const store = useHabitStore.getState;
  const [month, setMonth] = useState<DateKey>(today);
  const [dayAction, setDayAction] = useState<{ key: DateKey; status: DayStatus } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFreezeInfo, setShowFreezeInfo] = useState(false);
  const [dialog, confirm] = useConfirm();

  const summary = useMemo(() => (habit ? habitSummary(habit, log, today) : null), [habit, log, today]);

  if (!habit || !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
        <StackHeader title={tr('detail.title')} />
        <View style={{ padding: 24, gap: 12 }}>
          <AppText variant="headlineSm">{tr('detail.notFound')}</AppText>
          <Button label={tr('detail.backToToday')} onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  const paused = isCurrentlyPaused(habit, today);
  const todayCount = log.completions[today] ?? 0;
  const doneToday = todayCount >= habit.targetPerDay;
  const freezes = freezesAvailable(log, today, allowance);
  const freqText = describeFrequency(habit.frequency, freqLabels, weekStartsOn);
  const isPB = summary.current > 0 && summary.current === summary.longest;
  const toBeat = summary.longest - summary.current + 1;

  const logToday = () => {
    const next = store().tapHabit(habit.id, today, today);
    if (next >= habit.targetPerDay) haptic.success();
    else haptic.tap();
  };

  const togglePause = () => {
    if (paused) {
      store().resumeHabit(habit.id, today);
      syncHabitReminder({ ...habit, pauses: habit.pauses.map((p) => (p.end ? p : { ...p, end: today })) }, today);
    } else {
      store().pauseHabit(habit.id, today);
      cancelHabitReminder(habit.id);
    }
    haptic.light();
  };

  const statCardW = isCompact ? contentWidth : (contentWidth - 12) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title={tr('detail.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 32, gap: 16, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: `${habit.color}26` }}>
            <Icon name={habitIconGlyph[habit.icon]} size={24} color={habit.color} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="labelSm" color={t.palette.textSecondary} uppercase>
              {tr('detail.telemetry')}
              {paused ? tr('detail.pausedSuffix') : ''}
            </AppText>
            <AppText variant="headlineMd" numberOfLines={2}>
              {habit.title}
            </AppText>
          </View>
          <IconButton icon="edit" label={tr('detail.edit')} onPress={() => router.push(`/habit/${habit.id}/edit`)} />
          <IconButton icon="more-vert" label={tr('detail.more')} onPress={() => setMenuOpen(true)} />
        </View>

        {/* Streak cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ width: statCardW, borderRadius: t.radii.lg, overflow: 'hidden', backgroundColor: t.palette.surfaceElevated, borderWidth: 1, borderColor: t.palette.ghostBorder, padding: 16, gap: 8 }}>
            <GlowBackdrop from="rgba(0,0,0,0)" to="rgba(0,0,0,0)" radial="rgba(249,115,22,0.20)" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="labelMd" color={t.palette.textSecondary} uppercase numberOfLines={1} style={{ flexShrink: 1 }}>
                {tr('detail.current')}
              </AppText>
              <Icon name="local-fire-department" size={22} color={t.palette.streakFire} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <RollingNumber value={summary.current} variant="displayHero" />
              <AppText variant="bodyMd" color={t.palette.textSecondary} style={{ marginBottom: 6 }}>
                {tr('common.days')}
              </AppText>
            </View>
            <Pill tone={isPB ? 'emerald' : 'flame'}>
              <Icon name={isPB ? 'emoji-events' : 'bolt'} size={13} color={isPB ? t.palette.primary : t.palette.streakFire} />
              <AppText variant="labelSm" color={isPB ? t.palette.primary : t.palette.streakFire}>
                {isPB ? tr('detail.pb') : summary.longest > 0 ? tr('detail.toBeat', { n: toBeat }) : tr('detail.logToStart')}
              </AppText>
            </Pill>
          </View>

          <View style={{ width: statCardW, borderRadius: t.radii.lg, overflow: 'hidden', backgroundColor: t.palette.surfaceElevated, borderWidth: 1, borderColor: t.palette.ghostBorder, padding: 16, gap: 8 }}>
            <GlowBackdrop from="rgba(0,0,0,0)" to="rgba(0,0,0,0)" radial="rgba(255,182,144,0.14)" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="labelMd" color={t.palette.textSecondary} uppercase numberOfLines={1} style={{ flexShrink: 1 }}>
                {tr('detail.longest')}
              </AppText>
              <Icon name="military-tech" size={22} color={t.palette.secondary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <RollingNumber value={summary.longest} variant="displayHero" />
              <AppText variant="bodyMd" color={t.palette.textSecondary} style={{ marginBottom: 6 }}>
                {tr('common.days')}
              </AppText>
            </View>
            <Pill tone="neutral">
              <Icon name="event" size={13} color={t.palette.textSecondary} />
              <AppText variant="labelSm" color={t.palette.textSecondary}>
                {summary.bestRun ? tr('detail.best', { month: dates.monthYearShort(summary.bestRun.end) }) : tr('detail.noStreak')}
              </AppText>
            </Pill>
          </View>
        </View>

        {/* Totals */}
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MiniStat icon="check-circle" value={String(summary.total)} label={tr('detail.totalSessions')} />
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: t.palette.borderSubtle, marginHorizontal: 12 }} />
          <MiniStat icon="trending-up" value={summary.rate === null ? '—' : `${Math.round(summary.rate * 100)}%`} label={tr('detail.consistency')} />
        </Card>

        {/* Calendar */}
        <Card style={{ padding: 16 }}>
          <MonthCalendar
            habit={habit}
            log={log}
            today={today}
            month={month}
            onMonthChange={setMonth}
            width={contentWidth - 34}
            onDayPress={(key, status) => setDayAction({ key, status })}
          />
        </Card>

        {/* Configuration & safeguards */}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="labelLg" color={t.palette.textSecondary} uppercase>
              {tr('detail.config')}
            </AppText>
            <Icon name="tune" size={20} color={t.palette.textSecondary} />
          </View>
          <ConfigRow
            icon="alarm"
            iconColor={t.palette.primary}
            title={
              habit.reminder?.enabled
                ? tr('detail.freqAt', { freq: freqText, time: formatTime(habit.reminder.hour, habit.reminder.minute) })
                : freqText
            }
            subtitle={
              habit.reminder?.enabled
                ? habit.reminder.message || (paused ? tr('detail.reminderPaused') : tr('detail.reminderActive'))
                : tr('detail.noReminder')
            }
            onPress={() => router.push(`/habit/${habit.id}/edit`)}
          />
          <ConfigRow
            icon="spa"
            iconColor={t.palette.secondary}
            title={`#${category(habit.category)}${habit.targetPerDay > 1 ? ` · ${tr('detail.perDay', { n: habit.targetPerDay })}` : ''}`}
            subtitle={habit.note ?? tr('detail.tapToEdit')}
            onPress={() => router.push(`/habit/${habit.id}/edit`)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radii.md, backgroundColor: t.palette.surfaceContainer }}>
            <View style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(113,161,255,0.35)' }}>
              <Icon name="ac-unit" size={24} color={t.palette.tertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText variant="labelLg">
                  {tr('detail.freezesAvailable', { n: freezes })}
                </AppText>
                <Icon name="shield" size={16} color={t.palette.tertiary} />
              </View>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {tr('detail.protects')}
              </AppText>
            </View>
            <PressableScale onPress={() => setShowFreezeInfo((v) => !v)} accessibilityRole="button" style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: t.palette.surfaceBase }}>
              <AppText variant="labelMd">{showFreezeInfo ? tr('common.close') : tr('common.manage')}</AppText>
            </PressableScale>
          </View>
          {showFreezeInfo ? (
            <AppText variant="bodySm" color={t.palette.textSecondary}>
              {tr('detail.freezeInfo', { n: allowance, days: REPAIR_WINDOW_DAYS })}
            </AppText>
          ) : null}
        </Card>

        <Button
          size="lg"
          icon={doneToday ? 'check-circle' : 'add-task'}
          disabled={paused}
          label={
            paused
              ? tr('detail.paused')
              : habit.targetPerDay > 1
                ? doneToday
                  ? tr('detail.doneMulti', { count: todayCount, target: habit.targetPerDay })
                  : tr('detail.logMulti', { count: todayCount, target: habit.targetPerDay })
                : doneToday
                  ? tr('detail.loggedUndo')
                  : tr('detail.logToday')
          }
          onPress={logToday}
        />
        <Button tone="ghost" icon={paused ? 'play-circle-outline' : 'pause-circle-outline'} label={paused ? tr('detail.resume') : tr('detail.pause')} onPress={togglePause} />
      </ScrollView>

      {/* Day actions */}
      {dayAction ? (
        <Sheet onClose={() => setDayAction(null)}>
          <AppText variant="headlineSm">
            {dates.dayLabel(dayAction.key)}
          </AppText>
          <AppText variant="bodySm" color={t.palette.textSecondary}>
            {describeStatus(dayAction.status, i18n)}
          </AppText>
          {dayAction.status === 'completed' ? (
            <Button
              tone="ghost"
              icon="undo"
              label={tr('detail.clearDay')}
              onPress={() => {
                store().setCount(habit.id, dayAction.key, 0, today);
                setDayAction(null);
              }}
            />
          ) : (
            <Button
              icon="check"
              label={dayAction.key === today ? tr('detail.markToday') : tr('detail.markBackfill')}
              onPress={() => {
                store().setCount(habit.id, dayAction.key, habit.targetPerDay, today);
                haptic.success();
                setDayAction(null);
              }}
            />
          )}
          {dayAction.status === 'frozen' ? (
            <Button
              tone="ghost"
              icon="ac-unit"
              label={tr('detail.removeFreeze')}
              onPress={() => {
                store().unfreezeDay(habit.id, dayAction.key);
                setDayAction(null);
              }}
            />
          ) : null}
          {dayAction.status === 'missed' ? (
            (() => {
              const check = canFreeze(habit, log, dayAction.key, today, allowance);
              return (
                <Button
                  tone="ghost"
                  icon="ac-unit"
                  disabled={!check.ok}
                  label={
                    check.ok
                      ? tr('detail.useFreeze')
                      : check.reason === 'too-old'
                        ? tr('detail.freezeTooOld', { days: REPAIR_WINDOW_DAYS })
                        : tr('detail.noFreezes')
                  }
                  onPress={() => {
                    if (store().freezeDay(habit.id, dayAction.key, today, allowance)) haptic.success();
                    setDayAction(null);
                  }}
                />
              );
            })()
          ) : null}
        </Sheet>
      ) : null}

      {/* Overflow menu */}
      {menuOpen ? (
        <Sheet onClose={() => setMenuOpen(false)}>
          <Button tone="ghost" icon="edit" label={tr('detail.edit')} onPress={() => { setMenuOpen(false); router.push(`/habit/${habit.id}/edit`); }} />
          <Button tone="ghost" icon={paused ? 'play-circle-outline' : 'pause-circle-outline'} label={paused ? tr('detail.resume') : tr('detail.pause')} onPress={() => { setMenuOpen(false); togglePause(); }} />
          <Button
            tone="flame"
            icon="delete-outline"
            label={tr('form.delete')}
            onPress={async () => {
              setMenuOpen(false);
              const ok = await confirm({
                title: tr('detail.deleteTitle', { title: habit.title }),
                message: tr('detail.deleteBody'),
                confirmLabel: tr('common.delete'),
                destructive: true,
              });
              if (!ok) return;
              await cancelHabitReminder(habit.id);
              router.back();
              setTimeout(() => store().deleteHabit(habit.id), 0);
            }}
          />
        </Sheet>
      ) : null}
      {dialog}
    </View>
  );
}

const STATUS_TEXT: Record<DayStatus, StringKey> = {
  completed: 'status.completed',
  frozen: 'status.frozen',
  missed: 'status.missed',
  pending: 'status.pending',
  rest: 'status.rest',
  paused: 'status.paused',
  future: 'status.future',
  'before-start': 'status.beforeStart',
};

function describeStatus(s: DayStatus, i18n: I18n): string {
  return i18n.t(STATUS_TEXT[s]);
}

function MiniStat({ icon, value, label }: { icon: 'check-circle' | 'trending-up'; value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainerHigh }}>
        <Icon name={icon} size={22} color={t.palette.primary} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <AppText variant="headlineMd" tabular>
          {value}
        </AppText>
        <AppText variant="labelSm" color={t.palette.textSecondary} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function ConfigRow({ icon, iconColor, title, subtitle, onPress }: { icon: 'alarm' | 'spa'; iconColor: string; title: string; subtitle: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radii.md, backgroundColor: t.palette.surfaceContainer }}>
      <View style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceBase }}>
        <Icon name={icon} size={24} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="labelLg" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="bodySm" color={t.palette.textSecondary} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <Icon name="chevron-right" size={22} color={t.palette.textMuted} />
    </PressableScale>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel={tr('common.close')} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(5,6,8,0.65)', justifyContent: 'flex-end' }}>
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: t.palette.surfaceElevated,
              borderTopLeftRadius: t.radii.xl,
              borderTopRightRadius: t.radii.xl,
              borderWidth: 1,
              borderColor: t.palette.borderSubtle,
              padding: 20,
              paddingBottom: insets.bottom + 20,
              gap: 12,
            }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.palette.borderSubtle }} />
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
