/**
 * "Account & sync" card in Settings, plus small pieces shared with the
 * Account screen (status line, error messages).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { useT, type StringKey } from '@/i18n';
import { cloudSync, useCloud } from '@/sync';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText, Button, Card, Icon } from './primitives';
import { SectionHeader } from './today';

type Translate = ReturnType<typeof useT>['t'];

/** Turns any login/sync failure into a friendly, translated sentence. */
export function describeError(e: unknown, tr: Translate, url: string): string {
  if (!(e instanceof ApiError)) return tr('acct.err.server');
  switch (e.kind) {
    case 'network':
      return tr('acct.err.network', { url });
    case 'rateLimited':
      return tr('acct.err.rateLimited', { n: e.retryAfter ?? 60 });
    case 'validation':
      return tr('acct.err.validation', { msg: e.message });
    default:
      return tr(`acct.err.${e.kind}` as StringKey);
  }
}

/** The current time, refreshed every 30 s so "2 min ago" stays true. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function SyncStatusLine() {
  const t = useTheme();
  const { t: tr } = useT();
  const { phase, pending, lastSyncedAt, error } = useCloud();
  const now = useNow();

  const color =
    phase === 'idle' ? t.palette.primary : phase === 'syncing' ? t.palette.tertiary : phase === 'signedOut' ? t.palette.textSecondary : t.palette.streakFire;
  const icon = phase === 'idle' ? 'cloud-done' : phase === 'syncing' ? 'sync' : phase === 'offline' ? 'cloud-off' : 'error-outline';
  const label =
    phase === 'error' ? tr('acct.status.error', { msg: error ?? '' }) : phase === 'signedOut' ? '' : tr(`acct.status.${phase}` as StringKey);

  let ago = '';
  if (lastSyncedAt) {
    const mins = Math.floor((now - new Date(lastSyncedAt).getTime()) / 60_000);
    ago =
      mins < 1
        ? tr('acct.justNow')
        : mins < 60
          ? tr('acct.minAgo', { n: mins })
          : new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={color} />
        <AppText variant="labelLg" color={color} style={{ flex: 1 }}>
          {label}
        </AppText>
      </View>
      {pending > 0 ? (
        <AppText variant="bodySm" color={t.palette.textSecondary}>
          {tr('acct.pending', { n: pending })}
        </AppText>
      ) : null}
      {ago ? (
        <AppText variant="bodySm" color={t.palette.textMuted}>
          {tr('acct.lastSync', { time: ago })}
        </AppText>
      ) : null}
    </View>
  );
}

export function AccountSection() {
  const t = useTheme();
  const { t: tr } = useT();
  const { ready, phase, user } = useCloud();
  if (!ready) return null;
  const loggedIn = !!user && phase !== 'expired';

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader icon="cloud-sync" iconColor={t.palette.primary} title={tr('acct.title')} />
      <Card style={{ gap: 12 }}>
        {user ? (
          <View style={{ gap: 2 }}>
            <AppText variant="labelLg">{user.name}</AppText>
            <AppText variant="bodySm" color={t.palette.textSecondary}>
              {tr('acct.signedInAs', { email: user.email })}
            </AppText>
          </View>
        ) : (
          <AppText variant="bodySm" color={t.palette.textSecondary}>
            {tr('acct.signedOutBody')}
          </AppText>
        )}
        {user ? <SyncStatusLine /> : null}
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {loggedIn ? (
            <>
              <Button label={tr('acct.syncNow')} icon="sync" size="sm" disabled={phase === 'syncing'} onPress={() => void cloudSync().syncNow()} />
              <Button label={tr('acct.manage')} icon="manage-accounts" tone="ghost" size="sm" onPress={() => router.push('/account')} />
            </>
          ) : (
            <Button label={phase === 'expired' ? tr('acct.login') : tr('acct.loginOrSignup')} icon="login" size="sm" onPress={() => router.push('/account')} />
          )}
        </View>
      </Card>
    </View>
  );
}
