/**
 * Data visualisation.
 *  - MomentumBars: custom pill bars that reproduce the Stitch "Weekly Momentum" chart exactly.
 *  - TrendLineChart: react-native-chart-kit (v2 API) LineChart themed to Kinetic
 *    Obsidian — completion-rate trend and streak history, with tap tooltips.
 *  - Sparkline: tiny SVG line for stat tiles.
 */
import { View } from 'react-native';
import { LineChart } from 'react-native-chart-kit/v2';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './primitives';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MomentumBars({ rates, height = 128, todayIndex }: { rates: (number | null)[]; height?: number; todayIndex?: number }) {
  const t = useTheme();
  const valid = rates.filter((r): r is number => r !== null);
  const min = valid.length > 1 ? Math.min(...valid) : null;
  return (
    <View
      accessible
      accessibilityLabel={`Completion by weekday: ${rates
        .map((r, i) => `${DAY_LABELS[i]} ${r === null ? 'no data' : Math.round(r * 100) + '%'}`)
        .join(', ')}`}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
      {rates.map((r, i) => {
        const weak = r !== null && min !== null && r === min && r < 1;
        const color = weak ? t.palette.streakFire : t.palette.primary;
        return (
          <View key={DAY_LABELS[i]} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <AppText variant="labelSm" color={r === null ? t.palette.textMuted : weak ? t.palette.streakFire : t.palette.primary} tabular>
              {r === null ? '—' : `${Math.round(r * 100)}%`}
            </AppText>
            <View
              style={{
                width: '100%',
                maxWidth: 28,
                height,
                borderRadius: 14,
                backgroundColor: t.palette.surfaceContainer,
                justifyContent: 'flex-end',
                overflow: 'hidden',
              }}>
              <Animated.View
                entering={FadeInUp.delay(i * 50).duration(400)}
                style={{
                  height: `${Math.max(r ?? 0, 0.04) * 100}%`,
                  borderRadius: 14,
                  backgroundColor: r === null ? 'transparent' : color,
                }}
              />
            </View>
            <AppText
              variant="labelSm"
              color={i === todayIndex ? t.palette.textPrimary : t.palette.textSecondary}
              style={i === todayIndex ? { textDecorationLine: 'underline' } : null}>
              {DAY_LABELS[i]}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export function TrendLineChart({
  labels,
  values,
  width,
  height = 180,
  color,
  suffix = '%',
  maxValue,
  accessibilityLabel,
}: {
  labels: string[];
  /** `null` = nothing scheduled that bucket; the line bridges the gap. */
  values: (number | null)[];
  width: number;
  height?: number;
  color: string;
  suffix?: string;
  /** Pin the y-axis top (e.g. 100 for percentages). */
  maxValue?: number;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const points = labels.map((label, i) => ({ label, value: values[i] }));
  if (values.filter((v) => v !== null).length < 2) {
    return (
      <View style={{ height: height * 0.6, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="bodySm" color={t.palette.textMuted}>
          Not enough history yet — check back tomorrow.
        </AppText>
      </View>
    );
  }
  return (
    <LineChart
      data={points}
      xKey="label"
      yKey="value"
      width={width}
      height={height}
      curve="monotone"
      connectNulls
      area
      areaFill={{ fromColor: color, toColor: color, fromOpacity: 0.3, toOpacity: 0 }}
      dots={{ visible: points.length <= 14, radius: 3, fill: color, strokeWidth: 0 }}
      activeDot={{ radius: 5, fill: color, stroke: t.palette.surfaceBase, strokeWidth: 2 }}
      tooltip={{ visible: true }}
      showVerticalGridLines={false}
      labelStrategy="skip"
      yDomain={maxValue !== undefined ? { min: 0, max: maxValue } : { min: 0, includeZero: true, nice: true }}
      formatYLabel={(v) => `${Math.round(v)}${suffix}`}
      accessibilityLabel={accessibilityLabel}
      theme={{
        background: 'transparent',
        plotBackground: 'transparent',
        grid: t.palette.borderSubtle,
        axis: t.palette.borderSubtle,
        text: t.palette.textSecondary,
        mutedText: t.palette.textMuted,
        series: [color],
        typography: { fontFamily: t.fonts.displaySemi, axisLabelSize: 10 },
        tooltip: {
          background: t.palette.surfaceContainerHigh,
          border: t.palette.borderSubtle,
          text: t.palette.textPrimary,
          mutedText: t.palette.textSecondary,
          borderRadius: 10,
        },
      }}
    />
  );
}

export function Sparkline({ values, width = 96, height = 32, color }: { values: number[]; width?: number; height?: number; color: string }) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${d} L${width},${height} L0,${height} Z`} fill="url(#spark)" />
      <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
