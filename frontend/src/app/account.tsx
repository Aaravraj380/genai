/**
 * Account — log in / sign up (optional), server address, sync status,
 * log out and account deletion. The app keeps working without an account.
 */
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError, SyncStatusLine } from '@/components/AccountSection';
import { SegmentedControl } from '@/components/animated';
import { StackHeader } from '@/components/chrome';
import { useConfirm } from '@/components/ConfirmDialog';
import { AppText, Button, Card, Icon, IconButton } from '@/components/primitives';
import { useToast } from '@/components/Toast';
import { SectionHeader } from '@/components/today';
import { useT } from '@/i18n';
import { haptic } from '@/services/haptics';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cloudSync, useCloud } from '@/sync';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

type Mode = 'login' | 'signup';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

export default function AccountScreen() {
  const t = useTheme();
  const { t: tr } = useT();
  const insets = useSafeAreaInsets();
  const { gutter, maxContentWidth } = useLayout();
  const cloud = useCloud();
  const [toast, flash] = useToast();
  const [dialog, confirm, choose] = useConfirm();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(cloud.user?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [server, setServer] = useState(cloud.apiUrl);
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const loggedIn = !!cloud.user && cloud.phase !== 'expired';

  const input = [
    t.typography.bodyMd,
    {
      color: t.palette.textPrimary,
      backgroundColor: t.palette.surfaceContainer,
      borderRadius: t.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      outlineStyle: 'none',
    } as object,
  ];

  const testServer = async () => {
    setServerMsg(null);
    setBusy(true);
    try {
      const h = await cloudSync().checkServer(server);
      await cloudSync().setApiUrl(server);
      setServerMsg({ ok: true, text: tr('acct.serverOk', { version: h.version }) });
    } catch (e) {
      setServerMsg({ ok: false, text: describeError(e, tr, server) });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (mode === 'signup' && !name.trim()) return setError(tr('acct.err.name'));
    if (!EMAIL_RE.test(email.trim())) return setError(tr('acct.err.email'));
    if (mode === 'signup' ? !strongEnough(password) : !password) return setError(tr('acct.err.password'));
    setBusy(true);
    try {
      await cloudSync().setApiUrl(server);
      const user =
        mode === 'signup'
          ? await cloudSync().signup(server, name, email, password)
          : await cloudSync().login(server, email, password);
      setPassword('');
      // Use the account name for the greeting if the profile has no name yet.
      if (!useSettingsStore.getState().profileName.trim()) useSettingsStore.getState().setProfileName(user.name);
      haptic.success();
      flash(tr('acct.welcome', { name: user.name }));
    } catch (e) {
      haptic.warning();
      setError(describeError(e, tr, server));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    const choice = await choose({
      title: tr('acct.logoutTitle'),
      message: tr('acct.logoutBody'),
      altLabel: tr('acct.keepData'),
      confirmLabel: tr('acct.removeData'),
      destructive: true,
    });
    if (choice === 'cancel') return;
    setBusy(true);
    try {
      const { unsent } = await cloudSync().logout({ keepData: choice === 'alt' });
      flash(unsent ? tr('acct.logoutUnsent', { n: unsent }) : tr('acct.loggedOut'));
      setEmail('');
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirm({ title: tr('acct.deleteTitle'), message: tr('acct.deleteBody'), confirmLabel: tr('common.delete'), destructive: true });
    if (!ok) return;
    setBusy(true);
    try {
      await cloudSync().deleteAccount(deletePassword);
      setDeletePassword('');
      flash(tr('acct.deleted'));
    } catch (e) {
      haptic.warning();
      flash(describeError(e, tr, cloud.apiUrl));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title={tr('acct.title')} right={<View style={{ width: 44 }} />} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 40, gap: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        {loggedIn && cloud.user ? (
          <>
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="account-circle" size={40} color={t.palette.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="headlineSm">{cloud.user.name}</AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    {cloud.user.email}
                  </AppText>
                </View>
              </View>
              <SyncStatusLine />
              <AppText variant="bodySm" color={t.palette.textMuted}>
                {tr('acct.server')}: {cloud.apiUrl}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Button label={tr('acct.syncNow')} icon="sync" size="sm" disabled={busy || cloud.phase === 'syncing'} onPress={() => void cloudSync().syncNow()} />
                <Button label={tr('acct.logout')} icon="logout" tone="ghost" size="sm" disabled={busy} onPress={logout} />
              </View>
            </Card>

            <View style={{ gap: 10 }}>
              <SectionHeader icon="delete-forever" iconColor={t.palette.streakFire} title={tr('acct.dangerZone')} />
              <Card style={{ gap: 12 }}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {tr('acct.deleteHelp')}
                </AppText>
                <TextInput
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder={tr('acct.password')}
                  placeholderTextColor={t.palette.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  accessibilityLabel={tr('acct.password')}
                  style={input}
                />
                <Button label={tr('acct.deleteAccount')} icon="delete-forever" tone="flame" size="sm" disabled={busy || !deletePassword} onPress={deleteAccount} />
              </Card>
            </View>
          </>
        ) : (
          <>
            {cloud.phase === 'expired' ? (
              <Card style={{ gap: 6 }}>
                <SyncStatusLine />
              </Card>
            ) : (
              <AppText variant="bodyMd" color={t.palette.textSecondary}>
                {tr('acct.signedOutBody')}
              </AppText>
            )}

            <Card style={{ gap: 14 }}>
              <SegmentedControl<Mode>
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                }}
                options={[
                  { value: 'login', label: tr('acct.login') },
                  { value: 'signup', label: tr('acct.signup') },
                ]}
              />
              {mode === 'signup' ? (
                <Field label={tr('acct.name')}>
                  <TextInput
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      setError(null);
                    }}
                    maxLength={40}
                    autoComplete="name"
                    textContentType="name"
                    accessibilityLabel={tr('acct.name')}
                    style={input}
                  />
                </Field>
              ) : null}
              <Field label={tr('acct.email')}>
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                      setEmail(v);
                      setError(null);
                    }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  maxLength={254}
                  accessibilityLabel={tr('acct.email')}
                  style={input}
                />
              </Field>
              <Field label={tr('acct.password')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setError(null);
                    }}
                    onSubmitEditing={submit}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                    maxLength={128}
                    accessibilityLabel={tr('acct.password')}
                    style={[...input, { flex: 1 }]}
                  />
                  <IconButton
                    icon={showPassword ? 'visibility-off' : 'visibility'}
                    label={showPassword ? tr('acct.hidePassword') : tr('acct.showPassword')}
                    size={40}
                    onPress={() => setShowPassword((v) => !v)}
                  />
                </View>
                {mode === 'signup' ? (
                  <AppText variant="bodySm" color={t.palette.textMuted}>
                    {tr('acct.passwordHint')}
                  </AppText>
                ) : null}
              </Field>
              {error ? (
                <AppText variant="bodySm" color={t.palette.streakFire} accessibilityRole="alert">
                  {error}
                </AppText>
              ) : null}
              <Button
                label={busy ? '…' : mode === 'signup' ? tr('acct.signup') : tr('acct.login')}
                icon={mode === 'signup' ? 'person-add' : 'login'}
                disabled={busy}
                onPress={submit}
              />
              <AppText variant="bodySm" color={t.palette.textMuted}>
                {tr('acct.mergeNote')}
              </AppText>
            </Card>

            <View style={{ gap: 10 }}>
              <SectionHeader icon="dns" iconColor={t.palette.tertiary} title={tr('acct.server')} />
              <Card style={{ gap: 12 }}>
                <AppText variant="bodySm" color={t.palette.textSecondary}>
                  {tr('acct.serverHelp')}
                </AppText>
                <TextInput
                  value={server}
                  onChangeText={(v) => {
                    setServer(v);
                    setServerMsg(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel={tr('acct.server')}
                  style={input}
                />
                {serverMsg ? (
                  <AppText variant="bodySm" color={serverMsg.ok ? t.palette.primary : t.palette.streakFire}>
                    {serverMsg.text}
                  </AppText>
                ) : null}
                <Button label={tr('acct.testServer')} icon="wifi-tethering" tone="ghost" size="sm" disabled={busy || !server.trim()} onPress={testServer} />
              </Card>
            </View>
          </>
        )}
      </ScrollView>
      {dialog}
      {toast}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="labelSm" color={t.palette.textSecondary} uppercase>
        {label}
      </AppText>
      {children}
    </View>
  );
}
