/**
 * Today dashboard — daily habit list, orbit progress ring, streak highlights.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BrandMark, TabHeader } from '@/components/chrome';
import { Button, Card, AppText } from '@/components/primitives';
import { CreedCard, DateStrip, HabitCard, OrbitCard, SectionHeader, StreakHighlights } from '@/components/today';
import { dayProgress, logFor, momentumStreak } from '@/domain/stats';
import { currentStreak, isScheduledOn } from '@/domain/streaks';
import { STARTER_KEYS, TEMPLATES } from '@/domain/templates';
import type { Habit } from '@/domain/types';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT, type StringKey } from '@/i18n';
import { syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import type { IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

type Slot = { id: string; title: StringKey; icon: IconName; tone?: 'primary' | 'tertiary' | 'textSecondary' };
const SLOTS: Slot[] = [
  { id: 'morning', title: 'today.slot.morning', icon: 'wb-twilight' },
  { id: 'focus', title: 'today.slot.focus', icon: 'open-in-full', tone: 'primary' },
  { id: 'evening', title: 'today.slot.evening', icon: 'nights-stay', tone: 'tertiary' },
  { id: 'anytime', title: 'today.slot.anytime', icon: 'all-inclusive', tone: 'textSecondary' },
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
  const { t: tr, dates } = useT();
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

  const title = selected === today ? tr('today.orbit') : dates.dayLabel(selected);

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title={tr('tab.today')} streak={momentum} />
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
                  <SectionHeader
                    icon={slot.icon}
                    iconColor={slot.tone ? t.palette[slot.tone] : undefined}
                    title={tr(slot.title)}
                    count={`${doneCount} / ${list.length}`}
                  />
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
                <AppText variant="headlineSm">{tr('today.restDay')}</AppText>
                <AppText variant="bodySm" color={t.palette.textSecondary} align="center">
                  {tr('today.restDayBody')}
                </AppText>
              </Card>
            ) : null}

            <CreedCard today={today} />
            <Button
              label={tr('today.newHabit')}
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
  const i18n = useT();
  const { t: tr } = i18n;
  const today = useTodayKey();
  const addFromTemplate = useHabitStore((s) => s.addFromTemplate);
  const loadDemo = useHabitStore((s) => s.loadDemoData);
  return (
    <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 36, marginTop: 24 }}>
      <BrandMark size={64} />
      <AppText variant="headlineMd" align="center">
        {tr('today.emptyTitle')}
      </AppText>
      <AppText variant="bodyMd" color={t.palette.textSecondary} align="center" style={{ maxWidth: 320 }}>
        {tr('today.emptyBody')}
      </AppText>
      <Button label={tr('today.createHabit')} icon="add" onPress={() => router.push('/habit/new')} style={{ alignSelf: 'stretch' }} />
      <Button
        label={tr('today.starterPack')}
        tone="ghost"
        icon="bolt"
        style={{ alignSelf: 'stretch' }}
        onPress={() => {
          for (const k of STARTER_KEYS) {
            const h = addFromTemplate(i18n.template(TEMPLATES.find((x) => x.key === k)!), today);
            syncHabitReminder(h, today);
          }
        }}
      />
      <Button label={tr('today.sampleData')} tone="ghost" size="sm" onPress={() => loadDemo(today, i18n.template)} />
    </Card>
  );
}
