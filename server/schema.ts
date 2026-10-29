/** Schema migrations, applied in order. Shared with the rebuild in maintenance.ts. */
export const MIGRATIONS: string[] = [
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
  // v4: Pro subscriptions paid in USDT. Each pending payment carries a unique amount, which is
  // how an incoming transfer is matched to the account that owes it.
  `ALTER TABLE users ADD COLUMN pro_until INTEGER;
   CREATE TABLE payments (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     network TEXT NOT NULL,
     address TEXT NOT NULL,
     amount TEXT NOT NULL,
     days INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     tx_hash TEXT,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     paid_at INTEGER
   );
   CREATE INDEX idx_payments_pending ON payments(status, network, expires_at);
   CREATE UNIQUE INDEX idx_payments_amount ON payments(network, amount, status);`,
  // v5: a sample accumulates its own price path while it is live. Reconstructing the path at
  // resolve time from the monitor's in-memory history discarded 88% of samples: the monitor stops
  // polling and then evicts a quiet token long before the horizon elapses, so by the time the
  // sample was due there was nothing left to measure it against.
  `ALTER TABLE setup_samples ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE setup_samples ADD COLUMN last_price REAL;
   ALTER TABLE setup_samples ADD COLUMN last_at INTEGER;`,
  // v6: the setup behind each paper trade, as JSON. Transactions already record what happened;
  // without the token's state at fill time the account can show a profit but never say which
  // setups produced it, so no rule the app publishes can ever be checked against its own trades.
  `ALTER TABLE transactions ADD COLUMN context TEXT;`,
  // v7: the paper trading bot. Settings per account, and one row per position it is running so
  // the exit ladder survives a restart — a bot that forgot which rungs had filled would sell the
  // same share twice and move a stop backwards.
  `CREATE TABLE bot_settings (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     enabled INTEGER NOT NULL DEFAULT 0,
     risk_pct REAL NOT NULL DEFAULT 2,
     max_positions INTEGER NOT NULL DEFAULT 3,
     max_position_pct REAL NOT NULL DEFAULT 20,
     min_score INTEGER NOT NULL DEFAULT 60,
     max_risk INTEGER NOT NULL DEFAULT 70,
     time_stop_min INTEGER NOT NULL DEFAULT 60,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE bot_plans (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mint TEXT NOT NULL,
     symbol TEXT NOT NULL,
     status TEXT NOT NULL,
     entry REAL NOT NULL,
     original_qty REAL NOT NULL,
     stop REAL NOT NULL,
     initial_stop REAL NOT NULL,
     exits TEXT NOT NULL,
     filled TEXT NOT NULL DEFAULT '[]',
     time_stop_min INTEGER NOT NULL,
     opened_at INTEGER NOT NULL,
     closed_at INTEGER,
     close_cause TEXT,
     realized_pnl REAL NOT NULL DEFAULT 0
   );
   CREATE INDEX bot_plans_user ON bot_plans(user_id, opened_at DESC);
   CREATE UNIQUE INDEX bot_plans_open ON bot_plans(user_id, mint) WHERE status = 'open';`,
];
