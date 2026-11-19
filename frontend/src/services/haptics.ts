/** Thin, web-safe wrapper around expo-haptics. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

export const haptic = {
  tap: () => enabled && Haptics.selectionAsync().catch(() => undefined),
  success: () =>
    enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  light: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  warning: () =>
    enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
};
