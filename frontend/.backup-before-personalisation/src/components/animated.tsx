/**
 * Micro-animations: rolling counters, streak badges, progress ring and the
 * habit completion target. All run on the UI thread via Reanimated.
 */
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { haptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

import { AppText, Icon, PressableScale } from './primitives';

/* ------------------------------------------------------------------ */
/* Rolling number: old value slides up & out, new value rises in.      */
/* ------------------------------------------------------------------ */

export function RollingNumber({
  value,
  variant = 'labelMd',
  color,
  suffix = '',
}: {
  value: number | string;
  variant?: TypographyVariant;
  color?: string;
  suffix?: string;
}) {
  const t = useTheme();
  const lh = t.typography[variant].lineHeight;
  return (
    <View style={{ height: lh, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.View key={String(value)} entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(200)}>
        <AppText variant={variant} color={color} tabular>
          {value}
          {suffix}
        </AppText>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Streak badge "🔥 18d" — pulses & glows when the number goes up.     */
/* ------------------------------------------------------------------ */

export function StreakBadge({ days, compact = false }: { days: number; compact?: boolean }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const prev = useRef(days);

  useEffect(() => {
    if (days > prev.current) {
      scale.set(withSequence(withSpring(1.25, { damping: 6, stiffness: 300 }), withSpring(1, t.motion.spring)));
      glow.set(withSequence(withTiming(1, { duration: 150 }), withTiming(0, { duration: 700 })));
    }
    prev.current = days;
  }, [days, glow, scale, t.motion.spring]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: glow.value * 0.8,
  }));

  const active = days > 0;
  return (
    <Animated.View
      accessibilityLabel={`${days} day streak`}
      style={[
        styles.badge,
        {
          backgroundColor: active ? 'rgba(249,115,22,0.14)' : t.palette.surfaceContainer,
          borderColor: active ? 'rgba(249,115,22,0.35)' : t.palette.borderSubtle,
          paddingHorizontal: compact ? 8 : 12,
          shadowColor: t.palette.streakFire,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}>
      <Icon name="local-fire-department" size={14} color={active ? t.palette.streakFire : t.palette.textMuted} />
      <RollingNumber value={days} suffix="d" color={active ? t.palette.streakFire : t.palette.textMuted} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Circular progress ring (Today's Orbit).                             */
/* ------------------------------------------------------------------ */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({
  progress,
  size = 88,
  stroke = 8,
  color,
  trackColor,
  children,
}: {
  progress: number; // 0–1
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    }));
  }, [p, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  // Reanimated can't drive SVG props on web; fall back to a static value there.
  const webProps = Platform.OS === 'web' ? { strokeDashoffset: circumference * (1 - progress) } : null;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? t.palette.surfaceContainerHighest} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? t.palette.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          {...(webProps ?? { animatedProps })}
        />
      </Svg>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Completion target: the big round check on each habit card.          */
/* ------------------------------------------------------------------ */

export function CheckTarget({
  count,
  target,
  onPress,
  label,
  size = 44,
  disabled,
}: {
  count: number;
  target: number;
  onPress: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  const t = useTheme();
  const done = count >= target;
  const fill = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  const ripple = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fill.set(withTiming(done ? 1 : 0, { duration: t.motion.fast }));
    if (done) {
      pop.set(withSequence(withSpring(1.22, { damping: 5, stiffness: 320 }), withSpring(1, t.motion.spring)));
      ripple.set(0);
      ripple.set(withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
    } else {
      pop.set(withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, t.motion.spring)));
    }
  }, [done, fill, pop, ripple, t.motion.fast, t.motion.spring]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    backgroundColor: interpolateColor(fill.value, [0, 1], [t.palette.surfaceContainerHighest, t.palette.primary]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: interpolate(fill.value, [0, 1], [0.3, 1]) }, { rotate: `${interpolate(fill.value, [0, 1], [-45, 0])}deg` }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.2, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [1, 1.9]) }],
  }));

  const partial = !done && target > 1 && count > 0;

  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled }}
      accessibilityLabel={label}
      accessibilityHint={target > 1 ? `${count} of ${target} logged. Tap to add one.` : 'Tap to toggle today'}
      disabled={disabled}
      hitSlop={8}
      scaleTo={0.9}
      onPress={() => {
        if (count + 1 >= target && !done) haptic.success();
        else haptic.tap();
        onPress();
      }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: 2, borderColor: t.palette.primary },
          rippleStyle,
        ]}
      />
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
          done ? { boxShadow: t.glows.emerald } : null,
          circleStyle,
        ]}>
        {partial ? (
          <ProgressRing progress={count / target} size={size} stroke={3} trackColor="transparent">
            <AppText variant="labelSm" color={t.palette.textPrimary} tabular>
              {count}/{target}
            </AppText>
          </ProgressRing>
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, checkStyle]}>
          <Icon name="check" size={size * 0.55} color={t.palette.surfaceBase} />
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control (Weekly / Monthly / … and frequency picker).      */
/* ------------------------------------------------------------------ */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        { flexDirection: 'row', backgroundColor: t.palette.surfaceContainer, borderRadius: t.radii.md, padding: 4, gap: 4 },
        style,
      ]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: t.radii.base,
              backgroundColor: selected ? t.palette.surfaceElevated : 'transparent',
              borderWidth: 1,
              borderColor: selected ? t.palette.borderSubtle : 'transparent',
            }}>
            <AppText variant="labelLg" color={selected ? t.palette.textPrimary : t.palette.textSecondary} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
});
