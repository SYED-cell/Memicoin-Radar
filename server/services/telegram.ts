import { uid } from '../../shared/random.ts';
import type { TelegramStatus } from '../../shared/types.ts';
import { all, one, run } from '../db.ts';
import { config } from '../env.ts';
import { decrypt, encrypt, randomToken, sha256 } from '../lib/crypto.ts';
import { HttpError } from '../lib/http.ts';
import { log } from '../lib/log.ts';
import { sendToUser } from './sse.ts';
import { getSettings } from './userData.ts';

/**
 * Telegram Bot API integration:
 *  - Secure account linking via one-time deep-link codes (t.me/<bot>?start=<code>) received through
 *    long-polling getUpdates — the user never types a chat id and cannot link someone else's chat.
 *  - Chat ids are stored AES-256-GCM encrypted.
 *  - Outgoing messages go through a durable job queue with retries and rate limiting.
 */
const API = (method: string) => `https://api.telegram.org/bot${config.telegramBotToken}/${method}`;
let botUsername: string | null = null;
let running = false;

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

async function call<T>(method: string, body?: unknown, timeoutMs = 15_000): Promise<TgResponse<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    return (await res.json()) as TgResponse<T>;
  } finally {
    clearTimeout(timer);
  }
}

export const telegramConfigured = () => Boolean(config.telegramBotToken);

function chatIdFor(userId: string): string | null {
  const row = one<{ chat_id_enc: string }>('SELECT chat_id_enc FROM telegram_links WHERE user_id = ?', userId);
  if (!row) return null;
  try {
    return decrypt(row.chat_id_enc);
  } catch {
    return null;
  }
}

export function getStatus(userId: string): TelegramStatus {
  const link = one<{ username: string | null; linked_at: number }>('SELECT username, linked_at FROM telegram_links WHERE user_id = ?', userId);
  const recent = all<{ id: string; text: string; created_at: number; status: 'queued' | 'sent' | 'failed'; error: string | null }>(
    'SELECT id, text, created_at, status, error FROM telegram_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 15',
    userId,
  ).map((r) => ({ id: r.id, text: r.text, at: r.created_at, status: r.status, error: r.error }));
  return {
    configured: telegramConfigured(),
    botUsername,
    connected: Boolean(link),
    username: link?.username ?? null,
    linkedAt: link?.linked_at ?? null,
    prefs: getSettings(userId).telegram,
    recent,
  };
}

