/**
 * Month calendar for Habit Detail: completed days glow emerald and are joined
 * by chain connectors, frozen days show a snowflake, misses sit dark.
 */
import { View } from 'react-native';

import { addDays, addMonths, eachDay, endOfMonth, monthId, parseDateKey, startOfMonth, startOfWeek } from '@/domain/dates';
import { dayStatus } from '@/domain/streaks';
import type { DateKey, DayStatus, Habit, HabitLog, Weekday } from '@/domain/types';
import { useT, type StringKey } from '@/i18n';
import { haptic } from '@/services/haptics';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText, Icon, PressableScale } from './primitives';

const STATUS_KEY: Record<DayStatus, StringKey> = {
  completed: 'cal.completed',
  frozen: 'cal.frozen',
  missed: 'cal.missed',
  pending: 'status.pending',
  rest: 'status.rest',
  paused: 'status.paused',
  'before-start': 'status.beforeStart',
  future: 'status.future',
};
const chainable = (s: DayStatus) => s === 'completed' || s === 'frozen';

export function MonthCalendar({
  habit,
  log,
  today,
  month,
  onMonthChange,
  onDayPress,
  width,
}: {
  habit: Habit;
  log: HabitLog;
  today: DateKey;
  month: DateKey; // any day in the month to show
  onMonthChange: (m: DateKey) => void;
  onDayPress: (key: DateKey, status: DayStatus) => void;
  width: number;
}) {
  const t = useTheme();
  const { t: tr, dates } = useT();
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const head = Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd = addDays(startOfWeek(endOfMonth(first), weekStartsOn), 6);
  const days = eachDay(gridStart, gridEnd);
  const weeks: DateKey[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const cell = Math.floor(width / 7);
  const dot = Math.min(40, cell - 6);
  const canPrev = monthId(first) > monthId(habit.creationDate);
  const canNext = monthId(first) < monthId(today);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Icon name="calendar-month" size={22} color={t.palette.primary} />
          <AppText variant="headlineSm" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
            {dates.monthYear(first)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: t.palette.surfaceContainerHigh, borderRadius: 999 }}>
          <NavBtn icon="chevron-left" label={tr('cal.prev')} disabled={!canPrev} onPress={() => onMonthChange(addMonths(first, -1))} />
          <NavBtn icon="chevron-right" label={tr('cal.next')} disabled={!canNext} onPress={() => onMonthChange(addMonths(first, 1))} />
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {head.map((d) => (
          <AppText key={d} variant="labelMd" color={t.palette.textSecondary} align="center" style={{ width: cell }}>
            {dates.weekdayLetter(d)}
          </AppText>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0]} style={{ flexDirection: 'row' }}>
          {week.map((key, i) => {
            const inMonth = key.slice(0, 7) === first.slice(0, 7);
            const status = dayStatus(habit, log, key, today);
            const next = week[i + 1];
            const linkRight = next && inMonth && chainable(status) && chainable(dayStatus(habit, log, next, today)) && next.slice(0, 7) === first.slice(0, 7);
            const interactive = inMonth && status !== 'future' && status !== 'before-start';

            let bg = 'transparent';
            let fg: string = t.palette.textSecondary;
            let border = 'transparent';
            if (status === 'completed') {
              bg = t.palette.primaryContainer;
              fg = t.palette.onPrimary;
            } else if (status === 'frozen') {
              bg = t.palette.tertiary;
              fg = t.palette.surfaceBase;
            } else if (status === 'missed') {
              bg = t.palette.surfaceContainerHigh;
              fg = t.palette.textMuted;
            } else if (status === 'pending') {
              bg = t.palette.surfaceContainerHighest;
              fg = t.palette.textPrimary;
              border = t.palette.primary;
            } else if (status === 'future' || status === 'before-start' || status === 'paused') {
              fg = t.palette.textMuted;
            }
            const opacity = inMonth ? (status === 'future' || status === 'before-start' ? 0.45 : 1) : 0.18;

            return (
              <View key={key} style={{ width: cell, height: dot + 12, alignItems: 'center', justifyContent: 'center' }}>
                {linkRight ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: cell / 2,
                      width: cell,
                      height: 4,
                      backgroundColor: 'rgba(16,185,129,0.55)',
                    }}
                  />
                ) : null}
                <PressableScale
                  disabled={!interactive}
                  scaleTo={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={`${dates.dayLabel(key)}: ${tr(STATUS_KEY[status])}`}
                  onPress={() => {
                    haptic.tap();
                    onDayPress(key, status);
                  }}
                  style={{
                    width: dot,
                    height: dot,
                    borderRadius: dot / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                    borderWidth: border === 'transparent' ? 0 : 2,
                    borderColor: border,
                    opacity,
                    boxShadow: status === 'completed' && inMonth ? '0px 0px 10px rgba(16,185,129,0.35)' : status === 'frozen' && inMonth ? '0px 0px 10px rgba(173,198,255,0.45)' : undefined,
                  }}>
                  {status === 'frozen' && inMonth ? (
                    <Icon name="ac-unit" size={dot * 0.5} color={t.palette.onPrimary} />
                  ) : (
                    <AppText variant="labelMd" color={fg} tabular style={{ fontSize: dot > 34 ? 13 : 11 }}>
                      {parseDateKey(key).day}
                    </AppText>
                  )}
                </PressableScale>
              </View>
            );
          })}
        </View>
      ))}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          padding: 10,
          borderRadius: t.radii.md,
          backgroundColor: t.palette.surfaceContainer,
          flexWrap: 'wrap',
          gap: 8,
        }}>
        <Legend color={t.palette.primaryContainer} label={tr('cal.completed')} />
        <Legend color={t.palette.tertiary} label={tr('cal.frozen')} icon />
        <Legend color={t.palette.surfaceContainerHighest} label={tr('cal.missed')} />
      </View>
    </View>
  );
}

function NavBtn({ icon, label, onPress, disabled }: { icon: 'chevron-left' | 'chevron-right'; label: string; onPress: () => void; disabled: boolean }) {
  const t = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <Icon name={icon} size={22} color={t.palette.textPrimary} />
    </PressableScale>
  );
}

function Legend({ color, label, icon }: { color: string; label: string; icon?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        {icon ? <Icon name="ac-unit" size={10} color={t.palette.surfaceBase} /> : null}
      </View>
      <AppText variant="labelSm" color={t.palette.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}
