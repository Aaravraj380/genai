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

import { useT, type StringKey } from '@/i18n';
import { haptic } from '@/services/haptics';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { IconName } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

import { StreakBadge } from './animated';
import { AppText, Icon, IconButton, PressableScale } from './primitives';

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

/** First letters of up to two words: "Sameer Raj" → "SR". Works for any script. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** The user's photo, else their initials, else a neutral person icon. */
export function ProfileImage({ size = 36 }: { size?: number }) {
  const t = useTheme();
  const uri = useSettingsStore((s) => s.avatarUri);
  const name = useSettingsStore((s) => s.profileName);
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: t.palette.borderSubtle };
  if (uri) return <Image source={{ uri }} style={ring} contentFit="cover" />;
  const initials = initialsOf(name);
  return (
    <View style={[ring, { alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainerHigh }]}>
      {initials ? (
        <AppText variant="labelLg" color={t.palette.primary} style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
          {initials}
        </AppText>
      ) : (
        <Icon name="person" size={size * 0.6} color={t.palette.textSecondary} />
      )}
    </View>
  );
}

export function Avatar({ size = 36 }: { size?: number }) {
  const { t: tr } = useT();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={tr('nav.profileSettings')}
      onPress={() => router.push('/settings')}
      scaleTo={0.94}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <ProfileImage size={size} />
    </PressableScale>
  );
}

/** Top app bar used by the three tab screens. */
export function TabHeader({ title, streak }: { title: string; streak: number }) {
  const t = useTheme();
  const { t: tr } = useT();
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
            {tr('app.name')}
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
  const { t: tr } = useT();
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
        label={tr('nav.back')}
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

const TAB_META: Record<string, { label: StringKey; icon: IconName }> = {
  index: { label: 'tab.today', icon: 'check-circle-outline' },
  analytics: { label: 'tab.analytics', icon: 'insights' },
  explore: { label: 'tab.explore', icon: 'explore' },
};

export function BottomNav({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const t = useTheme();
  const { t: tr } = useT();
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
            accessibilityLabel={tr(meta.label)}
            scaleTo={0.94}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                haptic.tap();
                navigateToTab(route.key);
              }
            }}
            style={{ flex: 1, alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' }}>
            <Icon name={meta.icon} size={24} color={color} />
            <AppText variant="labelMd" color={color} style={{ fontSize: 11 }}>
              {tr(meta.label)}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}
