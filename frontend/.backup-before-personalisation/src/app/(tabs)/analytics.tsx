/**
 * Analytics — completion rates, weekly momentum, trend & streak-history charts,
 * milestones and per-habit streak telemetry.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SegmentedControl } from '@/components/animated';
import { MomentumBars, Sparkline, TrendLineChart } from '@/components/charts';
import { GlowBackdrop, TabHeader } from '@/components/chrome';
import { AppText, Button, Card, Icon, Pill, PressableScale } from '@/components/primitives';
import { diffDays, minKey, weekdayOf } from '@/domain/dates';
import {
  completionTrend,
  dayProgress,
  milestones,
  momentumSeries,
  momentumStreak,
  overallRate,
  perfectDays,
  periodRange,
  previousRange,
  repsInRange,
  telemetry,
  weekdayRates,
  type Period,
} from '@/domain/stats';
import { isCurrentlyPaused } from '@/domain/streaks';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useHabitStore } from '@/store/useHabitStore';
import { habitIconGlyph, type IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'all-time', label: 'All-Time' },
];
const PERIOD_NOUN: Record<Period, string> = { weekly: 'this week', monthly: 'this month', yearly: 'this year', 'all-time': 'all time' };
const PREV_NOUN: Record<Period, string> = { weekly: 'last wk', monthly: 'last mo', yearly: 'last yr', 'all-time': '' };
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

export default function AnalyticsScreen() {
  const t = useTheme();
  const { gutter, maxContentWidth, contentWidth, statColumns } = useLayout();
  const today = useTodayKey();
  const allHabits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const [period, setPeriod] = useState<Period>('weekly');

  const habits = allHabits;
  const stats = useMemo(() => {
    const range = periodRange(period, today, habits);
    const prev = previousRange(period, today, habits);
    const rate = overallRate(habits, logs, range, today);
    const prevRate = prev ? overallRate(habits, logs, prev, today) : null;
    const tele = telemetry(habits, logs, today);
    const active = tele.filter((x) => x.current > 0).length;
    const broken = tele.filter((x) => x.current === 0 && x.longest > 0 && !isCurrentlyPaused(x.habit, today)).length;
    const elapsed = Math.max(1, diffDays(range.from, minKey(range.to, today)) + 1);
    const trend = completionTrend(habits, logs, period, today);
    return {
      range,
      rate,
      delta: prevRate?.rate != null && rate.rate != null ? rate.rate - prevRate.rate : null,
      active,
      broken,
      perfect: perfectDays(habits, logs, range, today),
      elapsed,
      reps: repsInRange(habits, logs, range, today),
      weekday: weekdayRates(habits, logs, range, today),
      trend,
      history: momentumSeries(habits, logs, today, 30),
      tele,
      badges: milestones(habits, logs, today),
      momentum: momentumStreak(habits, logs, today),
      todayProgress: dayProgress(habits, logs, today, today),
    };
  }, [habits, logs, period, today]);

  const tileWidth = (contentWidth - (statColumns - 1) * 12) / statColumns;
  const chartWidth = contentWidth - 32;
  const best = bestWeekdays(stats.weekday);

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title="Analytics" streak={stats.momentum} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32, gap: 20, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />

        {habits.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
            <Icon name="insights" size={40} color={t.palette.textMuted} />
            <AppText variant="headlineSm">No data yet</AppText>
            <AppText variant="bodySm" color={t.palette.textSecondary} align="center">
              Add a habit and check it off — your trends will appear here.
            </AppText>
            <Button label="New Habit" icon="add" onPress={() => router.push('/habit/new')} />
          </Card>
        ) : (
          <>
            {/* ---- Stat tiles ---- */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <StatTile width={tileWidth} label="Completion" icon="trending-up" iconColor={t.palette.primary} value={pct(stats.rate.rate)}>
                {stats.delta !== null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name={stats.delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={stats.delta >= 0 ? t.palette.primary : t.palette.streakFire} />
                    <AppText variant="labelSm" color={stats.delta >= 0 ? t.palette.primary : t.palette.streakFire}>
                      {stats.delta >= 0 ? '+' : ''}
                      {Math.round(stats.delta * 100)}% vs {PREV_NOUN[period]}
                    </AppText>
                  </View>
                ) : null}
                <Sparkline values={stats.trend.map((p) => p.rate ?? 0)} width={tileWidth - 34} color={t.palette.primary} />
              </StatTile>

              <StatTile width={tileWidth} label="Active Streaks" icon="local-fire-department" iconColor={t.palette.streakFire} value={String(stats.active)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  Habits on fire
                </AppText>
                <Pill tone={stats.broken ? 'flame' : 'neutral'}>
                  <AppText variant="labelSm" color={stats.broken ? t.palette.streakFire : t.palette.textSecondary}>
                    {stats.broken} Broken
                  </AppText>
                </Pill>
              </StatTile>

              <StatTile width={tileWidth} label="Perfect Days" icon="verified" iconColor={t.palette.tertiary} value={String(stats.perfect)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  Days {PERIOD_NOUN[period]}
                </AppText>
                <ProgressBar value={stats.perfect / stats.elapsed} color={t.palette.tertiary} />
              </StatTile>

              <StatTile width={tileWidth} label="Total Reps" icon="check-circle" iconColor={t.palette.primary} value={String(stats.reps.reps)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  Logs completed
                </AppText>
                <AppText variant="labelSm" color={t.palette.textMuted}>
                  Target: {stats.reps.target}
                </AppText>
              </StatTile>
            </View>

            {/* ---- Weekly momentum ---- */}
            <Card style={{ gap: 16, padding: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="headlineSm" accessibilityRole="header">
                    Weekly Momentum
                  </AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    Completion by weekday, {PERIOD_NOUN[period]}
                  </AppText>
                </View>
                <Pill tone="emerald">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.palette.primary }} />
                  <AppText variant="labelSm" color={t.palette.primary}>
                    Active Track
                  </AppText>
                </Pill>
              </View>
              <MomentumBars rates={stats.weekday} todayIndex={(weekdayOf(today) + 6) % 7} />
              {best ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: t.radii.md, backgroundColor: t.palette.surfaceContainer }}>
                  <Icon name="bolt" size={20} color={t.palette.streakFire} />
                  <AppText variant="bodySm" color={t.palette.textSecondary} style={{ flex: 1 }}>
                    Your best completion rate happens on <AppText variant="bodySm" style={{ fontFamily: t.fonts.bodyBold }}>{best}</AppText>.
                  </AppText>
                </View>
              ) : null}
            </Card>

            {/* ---- Completion trend (chart-kit) ---- */}
            <Card style={{ gap: 8, padding: 16 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                Completion Trend
              </AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {period === 'weekly' || period === 'monthly' ? 'Daily' : 'Monthly'} completion rate · tap a point for details
              </AppText>
              <TrendLineChart
                labels={stats.trend.map((p) => p.label)}
                values={stats.trend.map((p) => (p.rate === null ? null : Math.round(p.rate * 100)))}
                width={chartWidth}
                color={t.palette.primary}
                maxValue={100}
                accessibilityLabel={`Completion trend ${PERIOD_NOUN[period]}`}
              />
            </Card>

            {/* ---- Streak history (chart-kit) ---- */}
            <Card style={{ gap: 8, padding: 16 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                Streak History
              </AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                Momentum streak over the last 30 days
              </AppText>
              <TrendLineChart
                labels={stats.history.map((p) => p.key.slice(5).replace('-', '/'))}
                values={stats.history.map((p) => p.streak)}
                width={chartWidth}
                color={t.palette.streakFire}
                suffix="d"
                accessibilityLabel="Momentum streak over the last 30 days"
              />
            </Card>

            {/* ---- Milestones ---- */}
            <View style={{ gap: 12 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                Milestones & Badges
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {stats.badges.map((b) => (
                  <Card key={b.id} style={{ width: 168, alignItems: 'center', gap: 8, paddingVertical: 18 }}>
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: b.unlocked ? 'rgba(16,185,129,0.14)' : 'rgba(249,115,22,0.12)',
                        boxShadow: b.unlocked ? t.glows.emerald : t.glows.flame,
                      }}>
                      <Icon name={b.unlocked ? b.icon : 'lock'} size={26} color={b.unlocked ? t.palette.primary : t.palette.streakFire} />
                    </View>
                    <AppText variant="labelLg" align="center">
                      {b.title}
                    </AppText>
                    {b.unlocked ? (
                      <Pill tone="emerald">
                        <AppText variant="labelSm" color={t.palette.primary}>
                          Unlocked
                        </AppText>
                      </Pill>
                    ) : (
                      <>
                        <Pill tone="flame">
                          <AppText variant="labelSm" color={t.palette.streakFire}>
                            {b.progress} / {b.target}
                          </AppText>
                        </Pill>
                        <ProgressBar value={b.progress / b.target} color={t.palette.streakFire} />
                      </>
                    )}
                  </Card>
                ))}
              </ScrollView>
            </View>

            {/* ---- Streak telemetry ---- */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="headlineSm" accessibilityRole="header">
                  Streak Telemetry
                </AppText>
                <AppText variant="labelSm" color={t.palette.textMuted}>
                  Sorted by streak
                </AppText>
              </View>
              {stats.tele.map((row) => (
                <PressableScale key={row.habit.id} onPress={() => router.push(`/habit/${row.habit.id}`)} accessibilityRole="button">
                  <Card accent={row.current > 0 ? t.palette.primaryContainer : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainer }}>
                      <Icon name={habitIconGlyph[row.habit.icon]} size={20} color={row.habit.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {row.habit.title}
                        </AppText>
                        {row.isPersonalBest ? (
                          <Pill tone="emerald" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>
                            <AppText variant="labelSm" color={t.palette.primary}>
                              PB
                            </AppText>
                          </Pill>
                        ) : null}
                      </View>
                      <AppText variant="bodySm" color={t.palette.textSecondary}>
                        {pct(row.rate)} completion rate
                      </AppText>
                    </View>
                    <Pill tone={row.current > 0 ? 'flame' : 'neutral'}>
                      <Icon name="local-fire-department" size={14} color={row.current > 0 ? t.palette.streakFire : t.palette.textMuted} />
                      <AppText variant="labelMd" color={row.current > 0 ? t.palette.streakFire : t.palette.textMuted} tabular>
                        {row.current}d
                      </AppText>
                    </Pill>
                  </Card>
                </PressableScale>
              ))}
            </View>

            {/* ---- Chain banner ---- */}
            <View style={{ borderRadius: t.radii.lg, overflow: 'hidden', padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: t.palette.surfaceContainer }}>
              <GlowBackdrop from="rgba(16,185,129,0.22)" to="rgba(249,115,22,0.16)" />
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,0.18)' }}>
                <Icon name="rocket-launch" size={24} color={t.palette.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="labelLg">
                  {stats.momentum > 0 ? `${stats.momentum}-Day Chain Alive` : 'Ignite a new chain'}
                </AppText>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {stats.todayProgress.total - stats.todayProgress.done > 0
                    ? `${stats.todayProgress.total - stats.todayProgress.done} ritual${stats.todayProgress.total - stats.todayProgress.done > 1 ? 's' : ''} left today — finish them to keep momentum.`
                    : 'Everything scheduled today is done. Enjoy the evening.'}
                </AppText>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatTile({
  width,
  label,
  icon,
  iconColor,
  value,
  children,
}: {
  width: number;
  label: string;
  icon: IconName;
  iconColor: string;
  value: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ width, gap: 6, minHeight: 150 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="labelSm" color={t.palette.textSecondary} uppercase>
          {label}
        </AppText>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <AppText variant="displayHero" tabular accessibilityLabel={`${label}: ${value}`}>
        {value}
      </AppText>
      {children}
    </Card>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.palette.surfaceContainerHighest, alignSelf: 'stretch', overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** "Wednesdays and Thursdays" — the top weekday(s) when they clearly lead. */
function bestWeekdays(rates: (number | null)[]): string | null {
  const valid = rates.map((r, i) => ({ r, i })).filter((x): x is { r: number; i: number } => x.r !== null);
  if (valid.length < 3) return null;
  const top = Math.max(...valid.map((x) => x.r));
  const winners = valid.filter((x) => x.r === top).map((x) => DAY_NAMES[x.i]);
  if (winners.length > 3) return null;
  return winners.length === 1 ? winners[0] : `${winners.slice(0, -1).join(', ')} and ${winners[winners.length - 1]}`;
}
