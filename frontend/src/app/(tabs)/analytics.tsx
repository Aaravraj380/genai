/**
 * Analytics — completion rates, weekly momentum, trend & streak-history charts,
 * milestones and per-habit streak telemetry. Follows the user's language and
 * week-start settings.
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
import type { Weekday } from '@/domain/types';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT, type I18n, type StringKey } from '@/i18n';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { habitIconGlyph, type IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

const PERIODS: { value: Period; label: StringKey }[] = [
  { value: 'weekly', label: 'period.weekly' },
  { value: 'monthly', label: 'period.monthly' },
  { value: 'yearly', label: 'period.yearly' },
  { value: 'all-time', label: 'period.allTime' },
];
const PERIOD_NOUN: Record<Period, StringKey> = {
  weekly: 'periodNoun.weekly',
  monthly: 'periodNoun.monthly',
  yearly: 'periodNoun.yearly',
  'all-time': 'periodNoun.allTime',
};
const PREV_NOUN: Partial<Record<Period, StringKey>> = {
  weekly: 'prevNoun.weekly',
  monthly: 'prevNoun.monthly',
  yearly: 'prevNoun.yearly',
};

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

export default function AnalyticsScreen() {
  const t = useTheme();
  const i18n = useT();
  const { t: tr, dates } = i18n;
  const { gutter, maxContentWidth, contentWidth, statColumns } = useLayout();
  const today = useTodayKey();
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const [period, setPeriod] = useState<Period>('weekly');

  const stats = useMemo(() => {
    const range = periodRange(period, today, habits, weekStartsOn);
    const prev = previousRange(period, today, habits, weekStartsOn);
    const rate = overallRate(habits, logs, range, today);
    const prevRate = prev ? overallRate(habits, logs, prev, today) : null;
    const tele = telemetry(habits, logs, today);
    const active = tele.filter((x) => x.current > 0).length;
    const broken = tele.filter((x) => x.current === 0 && x.longest > 0 && !isCurrentlyPaused(x.habit, today)).length;
    const elapsed = Math.max(1, diffDays(range.from, minKey(range.to, today)) + 1);
    const trend = completionTrend(habits, logs, period, today, weekStartsOn);
    return {
      range,
      rate,
      delta: prevRate?.rate != null && rate.rate != null ? rate.rate - prevRate.rate : null,
      active,
      broken,
      perfect: perfectDays(habits, logs, range, today),
      elapsed,
      reps: repsInRange(habits, logs, range, today),
      weekday: weekdayRates(habits, logs, range, today, weekStartsOn),
      trend,
      history: momentumSeries(habits, logs, today, 30),
      tele,
      badges: milestones(habits, logs, today),
      momentum: momentumStreak(habits, logs, today),
      todayProgress: dayProgress(habits, logs, today, today),
    };
  }, [habits, logs, period, today, weekStartsOn]);

  const tileWidth = (contentWidth - (statColumns - 1) * 12) / statColumns;
  const chartWidth = contentWidth - 32;
  // Weekday order follows the user's week start (Mon… or Sun…).
  const weekOrder = Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
  const best = bestWeekdays(stats.weekday, weekOrder, i18n);
  const periodNoun = tr(PERIOD_NOUN[period]);
  const prevKey = PREV_NOUN[period];
  const left = stats.todayProgress.total - stats.todayProgress.done;
  const dayLabel = (key: string) => key.slice(8).replace(/^0/, '');

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title={tr('tab.analytics')} streak={stats.momentum} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32, gap: 20, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        <SegmentedControl options={PERIODS.map((p) => ({ value: p.value, label: tr(p.label) }))} value={period} onChange={setPeriod} />

        {habits.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
            <Icon name="insights" size={40} color={t.palette.textMuted} />
            <AppText variant="headlineSm">{tr('an.noDataTitle')}</AppText>
            <AppText variant="bodySm" color={t.palette.textSecondary} align="center">
              {tr('an.noDataBody')}
            </AppText>
            <Button label={tr('today.newHabit')} icon="add" onPress={() => router.push('/habit/new')} />
          </Card>
        ) : (
          <>
            {/* ---- Stat tiles ---- */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <StatTile width={tileWidth} label={tr('an.completion')} icon="trending-up" iconColor={t.palette.primary} value={pct(stats.rate.rate)}>
                {stats.delta !== null && prevKey ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name={stats.delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={stats.delta >= 0 ? t.palette.primary : t.palette.streakFire} />
                    <AppText variant="labelSm" color={stats.delta >= 0 ? t.palette.primary : t.palette.streakFire} style={{ flexShrink: 1 }}>
                      {tr('an.vsPrev', { delta: `${stats.delta >= 0 ? '+' : ''}${Math.round(stats.delta * 100)}%`, prev: tr(prevKey) })}
                    </AppText>
                  </View>
                ) : null}
                <Sparkline values={stats.trend.map((p) => p.rate ?? 0)} width={tileWidth - 34} color={t.palette.primary} />
              </StatTile>

              <StatTile width={tileWidth} label={tr('an.activeStreaks')} icon="local-fire-department" iconColor={t.palette.streakFire} value={String(stats.active)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {tr('an.onFire')}
                </AppText>
                <Pill tone={stats.broken ? 'flame' : 'neutral'}>
                  <AppText variant="labelSm" color={stats.broken ? t.palette.streakFire : t.palette.textSecondary}>
                    {tr('an.broken', { n: stats.broken })}
                  </AppText>
                </Pill>
              </StatTile>

              <StatTile width={tileWidth} label={tr('an.perfectDays')} icon="verified" iconColor={t.palette.tertiary} value={String(stats.perfect)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {tr('an.daysPeriod', { period: periodNoun })}
                </AppText>
                <ProgressBar value={stats.perfect / stats.elapsed} color={t.palette.tertiary} />
              </StatTile>

              <StatTile width={tileWidth} label={tr('an.totalReps')} icon="check-circle" iconColor={t.palette.primary} value={String(stats.reps.reps)}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {tr('an.logsCompleted')}
                </AppText>
                <AppText variant="labelSm" color={t.palette.textMuted}>
                  {tr('an.target', { n: stats.reps.target })}
                </AppText>
              </StatTile>
            </View>

            {/* ---- Weekly momentum ---- */}
            <Card style={{ gap: 16, padding: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="headlineSm" accessibilityRole="header">
                    {tr('an.weeklyMomentum')}
                  </AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    {tr('an.byWeekday', { period: periodNoun })}
                  </AppText>
                </View>
                <Pill tone="emerald">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.palette.primary }} />
                  <AppText variant="labelSm" color={t.palette.primary}>
                    {tr('an.activeTrack')}
                  </AppText>
                </Pill>
              </View>
              <MomentumBars
                rates={stats.weekday}
                dayLabels={weekOrder.map((d) => dates.weekdayShortOf(d))}
                todayIndex={(weekdayOf(today) - weekStartsOn + 7) % 7}
              />
              {best ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: t.radii.md, backgroundColor: t.palette.surfaceContainer }}>
                  <Icon name="bolt" size={20} color={t.palette.streakFire} />
                  <AppText variant="bodySm" color={t.palette.textSecondary} style={{ flex: 1 }}>
                    {tr('an.bestDays', { days: best })}
                  </AppText>
                </View>
              ) : null}
            </Card>

            {/* ---- Completion trend (chart-kit) ---- */}
            <Card style={{ gap: 8, padding: 16 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                {tr('an.trend')}
              </AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {period === 'weekly' || period === 'monthly' ? tr('an.trendDaily') : tr('an.trendMonthly')}
              </AppText>
              <TrendLineChart
                labels={stats.trend.map((p) => (period === 'weekly' || period === 'monthly' ? dayLabel(p.key) : dates.monthShort(p.key)))}
                values={stats.trend.map((p) => (p.rate === null ? null : Math.round(p.rate * 100)))}
                width={chartWidth}
                color={t.palette.primary}
                maxValue={100}
                accessibilityLabel={`${tr('an.trend')}, ${periodNoun}`}
              />
            </Card>

            {/* ---- Streak history (chart-kit) ---- */}
            <Card style={{ gap: 8, padding: 16 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                {tr('an.history')}
              </AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {tr('an.historySub')}
              </AppText>
              <TrendLineChart
                labels={stats.history.map((p) => `${dayLabel(p.key)} ${dates.monthShort(p.key)}`)}
                values={stats.history.map((p) => p.streak)}
                width={chartWidth}
                color={t.palette.streakFire}
                suffix={tr('common.daySuffix')}
                accessibilityLabel={tr('an.historySub')}
              />
            </Card>

            {/* ---- Milestones ---- */}
            <View style={{ gap: 12 }}>
              <AppText variant="headlineSm" accessibilityRole="header">
                {tr('an.milestones')}
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
                      {tr(`an.badge.${b.id}` as StringKey)}
                    </AppText>
                    {b.unlocked ? (
                      <Pill tone="emerald">
                        <AppText variant="labelSm" color={t.palette.primary}>
                          {tr('an.unlocked')}
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <AppText variant="headlineSm" accessibilityRole="header">
                  {tr('an.telemetry')}
                </AppText>
                <AppText variant="labelSm" color={t.palette.textMuted}>
                  {tr('an.sorted')}
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
                              {tr('an.pb')}
                            </AppText>
                          </Pill>
                        ) : null}
                      </View>
                      <AppText variant="bodySm" color={t.palette.textSecondary}>
                        {tr('an.rateLine', { pct: pct(row.rate) })}
                      </AppText>
                    </View>
                    <Pill tone={row.current > 0 ? 'flame' : 'neutral'}>
                      <Icon name="local-fire-department" size={14} color={row.current > 0 ? t.palette.streakFire : t.palette.textMuted} />
                      <AppText variant="labelMd" color={row.current > 0 ? t.palette.streakFire : t.palette.textMuted} tabular>
                        {row.current}
                        {tr('common.daySuffix')}
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
                <AppText variant="labelLg">{stats.momentum > 0 ? tr('an.chainAlive', { n: stats.momentum }) : tr('an.ignite')}</AppText>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {left > 0 ? tr('an.leftToday', { n: left }) : tr('an.allDone')}
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <AppText variant="labelSm" color={t.palette.textSecondary} uppercase style={{ flexShrink: 1 }}>
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
function bestWeekdays(rates: (number | null)[], weekOrder: Weekday[], i18n: I18n): string | null {
  const valid = rates.map((r, i) => ({ r, i })).filter((x): x is { r: number; i: number } => x.r !== null);
  if (valid.length < 3) return null;
  const top = Math.max(...valid.map((x) => x.r));
  const winners = valid.filter((x) => x.r === top).map((x) => i18n.dates.weekdayLong(weekOrder[x.i]));
  if (winners.length > 3) return null;
  return i18n.joinList(winners);
}
