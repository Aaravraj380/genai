/**
 * Account sync engine (optional — the app works fully without logging in).
 *
 *   • This device's SQLite stays the source of truth for the UI, so the app is
 *     instant and works offline exactly as before.
 *   • While logged in, every change also becomes a small operation in the
 *     offline queue (outbox) and is pushed to the FastAPI server in order.
 *   • `syncNow()` pushes the queue, then pulls the account so changes made on
 *     other devices (phone ↔ web) show up here.
 *   • Logging in merges this device's data with the account (nothing is lost).
 */
import { create } from 'zustand';

import { ApiError, createApiClient, normalizeBaseUrl, type ApiClient, type ApiErrorKind } from '@/api/client';
import type { ApiUser, SnapshotDto, SyncedSettings } from '@/api/types';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore, type SettingsValues } from '@/store/useSettingsStore';

import { diffToOps, fromSnapshotDto, settingsOp, SYNCED_SETTINGS, toSnapshotDto } from './ops';
import type { Outbox } from './outbox';

/* ------------------------------------------------------------------ */
/* Public status (read by the UI)                                      */
/* ------------------------------------------------------------------ */

export type CloudPhase =
  | 'signedOut'
  | 'idle' // logged in, everything sent
  | 'syncing'
  | 'offline' // server unreachable — changes wait in the queue
  | 'expired' // token no longer valid — log in again (queue is kept)
  | 'error';

export interface CloudStatus {
  ready: boolean;
  phase: CloudPhase;
  apiUrl: string;
  user: ApiUser | null;
  pending: number;
  lastSyncedAt: string | null;
  errorKind: ApiErrorKind | null;
  error: string | null;
}

export const useCloud = create<CloudStatus>(() => ({
  ready: false,
  phase: 'signedOut',
  apiUrl: '',
  user: null,
  pending: 0,
  lastSyncedAt: null,
  errorKind: null,
  error: null,
}));

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}

interface StoredAccount {
  apiUrl: string;
  token: string | null;
  user: ApiUser | null;
}

export interface CloudSyncOptions {
  outbox: Outbox;
  meta: KeyValueStore;
  defaultApiUrl: string;
  fetchImpl?: typeof fetch;
  /** Called after changes from the server were applied (e.g. to reschedule reminders). */
  onRemoteChange?: () => void;
  /** Debounce before pushing local changes (ms). */
  pushDelayMs?: number;
}

const ACCOUNT_KEY = 'cloud_account';
const LAST_USER_KEY = 'cloud_last_user';
const LAST_SYNC_KEY = 'cloud_last_synced';
const BATCH = 200;

export class CloudSync {
  private account: StoredAccount;
  private applyingRemote = false;
  private localChanges = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private unsubs: (() => void)[] = [];

  constructor(private opts: CloudSyncOptions) {
    this.account = { apiUrl: opts.defaultApiUrl, token: null, user: null };
  }

  /** Has a valid login (changes can be sent). */
  get signedIn() {
    return !!this.account.token;
  }

  /** Changes are queued while logged in — and also while a session has expired, so nothing is lost before logging in again. */
  private get queuing() {
    return !!this.account.user;
  }

  private client(token = this.account.token, apiUrl = this.account.apiUrl): ApiClient {
    return createApiClient({ baseUrl: apiUrl, token, fetchImpl: this.opts.fetchImpl });
  }

  /** Load the saved login and start listening for changes. */
  async init(): Promise<void> {
    try {
      const raw = await this.opts.meta.get(ACCOUNT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<StoredAccount>;
        this.account = {
          apiUrl: saved.apiUrl || this.opts.defaultApiUrl,
          token: saved.token ?? null,
          user: saved.user ?? null,
        };
      }
    } catch {
      /* corrupt entry → behave as signed out */
    }
    const lastSyncedAt = await this.opts.meta.get(LAST_SYNC_KEY).catch(() => null);
    useCloud.setState({
      ready: true,
      apiUrl: this.account.apiUrl,
      user: this.account.user,
      phase: this.account.token ? 'idle' : this.account.user ? 'expired' : 'signedOut',
      lastSyncedAt,
      pending: await this.opts.outbox.count(),
    });

    this.unsubs.push(
      useHabitStore.subscribe((next, prev) => {
        if (this.applyingRemote || !this.queuing) return;
        this.enqueue(diffToOps(prev, next));
      }),
      useSettingsStore.subscribe((next, prev) => {
        if (this.applyingRemote || !this.queuing) return;
        const op = settingsOp(prev, next);
        if (op) this.enqueue([op]);
      }),
    );
  }

