/**
 * Cross-platform confirm dialog (RN's Alert has no buttons on web).
 * Usage: const [dialog, confirm, choose] = useConfirm();
 *   confirm({...}) → Promise<boolean>
 *   choose({..., altLabel}) → Promise<'confirm' | 'alt' | 'cancel'>  (three-way, e.g. Merge / Replace)
 * Render {dialog} once in the screen.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText, Button } from './primitives';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Optional middle action (makes it a three-way choice). */
  altLabel?: string;
}

type Choice = 'confirm' | 'alt' | 'cancel';

export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>, (o: ConfirmOptions) => Promise<Choice>] {
  const t = useTheme();
  const { t: tr } = useT();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: Choice) => void }) | null>(null);

  const choose = useCallback((o: ConfirmOptions) => new Promise<Choice>((resolve) => setState({ ...o, resolve })), []);
  const confirm = useCallback(
    (o: ConfirmOptions) => choose({ ...o, altLabel: undefined }).then((c) => c === 'confirm'),
    [choose],
  );

  const finish = (v: Choice) => {
    state?.resolve(v);
    setState(null);
  };

  const dialog = state ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => finish('cancel')}>
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
          {state.altLabel ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button label={state.altLabel} onPress={() => finish('alt')} />
              <Button label={state.confirmLabel} tone={state.destructive ? 'flame' : 'ghost'} onPress={() => finish('confirm')} />
              <Button label={tr('common.cancel')} tone="ghost" onPress={() => finish('cancel')} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button label={tr('common.cancel')} tone="ghost" onPress={() => finish('cancel')} style={{ flex: 1 }} />
              <Button
                label={state.confirmLabel}
                tone={state.destructive ? 'flame' : 'primary'}
                onPress={() => finish('confirm')}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  ) : null;

  return [dialog, confirm, choose];
}
