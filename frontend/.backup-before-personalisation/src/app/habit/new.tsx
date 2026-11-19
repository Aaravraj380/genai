/** Create a habit (modal). */
import { router } from 'expo-router';
import { View } from 'react-native';

import { StackHeader } from '@/components/chrome';
import { HabitForm } from '@/components/HabitForm';
import { useTodayKey } from '@/hooks/useTodayContext';
import { syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function NewHabitScreen() {
  const t = useTheme();
  const today = useTodayKey();
  const addHabit = useHabitStore((s) => s.addHabit);
  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title="New Habit" />
      <HabitForm
        mode="create"
        onSubmit={(input) => {
          const habit = addHabit(input, today);
          syncHabitReminder(habit, today);
          router.back();
        }}
      />
    </View>
  );
}