  dispose() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** Resolves when queued writes and any running sync have finished (tests). */
  async idle(): Promise<void> {
    await this.chain;
    if (this.running) await this.running;
  }

  /* ---------------- queue ---------------- */

  private enqueue(ops: Parameters<Outbox['add']>[0]) {
    if (!ops.length) return;
    this.localChanges++;
    this.chain = this.chain
      .then(() => this.opts.outbox.add(ops))
      .then(async () => useCloud.setState({ pending: await this.opts.outbox.count() }))
      .catch((e) => console.warn('[sync] could not queue change', e));
    this.schedulePush();
  }

  private schedulePush(delay = this.opts.pushDelayMs ?? 700) {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.run(() => this.pushQueue());
    }, delay);
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.failures, 5));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  /** Runs one sync task at a time. */
  private run(task: () => Promise<void>): Promise<void> {
    const prev = this.running ?? Promise.resolve();
    const next = prev.then(async () => {
      await this.chain; // make sure queued changes are in the outbox first
      if (!this.signedIn) return;
      try {
        await task();
        this.failures = 0;
      } catch (e) {
        this.handleError(e);
      }
    });
    const tracked: Promise<void> = next.finally(() => {
      if (this.running === tracked) this.running = null;
    });
    this.running = tracked;
    return tracked;
  }

  private handleError(e: unknown) {
    const err = e instanceof ApiError ? e : new ApiError('network', String(e));
    if (err.kind === 'unauthorized') {
      // Keep the queue and the user's email; they just need to log in again.
      this.account = { ...this.account, token: null };
      void this.saveAccount();
      useCloud.setState({ phase: 'expired', errorKind: err.kind, error: err.message });
      return;
    }
    this.failures++;
    const offline = err.kind === 'network' || err.kind === 'timeout' || err.kind === 'server';
    useCloud.setState({ phase: offline ? 'offline' : 'error', errorKind: err.kind, error: err.message });
    if (offline) this.scheduleRetry();
  }

  /** Send everything in the outbox, oldest first. */
  private async pushQueue(): Promise<void> {
    const outbox = this.opts.outbox;
    if ((await outbox.count()) === 0) return;
    useCloud.setState({ phase: 'syncing' });
    const api = this.client();
    for (;;) {
      const batch = await outbox.peek(BATCH);
      if (!batch.length) break;
      try {
        await api.push(batch.map((b) => b.op));
        await outbox.remove(batch[batch.length - 1].id);
      } catch (e) {
        if (!(e instanceof ApiError) || e.kind !== 'validation') throw e;
        // The server refused something in this batch (e.g. data from a much older app version).
        // Send the changes one by one and drop only the ones it refuses, so the queue never gets stuck.
        for (const item of batch) {
          try {
            await api.push([item.op]);
          } catch (inner) {
            if (!(inner instanceof ApiError) || inner.kind !== 'validation') throw inner;
            console.warn('[sync] server rejected a change; dropping it', item.op, inner.message);
          }
          await outbox.removeOne(item.id);
        }
      }
      useCloud.setState({ pending: await outbox.count() });
    }
    useCloud.setState({ phase: 'idle', errorKind: null, error: null, pending: await outbox.count() });
  }

  /** Download the account and show it here — unless something changed locally meanwhile. */
  private async pullAndApply(): Promise<void> {
    const before = this.localChanges;
    useCloud.setState({ phase: 'syncing' });
    const snap = await this.client().pull();
    await this.chain;
    if (this.localChanges !== before || (await this.opts.outbox.count()) > 0) {
      // A change was made while downloading; push it first, the next sync will pull again.
      useCloud.setState({ phase: 'idle' });
      this.schedulePush(0);
      return;
    }
    this.applySnapshot(snap);
    await this.markSynced();
  }

  private async markSynced() {
    const now = new Date().toISOString();
    await this.opts.meta.set(LAST_SYNC_KEY, now).catch(() => undefined);
    useCloud.setState({ phase: 'idle', lastSyncedAt: now, errorKind: null, error: null, pending: await this.opts.outbox.count() });
  }

  /** Replace local data with the server's, without echoing it back to the server. */
  private applySnapshot(snap: SnapshotDto) {
    this.applyingRemote = true;
    let changed = false;
    try {
      const { habits, logs } = useHabitStore.getState();
      const next = fromSnapshotDto(snap, { habits, logs });
      if (next.changed) {
        useHabitStore.setState({ habits: next.habits, logs: next.logs });
        changed = true;
      }
      const patch = remoteSettingsPatch(snap.settings, useSettingsStore.getState());
      if (Object.keys(patch).length) useSettingsStore.setState(patch);
    } finally {
      this.applyingRemote = false;
    }
    if (changed) this.opts.onRemoteChange?.();
  }

  /* ---------------- public actions ---------------- */

  /** Push pending changes, then pull the latest from the account. */
  syncNow(): Promise<void> {
    if (!this.signedIn) return Promise.resolve();
    return this.run(async () => {
      await this.pushQueue();
      if ((await this.opts.outbox.count()) === 0) await this.pullAndApply();
    });
  }

  /** Checks an address before logging in (throws ApiError). */
  async checkServer(apiUrl: string) {
    return this.client(null, apiUrl).health();
  }

  async login(apiUrl: string, email: string, password: string) {
    return this.authenticate(apiUrl, (api) => api.login(email.trim(), password));
  }

  async signup(apiUrl: string, name: string, email: string, password: string) {
    return this.authenticate(apiUrl, (api) => api.signup(email.trim(), password, name.trim()));
  }

  private async authenticate(apiUrl: string, call: (api: ApiClient) => ReturnType<ApiClient['login']>) {
    const url = normalizeBaseUrl(apiUrl) || this.opts.defaultApiUrl;
    const auth = await call(this.client(null, url));
    const api = this.client(auth.accessToken, url);

    // Same account as before (e.g. the session had expired): send what was queued while away first,
    // so deletions made offline are not undone by the merge. A different account starts clean.
    await this.chain;
    const lastUser = await this.opts.meta.get(LAST_USER_KEY).catch(() => null);
    const outbox = this.opts.outbox;
    if (lastUser === String(auth.user.id)) {
      for (let batch = await outbox.peek(BATCH); batch.length; batch = await outbox.peek(BATCH)) {
        await api.push(batch.map((b) => b.op)).catch((e) => {
          if (!(e instanceof ApiError) || e.kind !== 'validation') throw e;
        });
        await outbox.remove(batch[batch.length - 1].id);
      }
    }
    await outbox.clear();

    // Combine this device's data with the account; nothing on either side is lost.
    const { habits, logs } = useHabitStore.getState();
    const merged = await api.merge(toSnapshotDto({ habits, logs }, useSettingsStore.getState()));
    this.applySnapshot(merged);

    this.account = { apiUrl: url, token: auth.accessToken, user: auth.user };
    await this.saveAccount();
    await this.opts.meta.set(LAST_USER_KEY, String(auth.user.id)).catch(() => undefined);
    useCloud.setState({ apiUrl: url, user: auth.user });
    await this.markSynced();
    return auth.user;
  }

  /**
   * Log out. Pending changes are sent first when possible.
   * `keepData: false` also removes the habits from this device.
   */
  async logout({ keepData }: { keepData: boolean }): Promise<{ unsent: number }> {
    if (this.signedIn && useCloud.getState().phase !== 'offline') {
      await this.run(() => this.pushQueue());
    }
    await this.chain;
    const unsent = await this.opts.outbox.count();
    await this.opts.outbox.clear();
    this.account = { apiUrl: this.account.apiUrl, token: null, user: null };
    await this.saveAccount();
    await this.opts.meta.set(LAST_SYNC_KEY, null).catch(() => undefined);
    if (!keepData) {
      this.applyingRemote = true;
      try {
        useHabitStore.getState().resetAll();
      } finally {
        this.applyingRemote = false;
      }
      this.opts.onRemoteChange?.();
    }
    useCloud.setState({ phase: 'signedOut', user: null, pending: 0, lastSyncedAt: null, errorKind: null, error: null });
    return { unsent };
  }

  /** Permanently delete the account on the server. Data on this device is kept. */
  async deleteAccount(password: string): Promise<void> {
    await this.client().deleteAccount(password);
    await this.opts.meta.set(LAST_USER_KEY, null).catch(() => undefined);
    await this.logout({ keepData: true });
  }

  /** Change the server address (only while logged out). */
  async setApiUrl(apiUrl: string) {
    const url = normalizeBaseUrl(apiUrl) || this.opts.defaultApiUrl;
    this.account = { ...this.account, apiUrl: url };
    await this.saveAccount();
    useCloud.setState({ apiUrl: url });
  }

  private async saveAccount() {
    await this.opts.meta.set(ACCOUNT_KEY, JSON.stringify(this.account)).catch(() => undefined);
  }
}

/** Which settings from the server differ from this device's. */
export function remoteSettingsPatch(remote: SyncedSettings | undefined, local: Partial<SettingsValues>): Partial<SettingsValues> {
  const patch: Record<string, unknown> = {};
  if (!remote) return patch;
  for (const k of SYNCED_SETTINGS) {
    const v = remote[k];
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(local[k])) patch[k] = v;
  }
  return patch as Partial<SettingsValues>;
}
