/**
 * The subset of expo-sqlite's `SQLiteDatabase` the app uses. Coding against
 * this interface lets the unit tests run the very same SQL against Node's
 * built-in SQLite (see __tests__/nodeSqlite.ts) instead of a phone.
 */
export type SqlValue = string | number | null;

export interface DbClient {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
