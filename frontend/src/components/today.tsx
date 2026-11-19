/**
 * Components specific to the Today dashboard.
 */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { addDays, eachDay, parseDateKey } from '@/domain/dates';
import type { DateKey, Habit } from '@/domain/types';
import { useT, type StringKey } from '@/i18n';
import { haptic } from '@/services/haptics';
import { habitIconGlyph, tintForCategory, type IconName } from '@/theme/icons';
import { useTheme } from '@/theme/ThemeProvider';

import { CheckTarget, ProgressRing, RollingNumber, StreakBadge } from './animated';
import { GlowBackdrop } from './chrome';
import { AppText, Card, Icon, Pill, PressableScale, TagChip } from './primitives';

/* ------------------------------------------------------------------ */
/* Date strip                                                          */
/* ------------------------------------------------------------------ */

const CHIP_W = 58;
const CHIP_GAP = 8;

export function DateStrip({
  today,
  selected,
  onSelect,
  progressFor,
}: {
  today: DateKey;
  selected: DateKey;
  onSelect: (key: DateKey) => void;
  /** 0–1 completion for a past/present day, or null when nothing was scheduled. */
  progressFor: (key: DateKey) => number | null;
}) {
  const t = useTheme();
  const { t: tr, dates } = useT();
  const scroller = useRef<ScrollViewInstance>(null);
  const days = eachDay(addDays(today, -20), addDays(today, 3));

  // Keep today in view on mount and after a midnight rollover.
  useEffect(() => {
    const idx = days.indexOf(today);
    const id = setTimeout(
      () => scroller.current?.scrollTo({ x: Math.max(0, (idx - 2) * (CHIP_W + CHIP_GAP)), animated: false }),
      0,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  return (
    <View>
      <View style={styles.rowBetween}>
        <AppText variant="labelLg" color={t.palette.textSecondary} uppercase>
          {dates.monthYear(selected)}
        </AppText>
        <PressableScale
          accessibilityRole="link"
          onPress={() => router.navigate('/analytics')}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <AppText variant="labelSm" color={t.palette.primary} uppercase>
            {tr('today.weeklyOverview')}
          </AppText>
          <Icon name="chevron-right" size={16} color={t.palette.primary} />
        </PressableScale>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: CHIP_GAP, paddingVertical: 10, paddingHorizontal: 2 }}>
        {days.map((key) => {
          const isSel = key === selected;
          const isToday = key === today;
          const future = key > today;
          const p = future ? null : progressFor(key);
          const dotColor =
            p === null ? 'transparent' : p >= 1 ? t.palette.primary : p > 0 ? t.palette.streakFire : t.palette.surfaceContainerHighest;
          return (
            <PressableScale
              key={key}
              disabled={future}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel, disabled: future }}
              accessibilityLabel={`${dates.weekdayShort(key)} ${parseDateKey(key).day}${isToday ? tr('today.a11y.today') : ''}`}
              onPress={() => {
                haptic.tap();
                onSelect(key);
              }}
              style={[
                styles.dayChip,
                {
                  width: CHIP_W,
                  borderRadius: t.radii.md,
                  backgroundColor: isSel ? t.palette.primary : t.palette.surfaceElevated,
                  borderColor: isSel ? t.palette.primary : isToday ? 'rgba(78,222,163,0.45)' : t.palette.ghostBorder,
                  opacity: future ? 0.55 : 1,
                  boxShadow: isSel ? '0px 0px 18px rgba(78,222,163,0.35)' : undefined,
                },
              ]}>
              <AppText variant="labelSm" color={isSel ? t.palette.onPrimary : t.palette.textSecondary} uppercase={isSel}>
                {dates.weekdayShort(key)}
              </AppText>
              <AppText variant="headlineSm" color={isSel ? t.palette.onPrimary : t.palette.onSurface} tabular>
                {parseDateKey(key).day}
              </AppText>
              {isSel && isToday ? (
                <Icon name="bolt" size={14} color={t.palette.onPrimary} />
              ) : (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSel ? t.palette.onPrimary : dotColor, marginVertical: 4 }} />
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Orbit summary card                                                  */
/* ------------------------------------------------------------------ */

export function OrbitCard({
  done,
  total,
  momentum,
  title,
}: {
  done: number;
  total: number;
  momentum: number;
  title: string;
}) {
  const t = useTheme();
  const { t: tr } = useT();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View
      style={{
        borderRadius: t.radii.lg,
        overflow: 'hidden',
        backgroundColor: t.palette.surfaceContainer,
        borderWidth: 1,
        borderColor: t.palette.ghostBorder,
        padding: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
      <GlowBackdrop />
      <View style={{ flex: 1, gap: 6 }}>
        <Pill tone={momentum > 0 ? 'flame' : 'neutral'}>
          <Icon name="local-fire-department" size={13} color={momentum > 0 ? t.palette.streakFire : t.palette.textMuted} />
          <AppText variant="labelSm" color={momentum > 0 ? t.palette.streakFire : t.palette.textSecondary}>
            {momentum > 0 ? tr('today.onFire', { n: momentum }) : tr('today.startChain')}
          </AppText>
        </Pill>
        <AppText variant="headlineMd" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </AppText>
        <AppText variant="bodySm" color={t.palette.textSecondary}>
          {total === 0 ? tr('today.restNothing') : tr('today.unlocked', { done, total })}
        </AppText>
      </View>
      <ProgressRing progress={total ? done / total : 0} size={92} stroke={8}>
        <RollingNumber value={pct} suffix="%" variant="headlineSm" />
      </ProgressRing>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal streak highlights                                        */
/* ------------------------------------------------------------------ */

export function StreakHighlights({ items }: { items: { habit: Habit; streak: number }[] }) {
  const t = useTheme();
  const { t: tr } = useT();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader icon="whatshot" title={tr('today.highlights')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {items.map(({ habit, streak }) => (
          <PressableScale
            key={habit.id}
            accessibilityRole="button"
            accessibilityLabel={`${habit.title}, ${tr('today.a11y.streak', { n: streak })}`}
            onPress={() => router.push(`/habit/${habit.id}`)}
            style={{
              width: 132,
              padding: 12,
              gap: 8,
              borderRadius: t.radii.lg,
              backgroundColor: t.palette.surfaceElevated,
              borderWidth: 1,
              borderColor: 'rgba(249,115,22,0.22)',
            }}>
            <View style={[styles.iconTile, { backgroundColor: `${habit.color}22` }]}>
              <Icon name={habitIconGlyph[habit.icon]} size={18} color={habit.color} />
            </View>
            <AppText variant="labelLg" numberOfLines={1}>
              {habit.title}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="local-fire-department" size={16} color={t.palette.streakFire} />
              <RollingNumber value={streak} suffix={` ${tr('common.days')}`} variant="labelMd" color={t.palette.streakFire} />
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Section header                                                      */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  icon,
  title,
  count,
  iconColor,
}: {
  icon: IconName;
  title: string;
  count?: string;
  iconColor?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.rowBetween}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={iconColor ?? t.palette.streakFire} />
        <AppText variant="labelLg" color={t.palette.onSurface} uppercase accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {count ? (
        <AppText variant="labelMd" color={t.palette.textSecondary} tabular>
          {count}
        </AppText>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Habit card                                                          */
/* ------------------------------------------------------------------ */

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute < 10 ? '0' : ''}${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function HabitCard({
  habit,
  count,
  streak,
  onToggle,
  readOnly,
}: {
  habit: Habit;
  count: number;
  streak: number;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const t = useTheme();
  const { t: tr, category } = useT();
  const done = count >= habit.targetPerDay;
  const subtitle =
    habit.note ?? (habit.reminder?.enabled ? formatTime(habit.reminder.hour, habit.reminder.minute) : undefined);
  return (
    <Animated.View entering={FadeIn.duration(250)} layout={LinearTransition.springify().damping(18)}>
      <Card accent={done ? t.palette.primaryContainer : undefined} style={{ paddingVertical: 14, paddingLeft: done ? 13 : 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CheckTarget
            count={count}
            target={habit.targetPerDay}
            onPress={onToggle}
            disabled={readOnly}
            label={`${habit.title}${done ? tr('today.a11y.completed') : ''}`}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={tr('today.a11y.openDetails', { title: habit.title })}
            onPress={() => router.push(`/habit/${habit.id}`)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <AppText
                variant="headlineSm"
                numberOfLines={1}
                color={done ? t.palette.textMuted : t.palette.textPrimary}
                style={done ? { textDecorationLine: 'line-through' } : null}>
                {habit.title}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <TagChip label={category(habit.category)} tint={tintForCategory(habit.category)} />
                {subtitle ? (
                  <AppText variant="bodySm" color={t.palette.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
            </View>
            <StreakBadge days={streak} compact />
          </PressableScale>
        </View>
      </Card>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Quote card                                                          */
/* ------------------------------------------------------------------ */

const CREEDS: StringKey[] = ['today.creed1', 'today.creed2', 'today.creed3', 'today.creed4', 'today.creed5'];

export function CreedCard({ today }: { today: DateKey }) {
  const t = useTheme();
  const { t: tr } = useT();
  const quote = tr(CREEDS[parseDateKey(today).day % CREEDS.length]);
  return (
    <Card style={{ flexDirection: 'row', gap: 16, alignItems: 'center', padding: 20 }}>
      <View style={[styles.iconTile, { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(16,185,129,0.12)' }]}>
        <Icon name="psychology" size={24} color={t.palette.primary} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <AppText variant="bodyMd" color={t.palette.textSecondary} style={{ fontStyle: 'italic' }}>
          “{quote}”
        </AppText>
        <AppText variant="labelSm" color={t.palette.textMuted} uppercase>
          {tr('today.creedLabel')}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayChip: { alignItems: 'center', paddingVertical: 10, gap: 2, borderWidth: 1 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
