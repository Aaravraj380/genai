/**
 * Local reminders via expo-notifications.
 *
 * Each habit's reminder is scheduled as one repeating trigger per scheduled
 * weekday (or a single DAILY trigger for daily habits). Notifications carry
 * `data.habitId`, so we can cancel a habit's reminders without storing IDs.
 *
 * Local notifications work in Expo Go; *push* notifications on Android need a
 * development build (not used here). All calls are no-ops on web.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { frequencyDays, isCurrentlyPaused } from '@/domain/streaks';
import type { DateKey, Habit } from '@/domain/types';

const CHANNEL_ID = 'habit-reminders';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

export function configureNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Habit reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#4EDEA3',
    }).catch(() => undefined);
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return req.granted;
  } catch {
    return false;
  }
}

async function cancelForHabit(habitId: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.content.data?.habitId === habitId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Reconcile the OS schedule with the habit's current reminder settings. */
export async function syncHabitReminder(habit: Habit, today: DateKey): Promise<void> {
  if (!supported) return;
  try {
    await cancelForHabit(habit.id);
    const r = habit.reminder;
    if (!r?.enabled || isCurrentlyPaused(habit, today)) return;
    if (!(await ensurePermission())) return;

    const content = {
      title: habit.title,
      body: 'Keep the chain alive — log it now.',
      data: { habitId: habit.id },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    };
    const days = frequencyDays(habit.frequency);
    if (days.length === 7) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute },
      });
      return;
    }
    // expo-notifications weekdays are 1 = Sunday … 7 = Saturday.
    await Promise.all(
      days.map((d) =>
        Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: d + 1,
            hour: r.hour,
            minute: r.minute,
          },
        }),
      ),
    );
  } catch (e) {
    console.warn('[reminders] could not schedule', e);
  }
}

export async function cancelHabitReminder(habitId: string) {
  if (!supported) return;
  try {
    await cancelForHabit(habitId);
  } catch {
    /* ignore */
  }
}

export async function cancelAllReminders() {
  if (!supported) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}
