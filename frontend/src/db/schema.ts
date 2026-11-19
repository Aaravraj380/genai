/**
 * SQLite schema + migrations.
 *
 *   habits       one row per habit (frequency days stored as "1,3,5")
 *   pauses       pause periods per habit              (FK → habits, cascade)
 *   completions  one row per habit per day with a count (FK → habits, cascade)
 *   freezes      one row per frozen habit-day         (FK → habits, cascade)
 *   settings     user preferences, key → JSON value
 *   app_meta     bookkeeping (last active day, one-time migration flag, account login)
 *   sync_outbox  changes waiting to be sent to the server (only when logged in)
 *
 * The schema version lives in `PRAGMA user_version`. To change the schema,
 * append a step to MIGRATIONS — never edit a step that has shipped.
 */
import type { DbClient } from './client';

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE habits (
    id               TEXT PRIMARY KEY NOT NULL,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    title            TEXT NOT NULL,
    frequency_type   TEXT NOT NULL CHECK (frequency_type IN ('daily','weekdays','weekends','custom')),
    frequency_days   TEXT,
    creation_date    TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    icon             TEXT NOT NULL,
    color            TEXT NOT NULL,
    category         TEXT NOT NULL,
    note             TEXT,
    target_per_day   INTEGER NOT NULL DEFAULT 1 CHECK (target_per_day BETWEEN 1 AND 20),
    reminder_enabled INTEGER,
    reminder_hour    INTEGER,
    reminder_minute  INTEGER,
    reminder_message TEXT,
    template_key     TEXT
  );
  CREATE TABLE pauses (
    habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date   TEXT,
    PRIMARY KEY (habit_id, start_date)
  );
  CREATE TABLE completions (
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,
    count    INTEGER NOT NULL CHECK (count > 0),
    PRIMARY KEY (habit_id, date)
  ) WITHOUT ROWID;
  CREATE INDEX completions_by_date ON completions(date);
  CREATE TABLE freezes (
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,
    PRIMARY KEY (habit_id, date)
  ) WITHOUT ROWID;
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2 — offline queue for account sync (changes waiting to reach the server)
  `
  CREATE TABLE sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Bring any database (new or old) up to SCHEMA_VERSION. Safe to call on every launch. */
export async function migrate(db: DbClient): Promise<void> {
  // Connection settings must be applied outside a transaction.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch {
    /* not supported by every backend (e.g. in-memory); harmless */
  }

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema v${current} is newer than this app supports (v${SCHEMA_VERSION}).`);
  }
  if (current === SCHEMA_VERSION) return;

  // Each step and its version bump commit together, so a failure rolls back cleanly.
  await db.withTransactionAsync(async () => {
    for (let v = current; v < SCHEMA_VERSION; v++) await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
