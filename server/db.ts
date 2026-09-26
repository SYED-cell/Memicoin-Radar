import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './env.ts';
import { log } from './lib/log.ts';
import { rebuildIfOversized } from './maintenance.ts';
import { MIGRATIONS } from './schema.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });
// Reclaim the disk before opening: a full volume would crash the first write.
rebuildIfOversized(config.dbPath, (msg) => log.warn('db', msg));

/** SQLite (WAL) via Node's built-in driver. Swap for Postgres by re-implementing this module. */
export const db = new DatabaseSync(config.dbPath);
// journal_size_limit caps the write-ahead log so a burst cannot fill the disk.
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_size_limit = 8388608;');

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
