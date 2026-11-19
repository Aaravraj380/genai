/**
 * The offline queue: changes made while logged in wait here until the server
 * confirms them. Stored in SQLite, so nothing is lost if the app is closed
 * while offline. (An in-memory version is used when SQLite isn't available.)
 */
import type { SyncOp } from '@/api/types';
import type { DbClient } from '@/db/client';

export interface QueuedOp {
  id: number;
  op: SyncOp;
}

export interface Outbox {
  add(ops: SyncOp[]): Promise<void>;
  peek(limit: number): Promise<QueuedOp[]>;
  /** Remove every queued op with id ≤ upToId (they reached the server). */
  remove(upToId: number): Promise<void>;
  removeOne(id: number): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export type Serialize = <T>(task: () => Promise<T>) => Promise<T>;

/** `serialize` runs each statement through the app's single database write queue, so it never overlaps another transaction. */
export function sqliteOutbox(db: DbClient, serialize: Serialize = (task) => task()): Outbox {
  return {
    add: (ops) =>
      serialize(async () => {
        if (!ops.length) return;
        await db.withTransactionAsync(async () => {
          for (const op of ops) await db.runAsync('INSERT INTO sync_outbox (op) VALUES (?)', [JSON.stringify(op)]);
        });
      }),
    peek: (limit) =>
      serialize(async () => {
        const rows = await db.getAllAsync<{ id: number; op: string }>('SELECT id, op FROM sync_outbox ORDER BY id LIMIT ?', [limit]);
        return rows.map((r) => ({ id: r.id, op: JSON.parse(r.op) as SyncOp }));
      }),
    remove: (upToId) => serialize(async () => void (await db.runAsync('DELETE FROM sync_outbox WHERE id <= ?', [upToId]))),
    removeOne: (id) => serialize(async () => void (await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [id]))),
    count: () =>
      serialize(async () => (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox', []))?.n ?? 0),
    clear: () => serialize(async () => void (await db.runAsync('DELETE FROM sync_outbox', []))),
  };
}

export function memoryOutbox(): Outbox {
  let items: QueuedOp[] = [];
  let next = 1;
  return {
    async add(ops) {
      for (const op of ops) items.push({ id: next++, op: JSON.parse(JSON.stringify(op)) });
    },
    async peek(limit) {
      return items.slice(0, limit);
    },
    async remove(upToId) {
      items = items.filter((i) => i.id > upToId);
    },
    async removeOne(id) {
      items = items.filter((i) => i.id !== id);
    },
    async count() {
      return items.length;
    },
    async clear() {
      items = [];
    },
  };
}
