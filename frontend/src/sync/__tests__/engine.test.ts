/**
 * End-to-end tests of account sync against the REAL FastAPI backend
 * (started from ../backend on a random port with a temporary database).
 *
 * Skipped automatically if the backend's virtual environment isn't set up
 * (see backend/README.md → "Set up").
 */
import { ApiError, createApiClient } from '@/api/client';
import type { SyncOp } from '@/api/types';
import { useHabitStore, type HabitInput } from '@/store/useHabitStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';

import { CloudSync, useCloud, type KeyValueStore } from '../engine';
import { memoryOutbox, type Outbox } from '../outbox';
import { findPython, nodeFetch, startServer, type LiveServer } from './liveServer';

jest.mock('expo-sqlite', () => ({}));
jest.setTimeout(30_000);

const d = findPython() ? describe : describe.skip;
const TODAY = new Date().toISOString().slice(0, 10);
const input: HabitInput = { title: 'Read', icon: 'reading', category: 'Learning', color: '#4EDEA3', frequency: { type: 'daily' }, targetPerDay: 2 };

let server: LiveServer;
let emailNo = 0;
const newEmail = () => `user${Date.now()}-${++emailNo}@example.com`;

/** Lets tests cut the network, or run code while a request is in flight. */
const net = { offline: false, beforeResponse: null as null | ((url: string, method: string) => void) };
const flakyFetch: typeof fetch = async (input, init) => {
  if (net.offline) throw new TypeError('Network request failed');
  const res = await nodeFetch(input, init);
  net.beforeResponse?.(String(input), init?.method ?? 'GET');
  return res;
};

function memoryKV(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}

let engine: CloudSync;
let outbox: Outbox;
let meta: ReturnType<typeof memoryKV>;
let remoteChanges = 0;

async function newEngine(keepStorage = false) {
  engine?.dispose();
  if (!keepStorage) {
    outbox = memoryOutbox();
    meta = memoryKV();
  }
  engine = new CloudSync({ outbox, meta, defaultApiUrl: server.url, fetchImpl: flakyFetch, pushDelayMs: 0, onRemoteChange: () => remoteChanges++ });
  await engine.init();
  return engine;
}

/** Wait for debounced pushes and running syncs to finish. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await engine.idle();
  }
}

/** A second device: talks to the API directly. */
async function otherDevice(email: string, password = 'secret123') {
  const auth = await createApiClient({ baseUrl: server.url, fetchImpl: nodeFetch }).login(email, password);
  return createApiClient({ baseUrl: server.url, token: auth.accessToken, fetchImpl: nodeFetch });
}

const s = useHabitStore.getState;

