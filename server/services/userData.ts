import { DEFAULT_THRESHOLDS } from '../../shared/alertRules.ts';
import type { UserSettings, WatchItem } from '../../shared/types.ts';
import { all, one, run } from '../db.ts';
import { monitor } from '../pipeline/monitor.ts';

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: { inApp: true, sound: false, browser: false, critical: true, warning: true, info: false },
  alerts: DEFAULT_THRESHOLDS,
  trading: { riskPerTradePct: 1, maxPositionPct: 10, defaultStopLossPct: 25, defaultTakeProfitPct: 60 },
  telegram: { enabled: true, mode: 'score', minScore: 40 },
};

const settingsCache = new Map<string, UserSettings>();

export function getSettings(userId: string): UserSettings {
  const hit = settingsCache.get(userId);
  if (hit) return hit;
  const row = one<{ json: string }>('SELECT json FROM user_settings WHERE user_id = ?', userId);
  let parsed: Partial<UserSettings> = {};
  try {
    parsed = row ? (JSON.parse(row.json) as Partial<UserSettings>) : {};
  } catch {
    parsed = {};
  }
  const s: UserSettings = {
    notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
    alerts: { ...DEFAULT_SETTINGS.alerts, ...parsed.alerts },
    trading: { ...DEFAULT_SETTINGS.trading, ...parsed.trading },
    telegram: { ...DEFAULT_SETTINGS.telegram, ...parsed.telegram },
  };
  settingsCache.set(userId, s);
  return s;
}

export function saveSettings(userId: string, s: UserSettings) {
  run(
    'INSERT INTO user_settings (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
    userId,
    JSON.stringify(s),
    Date.now(),
  );
  settingsCache.set(userId, s);
}

export function allUserIds(): string[] {
  return all<{ id: string }>('SELECT id FROM users').map((r) => r.id);
}

/* ─────────── Watchlist ─────────── */

const watchCache = new Map<string, Set<string>>();

export function getWatchlist(userId: string): WatchItem[] {
  return all<{ mint: string; symbol: string | null; added_at: number }>('SELECT mint, symbol, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC', userId).map(
    (r) => ({ tokenId: r.mint, symbol: r.symbol ?? undefined, addedAt: r.added_at }),
  );
}

export function watchedSet(userId: string): Set<string> {
  let s = watchCache.get(userId);
  if (!s) {
    s = new Set(getWatchlist(userId).map((w) => w.tokenId));
    watchCache.set(userId, s);
  }
  return s;
}

export function addWatch(userId: string, mint: string) {
  const t = monitor.get(mint);
  run('INSERT OR IGNORE INTO watchlist (user_id, mint, symbol, added_at) VALUES (?, ?, ?, ?)', userId, mint, t?.symbol ?? null, Date.now());
  watchCache.delete(userId);
  refreshPinned();
}

export function removeWatch(userId: string, mint: string) {
  run('DELETE FROM watchlist WHERE user_id = ? AND mint = ?', userId, mint);
  watchCache.delete(userId);
  refreshPinned();
}

export function clearWatch(userId: string) {
  run('DELETE FROM watchlist WHERE user_id = ?', userId);
  watchCache.delete(userId);
  refreshPinned();
}

export function heldSet(userId: string): Set<string> {
  return new Set(all<{ mint: string }>('SELECT mint FROM positions WHERE user_id = ?', userId).map((r) => r.mint));
}

/** Every mint any user watches or holds is "pinned": always polled, scanned and never evicted. */
export function refreshPinned() {
  const rows = all<{ mint: string }>('SELECT mint FROM watchlist UNION SELECT mint FROM positions');
  monitor.setPinned(new Set(rows.map((r) => r.mint)));
}

export function invalidateUserCaches(userId: string) {
  settingsCache.delete(userId);
  watchCache.delete(userId);
}
