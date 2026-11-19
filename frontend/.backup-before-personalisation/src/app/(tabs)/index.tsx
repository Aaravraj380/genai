/**
 * Today dashboard — daily habit list, orbit progress ring, streak highlights.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BrandMark, TabHeader } from '@/components/chrome';
import { Button, Card, AppText } from '@/components/primitives';
import { CreedCard, DateStrip, HabitCard, OrbitCard, SectionHeader, StreakHighlights } from '@/components/today';
import { parseDateKey, weekdayShort, monthLabel } from '@/domain/dates';
import { dayProgress, logFor, momentumStreak } from '@/domain/stats';
import { currentStreak, isScheduledOn } from '@/domain/streaks';
import { STARTER_KEYS, TEMPLATES } from '@/domain/templates';
import type { Habit } from '@/domain/types';
import { useTodayKey } from '@/hooks/useTodayContext';
import { syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import type { IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

type Slot = { id: string; title: string; icon: IconName; color?: string };
const SLOTS: Slot[] = [
  { id: 'morning', title: 'Morning Routines', icon: 'wb-twilight' },
  { id: 'focus', title: 'Focus & Body', icon: 'open-in-full', color: '#4EDEA3' },
  { id: 'evening', title: 'Evening Wind-Down', icon: 'nights-stay', color: '#ADC6FF' },
  { id: 'anytime', title: 'Anytime', icon: 'all-inclusive', color: '#9CA3AF' },
];

/** Section by reminder time, like the Stitch mock (morning / focus & body / evening). */
function slotOf(h: Habit): Slot['id'] {
  if (!h.reminder?.enabled) return 'anytime';
  if (h.reminder.hour < 12) return 'morning';
  if (h.reminder.hour < 18) return 'focus';
  return 'evening';
}

export default function TodayScreen() {
  const t = useTheme();
  const { gutter, maxContentWidth } = useLayout();
  const today = useTodayKey();
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const tapHabit = useHabitStore((s) => s.tapHabit);
  const [selected, setSelected] = useState(today);

  // Midnight rollover: if the user was looking at "today", follow it to the new day.
  // (State adjusted during render — React's recommended alternative to an effect.)
  const [prevToday, setPrevToday] = useState(today);
  if (today !== prevToday) {
    setPrevToday(today);
    if (selected === prevToday) setSelected(today);
  }

  const scheduled = useMemo(() => habits.filter((h) => isScheduledOn(h, selected)), [habits, selected]);
  const progress = useMemo(() => dayProgress(habits, logs, selected, today), [habits, logs, selected, today]);
  const momentum = useMemo(() => momentumStreak(habits, logs, today), [habits, logs, today]);
  const streaks = useMemo(
    () => new Map(habits.map((h) => [h.id, currentStreak(h, logFor(logs, h.id), today)])),
    [habits, logs, today],
  );
  const highlights = useMemo(
    () =>
      habits
        .map((h) => ({ habit: h, streak: streaks.get(h.id) ?? 0 }))
        .filter((x) => x.streak > 0)
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 8),
    [habits, streaks],
  );

  const progressFor = (key: string) => {
    const p = dayProgress(habits, logs, key, today);
    return p.total ? p.ratio : null;
  };

  const title =
    selected === today
      ? "Today's Orbit"
      : `${weekdayShort(selected)}, ${monthLabel(selected)} ${parseDateKey(selected).day}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title="Today" streak={momentum} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: 32,
          gap: 24,
          width: '100%',
          maxWidth: maxContentWidth,
          alignSelf: 'center',
        }}>
        {habits.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <DateStrip today={today} selected={selected} onSelect={setSelected} progressFor={progressFor} />
            <OrbitCard done={progress.done} total={progress.total} momentum={momentum} title={title} />
            {selected === today ? <StreakHighlights items={highlights} /> : null}

            {SLOTS.map((slot) => {
              const list = scheduled.filter((h) => slotOf(h) === slot.id);
              if (list.length === 0) return null;
              const doneCount = list.filter(
                (h) => (logFor(logs, h.id).completions[selected] ?? 0) >= h.targetPerDay,
              ).length;
              return (
                <View key={slot.id} style={{ gap: 10 }}>
                  <SectionHeader icon={slot.icon} iconColor={slot.color} title={slot.title} count={`${doneCount} / ${list.length}`} />
                  {list.map((h) => (
                    <HabitCard
                      key={h.id}
                      habit={h}
                      count={logFor(logs, h.id).completions[selected] ?? 0}
                      streak={streaks.get(h.id) ?? 0}
                      onToggle={() => tapHabit(h.id, selected, today)}
                    />
                  ))}
                </View>
              );
            })}

            {scheduled.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 28 }}>
                <AppText variant="headlineSm">Rest day</AppText>
                <AppText variant="bodySm" color={t.palette.textSecondary} align="center">
                  Nothing is scheduled for this day. Rest days never break a streak.
                </AppText>
              </Card>
            ) : null}

            <CreedCard today={today} />
            <Button
              label="New Habit"
              icon="add"
              onPress={() => router.push('/habit/new')}
              style={{ alignSelf: 'center', paddingHorizontal: 36 }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState() {
  const t = useTheme();
  const today = useTodayKey();
  const addFromTemplate = useHabitStore((s) => s.addFromTemplate);
  const loadDemo = useHabitStore((s) => s.loadDemoData);
  return (
    <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 36, marginTop: 24 }}>
      <BrandMark size={64} />
      <AppText variant="headlineMd" align="center">
        Build your first streak
      </AppText>
      <AppText variant="bodyMd" color={t.palette.textSecondary} align="center" style={{ maxWidth: 320 }}>
        Create a habit, check it off each day, and watch the chain grow. Everything stays on your device.
      </AppText>
      <Button label="Create a habit" icon="add" onPress={() => router.push('/habit/new')} style={{ alignSelf: 'stretch' }} />
      <Button
        label="Add the 6-ritual starter pack"
        tone="ghost"
        icon="bolt"
        style={{ alignSelf: 'stretch' }}
        onPress={() => {
          for (const k of STARTER_KEYS) {
            const h = addFromTemplate(TEMPLATES.find((x) => x.key === k)!, today);
            syncHabitReminder(h, today);
          }
        }}
      />
      <Button label="Explore with sample data" tone="ghost" size="sm" onPress={() => loadDemo(today)} />
    </Card>
  );
}
