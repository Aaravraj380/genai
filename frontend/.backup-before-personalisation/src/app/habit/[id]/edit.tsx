/** Edit / delete a habit (modal). */
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { StackHeader } from '@/components/chrome';
import { useConfirm } from '@/components/ConfirmDialog';
import { HabitForm } from '@/components/HabitForm';
import { AppText } from '@/components/primitives';
import { useTodayKey } from '@/hooks/useTodayContext';
import { cancelHabitReminder, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditHabitScreen() {
  const t = useTheme();
  const today = useTodayKey();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);
  const [dialog, confirm] = useConfirm();

  if (!habit) {
    return (
      <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
        <StackHeader title="Edit Habit" />
        <AppText style={{ padding: 16 }}>This habit no longer exists.</AppText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title="Edit Habit" />
      <HabitForm
        mode="edit"
        initial={habit}
        onSubmit={(input) => {
          updateHabit(habit.id, input);
          syncHabitReminder({ ...habit, ...input }, today);
          router.back();
        }}
        onDelete={async () => {
          const ok = await confirm({
            title: `Delete “${habit.title}”?`,
            message: 'Its streaks and full history will be removed from this device. This cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          await cancelHabitReminder(habit.id);
          router.dismissTo('/');
          // Delete after navigating away so the detail screen never renders a missing habit.
          setTimeout(() => deleteHabit(habit.id), 0);
        }}
      />
      {dialog}
    </View>
  );
}
