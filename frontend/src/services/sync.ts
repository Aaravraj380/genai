/**
 * Merge rules shared by backups and account sync.
 *
 * (Account sync itself lives in src/sync — it talks to the FastAPI backend.
 * The `SyncAdapter` seam below is kept for anyone who wants a different
 * cloud, e.g. Firebase.) The merge is conflict-free for logs because
 * completions only ever move towards "more done" and days are calendar keys,
 * not timestamps — two devices in different time zones can't disagree about
 * which day a check-off belongs to.
 */
import type { Habit, HabitLog } from '@/domain/types';

export interface Snapshot {
  habits: Habit[];
  logs: Record<string, HabitLog>;
}

export interface SyncAdapter {
  pull(): Promise<Snapshot | null>;
  push(snapshot: Snapshot): Promise<void>;
}

/** Merge two logs: highest count per day wins; freezes are unioned unless the day is now complete. */
export function mergeLogs(a: HabitLog, b: HabitLog, target: number): HabitLog {
  const completions = { ...a.completions };
  for (const [k, v] of Object.entries(b.completions)) completions[k] = Math.max(completions[k] ?? 0, v);
  const frozen = { ...a.frozen, ...b.frozen };
  for (const k of Object.keys(frozen)) if ((completions[k] ?? 0) >= target) delete frozen[k];
  return { completions, frozen };
}

/** Merge snapshots. Habits are unioned by id (local edits win); logs merge per habit. */
export function mergeSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  const byId = new Map(remote.habits.map((h) => [h.id, h]));
  for (const h of local.habits) byId.set(h.id, h);
  const habits = [...byId.values()];
  const logs: Record<string, HabitLog> = {};
  for (const h of habits) {
    const empty = { completions: {}, frozen: {} };
    logs[h.id] = mergeLogs(local.logs[h.id] ?? empty, remote.logs[h.id] ?? empty, h.targetPerDay);
  }
  return { habits, logs };
}

export async function syncNow(adapter: SyncAdapter, local: Snapshot): Promise<Snapshot> {
  const remote = await adapter.pull();
  const merged = remote ? mergeSnapshots(local, remote) : local;
  await adapter.push(merged);
  return merged;
}
