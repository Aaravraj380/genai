/**
 * Cross-platform confirm dialog (RN's Alert has no buttons on web).
 * Usage: const [dialog, confirm] = useConfirm(); … confirm({...}).then(ok => …); render {dialog}.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText, Button } from './primitives';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}

export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const t = useTheme();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );

  const finish = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  const dialog = state ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => finish(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,6,8,0.7)', justifyContent: 'center', padding: 24 }}>
        <Animated.View
          entering={ZoomIn.duration(180)}
          accessibilityRole="alert"
          style={{
            backgroundColor: t.palette.surfaceElevated,
            borderRadius: t.radii.xl,
            borderWidth: 1,
            borderColor: t.palette.borderSubtle,
            padding: 22,
            gap: 12,
            width: '100%',
            maxWidth: 420,
            alignSelf: 'center',
          }}>
          <AppText variant="headlineSm">{state.title}</AppText>
          <AppText variant="bodyMd" color={t.palette.textSecondary}>
            {state.message}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button label="Cancel" tone="ghost" onPress={() => finish(false)} style={{ flex: 1 }} />
            <Button
              label={state.confirmLabel}
              tone={state.destructive ? 'flame' : 'primary'}
              onPress={() => finish(true)}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  ) : null;

  return [dialog, confirm];
}
