/** Edit / delete a habit (modal). */
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { StackHeader } from '@/components/chrome';
import { useConfirm } from '@/components/ConfirmDialog';
import { HabitForm } from '@/components/HabitForm';
import { AppText } from '@/components/primitives';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT } from '@/i18n';
import { cancelHabitReminder, syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditHabitScreen() {
  const t = useTheme();
  const { t: tr } = useT();
  const today = useTodayKey();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);
  const [dialog, confirm] = useConfirm();

  if (!habit) {
    return (
      <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
        <StackHeader title={tr('form.editHabit')} />
        <AppText style={{ padding: 16 }}>{tr('form.gone')}</AppText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title={tr('form.editHabit')} />
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
            title: tr('detail.deleteTitle', { title: habit.title }),
            message: tr('detail.deleteBody'),
            confirmLabel: tr('common.delete'),
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
