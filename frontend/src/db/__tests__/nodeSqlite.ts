/**
 * Test adapter: runs the app's SQL against Node's built-in SQLite (Node ≥ 22.13),
 * implementing the same DbClient interface that expo-sqlite provides on devices.
 */
import type { DbClient, SqlValue } from '../client';

type NodeDb = {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: SqlValue[]): unknown; all(...p: SqlValue[]): unknown[]; get(...p: SqlValue[]): unknown };
};

export function nodeSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

export function openMemoryDb(): DbClient & { raw: NodeDb } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDb };
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params) => raw.prepare(sql).run(...params),
    getAllAsync: async <T,>(sql: string, params: SqlValue[]) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlValue[]) => ((raw.prepare(sql).get(...params) as T) ?? null),
    withTransactionAsync: async (task) => {
      // Mirror expo-sqlite: commit on success, roll back if the task throws.
      if (depth++ === 0) raw.exec('BEGIN');
      try {
        await task();
        if (depth === 1) raw.exec('COMMIT');
      } catch (e) {
        if (depth === 1) raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
