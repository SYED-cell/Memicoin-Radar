import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './env.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });

/** SQLite (WAL) via Node's built-in driver. Swap for Postgres by re-implementing this module. */
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     email_verified INTEGER NOT NULL DEFAULT 0,
     failed_logins INTEGER NOT NULL DEFAULT 0,
     locked_until INTEGER,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     refresh_hash TEXT NOT NULL,
     user_agent TEXT,
     ip TEXT,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     revoked_at INTEGER
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE email_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
     expires_at INTEGER NOT NULL,
     used_at INTEGER
   );
   CREATE TABLE user_settings (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE watchlist (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     symbol TEXT,
     added_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, mint)
   );
   CREATE TABLE alerts (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     severity TEXT NOT NULL,
     category TEXT NOT NULL,
     title TEXT NOT NULL,
     message TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX alerts_user_time ON alerts(user_id, created_at DESC);
   CREATE TABLE telegram_links (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     chat_id_enc TEXT NOT NULL,
     username TEXT,
     linked_at INTEGER NOT NULL
   );
   CREATE TABLE telegram_link_codes (
     code_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE telegram_messages (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     status TEXT NOT NULL,
     error TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX tg_messages_user ON telegram_messages(user_id, created_at DESC);
   CREATE TABLE portfolios (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     starting_balance REAL NOT NULL,
     cash REAL NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE positions (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     quantity REAL NOT NULL,
     avg_entry REAL NOT NULL,
     opened_at INTEGER NOT NULL,
     stop_loss REAL,
     take_profit REAL,
     PRIMARY KEY (user_id, mint)
   );
   CREATE TABLE transactions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     side TEXT NOT NULL,
     quantity REAL NOT NULL,
     price REAL NOT NULL,
     total REAL NOT NULL,
     fee REAL NOT NULL,
     realized_pnl REAL,
     reason TEXT NOT NULL DEFAULT 'manual',
     created_at INTEGER NOT NULL
   );
   CREATE INDEX tx_user_time ON transactions(user_id, created_at DESC);
   CREATE TABLE equity (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     t INTEGER NOT NULL,
     value REAL NOT NULL
   );
   CREATE INDEX equity_user_time ON equity(user_id, t);
   CREATE TABLE tokens (
     mint TEXT PRIMARY KEY,
     json TEXT NOT NULL,
     detected_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE creator_launches (
     creator TEXT NOT NULL,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     t INTEGER NOT NULL,
     PRIMARY KEY (creator, mint)
   );
   CREATE TABLE reports (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     json TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE jobs (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     payload TEXT NOT NULL,
     run_at INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'pending',
     last_error TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX jobs_pending ON jobs(status, run_at);`,
  // v2: outcome tracker for the strict verified-coin filter (comparable-setup evidence).
  `CREATE TABLE setup_samples (
     id TEXT PRIMARY KEY,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     taken_at INTEGER NOT NULL,
     score INTEGER NOT NULL,
     risk INTEGER NOT NULL,
     entry_price REAL NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     resolved_at INTEGER,
     exit_price REAL,
     return_pct REAL,
     max_up_pct REAL,
     max_dd_pct REAL
   );
   CREATE INDEX samples_status ON setup_samples(status, taken_at);
   CREATE INDEX samples_mint ON setup_samples(mint, taken_at);
   CREATE TABLE verified_alerts (
     mint TEXT PRIMARY KEY,
     sent_at INTEGER NOT NULL
   );`,
  // v3: per-user Telegram de-duplication for score-threshold mode.
  `CREATE TABLE telegram_sent (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     sent_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, mint)
   );`,
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version++;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
migrate();

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const one = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as T | undefined;
export const all = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as T[];
export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);
