/**
 * Root layout: fonts, splash, providers, and the root stack.
 *
 *   (tabs)            → Today · Analytics · Explore (persistent bottom nav)
 *   habit/new         → create form (modal)
 *   habit/[id]        → detail / telemetry
 *   habit/[id]/edit   → edit form (modal)
 *   settings          → profile, theme, language, week start, freezes, tags
 */
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WelcomeBackGate } from '@/components/WelcomeBack';
import { TodayProvider } from '@/hooks/useTodayContext';
import { configureNotifications } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotifications();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    ...MaterialIcons.font,
  });
  const hydrated = useHabitStore((s) => s.hasHydrated);
  const settingsHydrated = useSettingsStore((s) => s.hasHydrated);
  const ready = (fontsLoaded || !!fontError) && hydrated && settingsHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TodayProvider>
          <ThemedApp />
        </TodayProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Everything that needs the active theme (dark / light) lives below the provider. */
function ThemedApp() {
  const t = useTheme();

  // Match the native window / Android nav-bar background to the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.palette.surface).catch(() => undefined);
  }, [t.palette.surface]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StatusBar style={t.mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.palette.surface },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="habit/[id]/index" />
        <Stack.Screen name="habit/[id]/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings" />
      </Stack>
      <WelcomeBackGate />
    </GestureHandlerRootView>
  );
}
