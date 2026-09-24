import { Cooldowns, evaluateAlerts } from '../../shared/alertRules.ts';
import type { Alert, Token } from '../../shared/types.ts';
import { all, run } from '../db.ts';
import { log } from '../lib/log.ts';
import { monitor } from '../pipeline/monitor.ts';
import { pushAlerts } from './sse.ts';
import { enqueue } from './telegram.ts';
import { allUserIds, getSettings, heldSet, watchedSet } from './userData.ts';

const cooldowns = new Cooldowns();
let userIds: string[] = [];
const heldCache = new Map<string, { at: number; set: Set<string> }>();

export function refreshUsers() {
  userIds = allUserIds();
}

function held(userId: string) {
  const hit = heldCache.get(userId);
  if (hit && Date.now() - hit.at < 10_000) return hit.set;
  const set = heldSet(userId);
  heldCache.set(userId, { at: Date.now(), set });
  return set;
}

export function invalidateHeld(userId: string) {
  heldCache.delete(userId);
}

const insert = (userId: string, a: Alert) =>
  run(
    'INSERT INTO alerts (id, user_id, mint, symbol, severity, category, title, message, created_at, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    a.id,
    userId,
    a.tokenId,
    a.symbol,
    a.severity,
    a.category,
    a.title,
    a.message,
    a.createdAt,
  );

/**
 * Stores alerts for one user and pushes them to live clients. Telegram is reserved for the strict
 * verified-coin filter: a message is sent ONLY when `telegramText` is supplied by the verification
 * service (token passed all checks). No other alert type reaches Telegram.
 */
export function deliver(userId: string, alerts: Alert[], _token?: Token, telegramText?: string) {
  if (!alerts.length) return;
  for (const a of alerts) insert(userId, a);
  pushAlerts(userId, alerts);
  if (telegramText && getSettings(userId).telegram.enabled) enqueue(userId, telegramText);
}

export function allUserIdsCached(): string[] {
  return userIds;
}

function onTransition(prev: Token, next: Token) {
  const now = Date.now();
  for (const userId of userIds) {
    const s = getSettings(userId);
    const alerts = evaluateAlerts(prev, next, { thresholds: s.alerts, watched: watchedSet(userId), held: held(userId), cooldowns, subscriber: userId }, now);
    if (alerts.length) deliver(userId, alerts, next);
  }
}

export function listAlerts(userId: string, limit = 200): Alert[] {
  return all<{ id: string; mint: string; symbol: string; severity: Alert['severity']; category: Alert['category']; title: string; message: string; created_at: number; read: number }>(
    'SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    userId,
    limit,
  ).map((r) => ({ id: r.id, tokenId: r.mint, symbol: r.symbol, severity: r.severity, category: r.category, title: r.title, message: r.message, createdAt: r.created_at, read: Boolean(r.read) }));
}

let pruneTimer: ReturnType<typeof setInterval> | undefined;

export function startAlerts() {
  refreshUsers();
  monitor.on('transition', (prev: Token, next: Token) => {
    try {
      onTransition(prev, next);
    } catch (err) {
      log.error('alerts', 'evaluation failed', err);
    }
  });
  // Keep each user's inbox bounded.
  pruneTimer = setInterval(() => {
    for (const id of userIds) {
      run('DELETE FROM alerts WHERE user_id = ? AND id NOT IN (SELECT id FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 500)', id, id);
    }
    refreshUsers();
  }, 10 * 60_000);
}

export function stopAlerts() {
  clearInterval(pruneTimer);
}
