/**
 * App chrome: brand mark, top app bar, glow backdrops and the bottom nav.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { haptic } from '@/services/haptics';
import type { IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

import { StreakBadge } from './animated';
import { AppText, Icon, IconButton, PressableScale } from './primitives';

const avatar = require('../../assets/images/avatar.png');

/** The flame-over-check logo tile from the Stitch header. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: t.palette.surfaceElevated,
        borderWidth: 1,
        borderColor: t.palette.borderSubtle,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name="local-fire-department" size={size * 0.42} color={t.palette.streakFire} style={{ marginBottom: -size * 0.12 }} />
      <Icon name="check" size={size * 0.36} color={t.palette.primary} />
    </View>
  );
}

export function Avatar({ size = 36 }: { size?: number }) {
  const t = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Profile and settings"
      onPress={() => router.navigate('/explore')}
      scaleTo={0.94}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={avatar}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: t.palette.borderSubtle }}
        contentFit="cover"
      />
    </PressableScale>
  );
}

/** Top app bar used by the three tab screens. */
export function TabHeader({ title, streak }: { title: string; streak: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: gutter,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: t.palette.surface,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <BrandMark />
        <View>
          <AppText variant="labelSm" color={t.palette.textMuted} uppercase>
            Focus & Flow
          </AppText>
          <AppText variant="headlineSm" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 26 }}>
            {title}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StreakBadge days={streak} />
        <Avatar />
      </View>
    </View>
  );
}

/** Header for stacked screens (detail / new habit). */
export function StackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingBottom: 8,
        paddingHorizontal: gutter - 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: t.palette.surface,
      }}>
      <IconButton
        icon="arrow-back-ios-new"
        label="Go back"
        filled={false}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <BrandMark size={32} />
      <AppText variant="headlineSm" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
      {right ?? <Avatar />}
    </View>
  );
}

/**
 * Soft ambient glow used behind hero cards (the orange→emerald wash on
 * "Today's Orbit" and the Analytics banner). Pure SVG, so it renders
 * identically on iOS, Android and web.
 */
export function GlowBackdrop({
  from = 'rgba(249,115,22,0.18)',
  to = 'rgba(16,185,129,0.14)',
  radial,
  style,
}: {
  from?: string;
  to?: string;
  radial?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Unique gradient ids: SVG ids are global in the DOM on web.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = `g${uid}`;
  const r = `r${uid}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={g} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={from} stopOpacity={1} />
            <Stop offset="0.55" stopColor="rgba(0,0,0,0)" stopOpacity={0} />
            <Stop offset="1" stopColor={to} stopOpacity={1} />
          </LinearGradient>
          {radial ? (
            <RadialGradient id={r} cx="85%" cy="15%" r="60%">
              <Stop offset="0" stopColor={radial} stopOpacity={1} />
              <Stop offset="1" stopColor={radial} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${g})`} />
        {radial ? <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${r})`} /> : null}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom navigation bar (persistent across the three tabs).           */
/* ------------------------------------------------------------------ */

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Today', icon: 'check-circle-outline' },
  analytics: { label: 'Analytics', icon: 'insights' },
  explore: { label: 'Explore', icon: 'explore' },
};

export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.palette.surfaceBase,
        borderTopWidth: 1,
        borderTopColor: t.palette.ghostBorder,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingTop: 10,
      }}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const color = focused ? t.palette.primary : t.palette.textMuted;
        return (
          <PressableScale
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            scaleTo={0.94}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                haptic.tap();
                navigation.navigate(route.name, route.params);
              }
            }}
            style={{ flex: 1, alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' }}>
            <Icon name={meta.icon} size={24} color={color} />
            <AppText variant="labelMd" color={color} style={{ fontSize: 11 }}>
              {meta.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}