d('account sync with the FastAPI backend', () => {
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    engine?.dispose();
    await server?.stop();
  });
  beforeEach(async () => {
    net.offline = false;
    net.beforeResponse = null;
    remoteChanges = 0;
    useHabitStore.setState({ habits: [], logs: {}, lastActiveDate: null });
    useSettingsStore.setState({ ...DEFAULT_SETTINGS });
    useCloud.setState({ phase: 'signedOut', user: null, pending: 0, lastSyncedAt: null, error: null, errorKind: null });
    await newEngine();
  });

  it('works signed-out exactly as before: nothing is queued or sent', async () => {
    s().addHabit(input, TODAY);
    await settle();
    expect(await outbox.count()).toBe(0);
    expect(useCloud.getState().phase).toBe('signedOut');
  });

  it('sign-up uploads the habits already on this device', async () => {
    const h = s().addHabit(input, TODAY);
    s().tapHabit(h.id, TODAY, TODAY);
    useSettingsStore.getState().setLanguage('hi');
    const email = newEmail();

    const user = await engine.signup(server.url, 'Aarav', email, 'secret123');
    expect(user.email).toBe(email);
    expect(useCloud.getState()).toMatchObject({ phase: 'idle', pending: 0, user: { name: 'Aarav' } });
    expect(useCloud.getState().lastSyncedAt).not.toBeNull();

    const remote = await (await otherDevice(email)).pull();
    expect(remote.habits.map((x) => x.title)).toEqual(['Read']);
    expect(remote.logs[h.id].completions).toEqual({ [TODAY]: 1 });
    expect(remote.settings.language).toBe('hi');
  });

  it('pushes every change while logged in, in order', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    const h = s().addHabit(input, addDays(TODAY, -5));
    s().tapHabit(h.id, TODAY, TODAY);
    s().tapHabit(h.id, TODAY, TODAY);
    s().updateHabit(h.id, { title: 'Read 20 pages', reminder: { enabled: true, hour: 21, minute: 0, message: 'Book time' } });
    expect(s().freezeDay(h.id, addDays(TODAY, -1), TODAY)).toBe(true);
    useSettingsStore.getState().addCategory('Family');
    await settle();

    expect(await outbox.count()).toBe(0);
    const remote = await (await otherDevice(email)).pull();
    expect(remote.habits[0]).toMatchObject({ title: 'Read 20 pages', reminder: { enabled: true, hour: 21, minute: 0, message: 'Book time' } });
    expect(remote.logs[h.id]).toEqual({ completions: { [TODAY]: 2 }, frozen: { [addDays(TODAY, -1)]: true } });
    expect(remote.settings.customCategories).toEqual(['Family']);

    s().deleteHabit(h.id);
    await settle();
    expect((await (await otherDevice(email)).pull()).habits).toEqual([]);
  });

  it('shows changes made on another device, without echoing them back', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    const web = await otherDevice(email);
    const ops: SyncOp[] = [
      { type: 'upsertHabit', habit: { id: 'from-web', title: 'Yoga', frequency: { type: 'weekdays' }, creationDate: TODAY, createdAt: new Date().toISOString(), icon: 'mind', color: '#FFB4AB', category: 'Health', targetPerDay: 1, pauses: [], sortOrder: 0 } },
      { type: 'setCompletion', habitId: 'from-web', date: TODAY, count: 1 },
      { type: 'setSettings', settings: { theme: 'light' } },
    ];
    await web.push(ops);

    await engine.syncNow();
    expect(s().habits.map((h) => h.title)).toEqual(['Yoga']);
    expect(s().logs['from-web'].completions).toEqual({ [TODAY]: 1 });
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(remoteChanges).toBe(1); // reminders get rescheduled
    await settle();
    expect(await outbox.count()).toBe(0); // nothing echoed back

    const before = s().habits;
    await engine.syncNow(); // nothing new → nothing touched
    expect(s().habits).toBe(before);
  });

  it('keeps changes made offline and sends them when the server is back', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    net.offline = true;
    const h = s().addHabit(input, TODAY);
    s().tapHabit(h.id, TODAY, TODAY);
    await settle();
    expect(useCloud.getState().phase).toBe('offline');
    expect(useCloud.getState().pending).toBe(2);
    expect(s().habits).toHaveLength(1); // the app keeps working

    net.offline = false;
    await engine.syncNow();
    expect(useCloud.getState()).toMatchObject({ phase: 'idle', pending: 0 });
    expect((await (await otherDevice(email)).pull()).logs[h.id].completions).toEqual({ [TODAY]: 1 });
  });

  it('survives an app restart with changes still queued', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    net.offline = true;
    s().addHabit(input, TODAY);
    await settle();
    expect(await outbox.count()).toBe(1);

    net.offline = false;
    await newEngine(true); // same outbox + saved login, like reopening the app
    expect(useCloud.getState()).toMatchObject({ phase: 'idle', user: { email } });
    await engine.syncNow();
    expect((await (await otherDevice(email)).pull()).habits).toHaveLength(1);
  });

  it('does not overwrite a change made while downloading', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    const h = s().addHabit(input, TODAY);
    await settle();
    let done = false;
    net.beforeResponse = (url, method) => {
      if (method === 'GET' && url.endsWith('/sync') && !done) {
        done = true;
        s().tapHabit(h.id, TODAY, TODAY); // user taps while the pull is in flight
      }
    };
    await engine.syncNow();
    expect(s().logs[h.id].completions).toEqual({ [TODAY]: 1 });
    net.beforeResponse = null;
    await settle();
    await engine.syncNow();
    expect(s().logs[h.id].completions).toEqual({ [TODAY]: 1 });
    expect((await (await otherDevice(email)).pull()).logs[h.id].completions).toEqual({ [TODAY]: 1 });
  });

  it('drops a change the server refuses instead of getting stuck', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    const h = s().addHabit(input, TODAY);
    await settle();
    await outbox.add([
      { type: 'setCompletion', habitId: h.id, date: '2999-01-01', count: 1 }, // future: refused
      { type: 'setCompletion', habitId: h.id, date: TODAY, count: 2 },
    ]);
    await engine.syncNow();
    expect(await outbox.count()).toBe(0);
    expect(useCloud.getState().phase).toBe('idle');
    expect((await (await otherDevice(email)).pull()).logs[h.id].completions).toEqual({ [TODAY]: 2 });
  });

  it('logging in on a second device merges both sides', async () => {
    const email = newEmail();
    const web = createApiClient({ baseUrl: server.url, fetchImpl: nodeFetch });
    const auth = await web.signup(email, 'secret123', 'A');
    const webAuthed = createApiClient({ baseUrl: server.url, token: auth.accessToken, fetchImpl: nodeFetch });
    await webAuthed.push([
      { type: 'upsertHabit', habit: { id: 'web', title: 'Web habit', frequency: { type: 'daily' }, creationDate: TODAY, createdAt: 'x', icon: 'run', color: '#4EDEA3', category: 'Fitness', targetPerDay: 1, pauses: [] } },
    ]);

    const local = s().addHabit(input, TODAY);
    await engine.login(server.url, email.toUpperCase(), 'secret123');
    expect(s().habits.map((h) => h.id).sort()).toEqual([local.id, 'web'].sort());
    expect((await webAuthed.pull()).habits).toHaveLength(2);
  });

  it('wrong password, duplicate email and bad addresses give clear errors', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    await engine.logout({ keepData: true });

    await expect(engine.login(server.url, email, 'wrong-pass1')).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(engine.signup(server.url, 'B', email, 'secret123')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(engine.signup(server.url, 'B', newEmail(), 'short')).rejects.toMatchObject({ kind: 'validation' });
    await expect(engine.checkServer('http://127.0.0.1:1')).rejects.toMatchObject({ kind: 'network' });
    await expect(engine.checkServer(server.url)).resolves.toMatchObject({ app: 'focus-flow' });
    expect(useCloud.getState().phase).toBe('signedOut');
  });

  it('an expired session keeps queueing; logging in again sends it without undoing deletions', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    const keep = s().addHabit(input, TODAY);
    const gone = s().addHabit({ ...input, title: 'Delete me' }, TODAY);
    await settle();

    // "Log out everywhere" on another device → this device's token stops working.
    const fresh = await createApiClient({ baseUrl: server.url, fetchImpl: nodeFetch }).login(email, 'secret123');
    await nodeFetch(`${server.url}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${fresh.accessToken}` } });

    s().deleteHabit(gone.id);
    await settle();
    expect(useCloud.getState().phase).toBe('expired');
    expect(useCloud.getState().user?.email).toBe(email);
    s().tapHabit(keep.id, TODAY, TODAY); // still queued while expired
    await settle();
    expect(await outbox.count()).toBeGreaterThanOrEqual(2);

    await engine.login(server.url, email, 'secret123');
    expect(s().habits.map((h) => h.id)).toEqual([keep.id]); // the deleted habit did not come back
    const remote = await (await otherDevice(email)).pull();
    expect(remote.habits.map((h) => h.id)).toEqual([keep.id]);
    expect(remote.logs[keep.id].completions).toEqual({ [TODAY]: 1 });
  });

  it('log out keeps or removes the data on this device, as chosen', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    s().addHabit(input, TODAY);
    await settle();

    await engine.logout({ keepData: true });
    expect(s().habits).toHaveLength(1);
    expect(useCloud.getState()).toMatchObject({ phase: 'signedOut', user: null });
    s().addHabit({ ...input, title: 'Offline only' }, TODAY);
    await settle();
    expect(await outbox.count()).toBe(0); // signed out: nothing queued

    await engine.login(server.url, email, 'secret123');
    await engine.logout({ keepData: false });
    expect(s().habits).toHaveLength(0);
    // …but the account still has everything.
    expect((await (await otherDevice(email)).pull()).habits).toHaveLength(2);
  });

  it('deleting the account removes it from the server but keeps this device’s habits', async () => {
    const email = newEmail();
    await engine.signup(server.url, 'A', email, 'secret123');
    s().addHabit(input, TODAY);
    await settle();
    await expect(engine.deleteAccount('wrong-pass1')).rejects.toBeInstanceOf(ApiError);
    await engine.deleteAccount('secret123');
    expect(useCloud.getState().phase).toBe('signedOut');
    expect(s().habits).toHaveLength(1);
    await expect(otherDevice(email)).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});

function addDays(key: string, n: number) {
  const dt = new Date(`${key}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
