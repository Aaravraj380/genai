/**
 * Design-system primitives: text, icon, card, pressable, buttons, chips.
 * Every screen is composed from these so the Stitch look stays consistent.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { IconName } from '@/theme/icons';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

/* ---------------- Text ---------------- */

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  uppercase?: boolean;
  /** Tabular figures keep numbers from jittering while they animate (DESIGN.md). */
  tabular?: boolean;
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'bodyMd', color, uppercase, tabular, align, style, ...rest }: AppTextProps) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.4}
      style={[
        t.typography[variant],
        { color: color ?? t.palette.textPrimary, textAlign: align },
        uppercase && { textTransform: 'uppercase' },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}

/* ---------------- Icon ---------------- */

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <MaterialIcons name={name} size={size} color={color ?? t.palette.textPrimary} style={style} />;
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  style,
  level = 1,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  level?: 1 | 2;
  /** 3px left accent stroke used for active/completed items. */
  accent?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: level === 1 ? t.palette.surfaceElevated : t.palette.surfaceContainer,
          borderColor: t.palette.ghostBorder,
          borderRadius: t.radii.lg,
        },
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}>
      {children}
    </View>
  );
}

/* ---------------- Pressable with press-scale ---------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  style,
  scaleTo = 0.98,
  ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}

/* ---------------- Buttons ---------------- */

type ButtonTone = 'primary' | 'flame' | 'ghost';

export function Button({
  label,
  icon,
  onPress,
  tone = 'primary',
  size = 'md',
  disabled,
  style,
  accessibilityHint,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = tone === 'primary' ? t.palette.primary : tone === 'flame' ? t.palette.streakFire : 'transparent';
  const fg = tone === 'ghost' ? t.palette.textPrimary : tone === 'primary' ? t.palette.onPrimary : '#1A0B00';
  const pad = size === 'lg' ? 18 : size === 'sm' ? 8 : 13;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: bg,
          paddingVertical: pad,
          paddingHorizontal: size === 'sm' ? 16 : 24,
          borderRadius: t.radii.full,
          borderWidth: tone === 'ghost' ? 1 : 0,
          borderColor: t.palette.borderSubtle,
          opacity: disabled ? 0.45 : 1,
          boxShadow: tone === 'primary' && !disabled ? t.glows.emeraldStrong : tone === 'flame' ? t.glows.flame : undefined,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} color={fg} /> : null}
      <AppText variant={size === 'lg' ? 'headlineSm' : 'labelLg'} color={fg} style={size === 'lg' ? { fontSize: 18 } : null}>
        {label}
      </AppText>
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  filled = true,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  filled?: boolean;
}) {
  const t = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      scaleTo={0.92}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? t.palette.surfaceContainerHigh : 'transparent',
      }}>
      <Icon name={icon} size={size * 0.5} />
    </PressableScale>
  );
}

/* ---------------- Chips & badges ---------------- */

export function TagChip({ label, tint = 'cobalt' }: { label: string; tint?: 'cobalt' | 'emerald' | 'flame' }) {
  const t = useTheme();
  const c = t.tagTints[tint];
  return (
    <View style={[styles.tag, { backgroundColor: c.bg, borderRadius: t.radii.base }]}>
      <AppText variant="labelSm" color={c.fg} numberOfLines={1}>
        #{label}
      </AppText>
    </View>
  );
}

export function Pill({
  children,
  tone = 'flame',
  style,
}: {
  children: ReactNode;
  tone?: 'flame' | 'emerald' | 'neutral' | 'cobalt';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const map = {
    flame: { bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.45)' },
    emerald: { bg: 'rgba(16,185,129,0.14)', border: 'rgba(78,222,163,0.40)' },
    cobalt: { bg: 'rgba(113,161,255,0.14)', border: 'rgba(173,198,255,0.35)' },
    neutral: { bg: t.palette.surfaceContainerHigh, border: t.palette.borderSubtle },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg, borderColor: map.border }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