export function createLinkCode(userId: string): { url: string; code: string; expiresAt: number } {
  if (!telegramConfigured() || !botUsername) throw new HttpError(503, 'Telegram bot is not configured on the server', 'telegram_unconfigured');
  const code = randomToken(18);
  const expiresAt = Date.now() + 10 * 60_000;
  run('DELETE FROM telegram_link_codes WHERE user_id = ? OR expires_at < ?', userId, Date.now());
  run('INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(code), userId, expiresAt);
  return { url: `https://t.me/${botUsername}?start=${code}`, code, expiresAt };
}

export function disconnect(userId: string) {
  run('DELETE FROM telegram_links WHERE user_id = ?', userId);
}

/** Queues a message for a user (no-op when not linked or notifications disabled). */
export function enqueue(userId: string, text: string, force = false): boolean {
  if (!telegramConfigured()) return false;
  if (!force && !getSettings(userId).telegram.enabled) return false;
  if (!one('SELECT 1 FROM telegram_links WHERE user_id = ?', userId)) return false;
  const id = uid('tg_');
  const now = Date.now();
  run('INSERT INTO jobs (id, kind, payload, run_at, created_at) VALUES (?, ?, ?, ?, ?)', id, 'telegram', JSON.stringify({ userId, text }), now, now);
  run('INSERT INTO telegram_messages (id, user_id, text, status, created_at) VALUES (?, ?, ?, ?, ?)', id, userId, text, 'queued', now);
  return true;
}

export async function sendTest(userId: string): Promise<{ ok: boolean; error?: string }> {
  const chatId = chatIdFor(userId);
  if (!telegramConfigured()) throw new HttpError(503, 'Telegram bot is not configured on the server', 'telegram_unconfigured');
  if (!chatId) throw new HttpError(400, 'Telegram is not connected', 'telegram_not_linked');
  const text = '🧪 Test notification from MemeCoin Radar\nYour alerts are connected. You can change what you receive in Settings → Telegram.';
  const r = await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
  const id = uid('tg_');
  run('INSERT INTO telegram_messages (id, user_id, text, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, userId, text, r.ok ? 'sent' : 'failed', r.ok ? null : r.description ?? 'error', Date.now());
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

/* ─────────── Workers ─────────── */

const lastSentPerChat = new Map<string, number>();

async function processQueue() {
  const jobs = all<{ id: string; payload: string; attempts: number }>(
    "SELECT id, payload, attempts FROM jobs WHERE kind = 'telegram' AND status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 25",
    Date.now(),
  );
  for (const job of jobs) {
    const { userId, text } = JSON.parse(job.payload) as { userId: string; text: string };
    const chatId = chatIdFor(userId);
    if (!chatId) {
      run("UPDATE jobs SET status = 'failed', last_error = 'not linked' WHERE id = ?", job.id);
      run("UPDATE telegram_messages SET status = 'failed', error = 'Telegram not connected' WHERE id = ?", job.id);
      continue;
    }
    // Telegram allows ~1 message/second per chat.
    const last = lastSentPerChat.get(chatId) ?? 0;
    if (Date.now() - last < 1100) continue;
    lastSentPerChat.set(chatId, Date.now());
    try {
      const r = await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
      if (r.ok) {
        run("UPDATE jobs SET status = 'done' WHERE id = ?", job.id);
        run("UPDATE telegram_messages SET status = 'sent', error = NULL WHERE id = ?", job.id);
        sendToUser(userId, 'telegram', { id: job.id, status: 'sent' });
        continue;
      }
      if (r.error_code === 403) {
        // User blocked the bot — unlink so we stop trying.
        disconnect(userId);
        run("UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?", r.description ?? 'blocked', job.id);
        run("UPDATE telegram_messages SET status = 'failed', error = 'Bot was blocked by the user' WHERE id = ?", job.id);
        continue;
      }
      throw Object.assign(new Error(r.description ?? 'send failed'), { retryAfter: r.parameters?.retry_after });
    } catch (err) {
      const attempts = job.attempts + 1;
      const retryAfter = (err as { retryAfter?: number }).retryAfter;
      const failed = attempts >= 5;
      run(
        'UPDATE jobs SET attempts = ?, status = ?, run_at = ?, last_error = ? WHERE id = ?',
        attempts,
        failed ? 'failed' : 'pending',
        Date.now() + (retryAfter ? retryAfter * 1000 : 2000 * 2 ** attempts),
        err instanceof Error ? err.message : 'error',
        job.id,
      );
      if (failed) run("UPDATE telegram_messages SET status = 'failed', error = ? WHERE id = ?", err instanceof Error ? err.message : 'error', job.id);
    }
  }
  // Housekeeping.
  run("DELETE FROM jobs WHERE status IN ('done','failed') AND created_at < ?", Date.now() - 7 * 86_400_000);
}

async function handleUpdate(u: { message?: { chat: { id: number; type: string }; from?: { username?: string; first_name?: string }; text?: string } }) {
  const msg = u.message;
  if (!msg?.text || msg.chat.type !== 'private') return;
  const chatId = String(msg.chat.id);
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
  if (cmd === '/start' && arg) {
    const row = one<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM telegram_link_codes WHERE code_hash = ?', sha256(arg));
    if (!row || row.expires_at < Date.now()) {
      await call('sendMessage', { chat_id: chatId, text: '❌ This link has expired. Generate a new one in MemeCoin Radar → Telegram Alerts.' });
      return;
    }
    run('DELETE FROM telegram_link_codes WHERE code_hash = ?', sha256(arg));
    const username = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name ?? null;
    run(
      'INSERT INTO telegram_links (user_id, chat_id_enc, username, linked_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET chat_id_enc = excluded.chat_id_enc, username = excluded.username, linked_at = excluded.linked_at',
      row.user_id,
      encrypt(chatId),
      username,
      Date.now(),
    );
    await call('sendMessage', { chat_id: chatId, text: '✅ Connected to MemeCoin Radar. You will receive alerts here.\nSend /stop to disconnect.' });
    sendToUser(row.user_id, 'telegram', { connected: true });
    log.info('telegram', `linked user ${row.user_id}`);
    return;
  }
  if (cmd === '/stop') {
    const links = all<{ user_id: string; chat_id_enc: string }>('SELECT user_id, chat_id_enc FROM telegram_links');
    for (const l of links) {
      try {
        if (decrypt(l.chat_id_enc) === chatId) {
          disconnect(l.user_id);
          sendToUser(l.user_id, 'telegram', { connected: false });
        }
      } catch {
        /* skip */
      }
    }
    await call('sendMessage', { chat_id: chatId, text: 'Disconnected. You will no longer receive alerts.' });
    return;
  }
  await call('sendMessage', { chat_id: chatId, text: 'Open MemeCoin Radar → Telegram Alerts and tap “Connect Telegram” to link this chat.' });
}

async function pollUpdates() {
  let offset = 0;
  while (running) {
    try {
      const r = await call<{ update_id: number; message?: never }[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
      if (!r.ok) {
        log.warn('telegram', `getUpdates failed: ${r.description}`);
        await new Promise((res) => setTimeout(res, r.error_code === 409 ? 60_000 : 5_000));
        continue;
      }
      for (const u of r.result ?? []) {
        offset = u.update_id + 1;
        await handleUpdate(u).catch((e: unknown) => log.warn('telegram', 'update handling failed', e));
      }
    } catch (err) {
      if (running) {
        log.warn('telegram', 'getUpdates error', err);
        await new Promise((res) => setTimeout(res, 5_000));
      }
    }
  }
}

let queueTimer: ReturnType<typeof setInterval> | undefined;

export async function startTelegram() {
  if (!telegramConfigured()) {
    log.warn('telegram', 'TELEGRAM_BOT_TOKEN not set — Telegram alerts disabled');
    return;
  }
  const me = await call<{ username: string }>('getMe').catch(() => null);
  if (!me?.ok || !me.result) {
    log.error('telegram', `Bot token rejected: ${me?.description ?? 'network error'}`);
    return;
  }
  botUsername = me.result.username;
  running = true;
  void pollUpdates();
  queueTimer = setInterval(() => void processQueue().catch((e: unknown) => log.error('telegram', 'queue error', e)), 1000);
  log.info('telegram', `bot @${botUsername} ready`);
}

export function stopTelegram() {
  running = false;
  clearInterval(queueTimer);
}
