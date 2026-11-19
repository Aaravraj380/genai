/**
 * Root layout: fonts, splash, providers, and the root stack.
 *
 *   (tabs)            → Today · Analytics · Explore (persistent bottom nav)
 *   habit/new         → create form (modal)
 *   habit/[id]        → detail / telemetry
 *   habit/[id]/edit   → edit form (modal)
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
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WelcomeBackGate } from '@/components/WelcomeBack';
import { TodayProvider } from '@/hooks/useTodayContext';
import { configureNotifications } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

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
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.surface }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <TodayProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.surface },
                animation: 'slide_from_right',
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="habit/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="habit/[id]/index" />
              <Stack.Screen name="habit/[id]/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
            <WelcomeBackGate />
          </TodayProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
