/** Small bottom toast. Usage: const [toast, flash] = useToast(); flash('Saved'); render {toast}. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './primitives';

export function useToast(): [ReactNode, (msg: string) => void] {
  const t = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg(m);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = msg ? (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        bottom: 20,
        alignSelf: 'center',
        maxWidth: '90%',
        backgroundColor: t.palette.surfaceContainerHigh,
        borderColor: t.palette.borderSubtle,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
      }}>
      <AppText variant="labelLg" align="center">
        {msg}
      </AppText>
    </Animated.View>
  ) : null;

  return [node, flash];
}
