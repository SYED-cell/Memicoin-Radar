/**
 * Disk maintenance for the SQLite file.
 *
 * The `tokens` table is a cache of live market data: it turns over completely every day and is
 * rebuilt from the providers on restart. Everything else — accounts, sessions, settings,
 * watchlists, paper-trading history — is user data that must survive.
 *
 * When the file has grown far beyond what the data needs (a full volume, for instance), a plain
 * VACUUM cannot help: it needs as much free space again as the finished file. Instead this builds
 * a fresh database containing only the user data and swaps it in, which needs just a few MB.
 */
import { existsSync, renameSync, rmSync, statfsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './schema.ts';

/** Above this the file is rebuilt at boot. The user data itself is a few MB at most. */
const REBUILD_ABOVE_BYTES = 150 * 1024 * 1024;

/**
 * Copied in this order so foreign keys always find their parent rows. A `where` keeps the
 * high-volume tables small, which matters when the rebuild runs on a disk with nothing left.
 */
const KEEP_TABLES: { table: string; where?: string }[] = [
  { table: 'users' },
  { table: 'sessions' },
  { table: 'user_settings' },
  { table: 'watchlist' },
  { table: 'portfolios' },
  { table: 'positions' },
  { table: 'transactions' },
  { table: 'equity' },
  { table: 'email_tokens' },
  { table: 'telegram_links' },
  { table: 'telegram_link_codes' },
  { table: 'alerts', where: `created_at > ${Date.now() - 3 * 86_400_000}` },
  { table: 'setup_samples', where: `taken_at > ${Date.now() - 45 * 86_400_000}` },
  { table: 'verified_alerts' },
  { table: 'telegram_sent' },
];

/** Rows nothing reads any more, and how long they are kept. */
const RETENTION: { table: string; column: string; days: number }[] = [
  { table: 'creator_launches', column: 't', days: 30 },
  { table: 'telegram_messages', column: 'created_at', days: 7 },
  { table: 'email_tokens', column: 'expires_at', days: 7 },
  { table: 'setup_samples', column: 'taken_at', days: 45 },
  { table: 'verified_alerts', column: 'sent_at', days: 30 },
  { table: 'telegram_sent', column: 'sent_at', days: 30 },
];

/** Hourly prune of expired rows, then a WAL checkpoint so the log does not sit on the disk. */
export function startMaintenance(exec: (sql: string, ...params: (string | number)[]) => unknown, log: (msg: string) => void) {
  const sweep = () => {
    const now = Date.now();
    for (const r of RETENTION) {
      try {
        exec(`DELETE FROM ${r.table} WHERE ${r.column} < ?`, now - r.days * 86_400_000);
      } catch (err) {
        log(`prune ${r.table} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* a concurrent reader can defer the checkpoint; the next sweep retries */
    }
  };
  sweep();
  const timer = setInterval(sweep, 3_600_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Below this much free disk the rebuild has to reclaim space before it can write anything. */
const LOW_SPACE_BYTES = 24 * 1024 * 1024;

const sizeOf = (p: string) => (existsSync(p) ? statSync(p).size : 0);

function freeBytes(path: string): number {
  try {
    const fs = statfsSync(dirname(path));
    return Number(fs.bavail) * Number(fs.bsize);
  } catch {
    return Number.MAX_SAFE_INTEGER; // unknown: assume space and let the copy report the truth
  }
}
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(0)}MB`;

function applySchema(target: DatabaseSync) {
  target.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  target.prepare('INSERT INTO schema_version (version) VALUES (?)').run(MIGRATIONS.length);
  for (const m of MIGRATIONS) target.exec(m);
}

/**
 * Rebuilds the database without the market cache when it has outgrown its contents.
 * Runs before the main connection is opened. Any failure leaves the original file untouched.
 */
export function rebuildIfOversized(dbPath: string, log: (msg: string) => void, thresholdBytes = REBUILD_ABOVE_BYTES): void {
  const total = sizeOf(dbPath) + sizeOf(`${dbPath}-wal`);
  if (total < thresholdBytes) return;

  const rebuilt = `${dbPath}.rebuilt`;
  const previous = `${dbPath}.previous`;
  log(`database is ${mb(total)} — rebuilding without the market cache`);
  for (const stale of [rebuilt, `${rebuilt}-wal`, `${rebuilt}-shm`]) rmSync(stale, { force: true, recursive: true });

  // On a full disk even a few MB are unavailable. The write-ahead log belongs to the file we are
  // about to discard, so dropping it first buys the room the rebuild needs. Anything it still held
  // is market cache from the last seconds before the crash.
  if (freeBytes(dbPath) < LOW_SPACE_BYTES) {
    const reclaimed = sizeOf(`${dbPath}-wal`) + sizeOf(`${dbPath}-shm`);
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    log(`disk nearly full — released ${mb(reclaimed)} of write-ahead log to make room`);
  }

  let target: DatabaseSync | null = null;
  try {
    target = new DatabaseSync(rebuilt);
    // No journal while building: the file is disposable until the swap, and a journal would need
    // disk we may not have. WAL is enabled on the live connection afterwards.
    target.exec('PRAGMA journal_mode = OFF; PRAGMA foreign_keys = OFF;');
    applySchema(target);
    target.exec(`ATTACH '${dbPath.replace(/'/g, "''")}' AS old`);
    target.exec('BEGIN');
    for (const { table, where } of KEEP_TABLES) {
      try {
        target.exec(`INSERT INTO ${table} SELECT * FROM old.${table}${where ? ` WHERE ${where}` : ''}`);
      } catch (err) {
        // A table missing or reshaped in an older file must not cost us the accounts.
        log(`skipped ${table}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    target.exec('COMMIT');
    const users = (target.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    target.exec('DETACH old');
    target.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    target.close();
    target = null;

    // Swap: the old file is only removed once the rebuilt one is in place.
    rmSync(previous, { force: true });
    renameSync(dbPath, previous);
    renameSync(rebuilt, dbPath);
    for (const leftover of [`${previous}`, `${dbPath}.previous-wal`, `${dbPath}.previous-shm`]) rmSync(leftover, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    log(`rebuilt: ${mb(total)} → ${mb(sizeOf(dbPath))}, ${users} account(s) kept`);
  } catch (err) {
    log(`rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      target?.close();
    } catch {
      /* already closed */
    }
    for (const stale of [rebuilt, `${rebuilt}-wal`, `${rebuilt}-shm`]) rmSync(stale, { force: true, recursive: true });
    emptyCacheInPlace(dbPath, log);
  }
}

/**
 * Fallback when there is not even room to write a new file: clear the cache inside the existing
 * one. The file keeps its size, but its pages become free for reuse, so the server runs instead of
 * crash-looping. The journal is held in memory because the disk has nothing to give.
 */
export function emptyCacheInPlace(dbPath: string, log: (msg: string) => void) {
  let conn: DatabaseSync | null = null;
  try {
    conn = new DatabaseSync(dbPath);
    conn.exec('PRAGMA journal_mode = MEMORY');
    conn.exec('DELETE FROM tokens');
    const freed = (conn.prepare('PRAGMA freelist_count').get() as { freelist_count: number } | undefined)?.freelist_count ?? 0;
    conn.close();
    conn = null;
    log(`cleared the market cache in place — ${freed} pages free for reuse inside the file`);
  } catch (err) {
    log(`could not clear the cache in place: ${err instanceof Error ? err.message : String(err)}`);
    try {
      conn?.close();
    } catch {
      /* already closed */
    }
  }
}
