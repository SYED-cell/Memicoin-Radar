import { uid } from '../../shared/random.ts';
import type { User } from '../../shared/types.ts';
import { one, run, tx } from '../db.ts';
import { config } from '../env.ts';
import { DUMMY_HASH, hashPassword, randomToken, sha256, signJwt, verifyJwt, verifyPassword } from '../lib/crypto.ts';
import { clearCookie, HttpError, setCookie, type Ctx } from '../lib/http.ts';
import { sendMail } from '../lib/mailer.ts';

export const ACCESS_COOKIE = 'mcr_at';
export const REFRESH_COOKIE = 'mcr_rt';
const REFRESH_PATH = '/api/auth';
const MAX_FAILED = 8;
const LOCK_MS = 15 * 60_000;

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified: number;
  failed_logins: number;
  locked_until: number | null;
  created_at: number;
}

export const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, emailVerified: Boolean(r.email_verified), createdAt: r.created_at });

export function getUser(id: string): User | null {
  const r = one<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return r ? toUser(r) : null;
}

/* ─────────── Sessions: short-lived JWT access token + rotating refresh token ─────────── */

function issueSession(ctx: Ctx, userId: string, sessionId = uid('ses_')) {
  const refresh = randomToken(32);
  const now = Date.now();
  const existing = one<{ id: string }>('SELECT id FROM sessions WHERE id = ?', sessionId);
  if (existing) {
    run('UPDATE sessions SET refresh_hash = ?, last_used_at = ?, expires_at = ? WHERE id = ?', sha256(refresh), now, now + config.refreshTtlSec * 1000, sessionId);
  } else {
    run(
      'INSERT INTO sessions (id, user_id, refresh_hash, user_agent, ip, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      sessionId,
      userId,
      sha256(refresh),
      String(ctx.req.headers['user-agent'] ?? '').slice(0, 200),
      ctx.ip,
      now,
      now,
      now + config.refreshTtlSec * 1000,
    );
  }
  const access = signJwt({ sub: userId, sid: sessionId }, config.accessTtlSec);
  setCookie(ctx.res, ACCESS_COOKIE, access, { maxAge: config.accessTtlSec });
  setCookie(ctx.res, REFRESH_COOKIE, `${sessionId}.${refresh}`, { maxAge: config.refreshTtlSec, path: REFRESH_PATH });
}

export function clearSession(ctx: Ctx) {
  clearCookie(ctx.res, ACCESS_COOKIE);
  clearCookie(ctx.res, REFRESH_COOKIE, REFRESH_PATH);
}

/** Middleware: attaches ctx.userId from a valid, non-revoked access token. */
export function authenticate(ctx: Ctx): string | null {
  const token = ctx.cookies[ACCESS_COOKIE];
  if (!token) return null;
  const payload = verifyJwt<{ sub: string; sid: string }>(token);
  if (!payload) return null;
  const s = one<{ revoked_at: number | null }>('SELECT revoked_at FROM sessions WHERE id = ?', payload.sid);
  if (!s || s.revoked_at) return null;
  ctx.userId = payload.sub;
  return payload.sub;
}

export function requireAuth(ctx: Ctx) {
  if (!authenticate(ctx)) throw new HttpError(401, 'Authentication required', 'unauthorized');
}

export function requireVerified(ctx: Ctx) {
  requireAuth(ctx);
  if (!config.requireEmailVerification) return;
  const u = one<{ email_verified: number }>('SELECT email_verified FROM users WHERE id = ?', ctx.userId!);
  if (!u?.email_verified) throw new HttpError(403, 'Please verify your email address first', 'email_unverified');
}

export function refreshSession(ctx: Ctx): User {
  const raw = ctx.cookies[REFRESH_COOKIE];
  const [sid, secret] = (raw ?? '').split('.');
  if (!sid || !secret) throw new HttpError(401, 'No session', 'unauthorized');
  const s = one<{ user_id: string; refresh_hash: string; expires_at: number; revoked_at: number | null }>('SELECT * FROM sessions WHERE id = ?', sid);
  if (!s || s.revoked_at || s.expires_at < Date.now()) {
    clearSession(ctx);
    throw new HttpError(401, 'Session expired', 'unauthorized');
  }
  if (s.refresh_hash !== sha256(secret)) {
    // Refresh-token reuse → likely theft. Revoke the whole session family for this user.
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', Date.now(), s.user_id);
    clearSession(ctx);
    throw new HttpError(401, 'Session invalidated', 'unauthorized');
  }
  const user = getUser(s.user_id);
  if (!user) throw new HttpError(401, 'Account not found', 'unauthorized');
  issueSession(ctx, s.user_id, sid);
  return user;
}

/* ─────────── Account flows ─────────── */

async function sendEmailToken(userId: string, email: string, kind: 'verify' | 'reset') {
  const token = randomToken(32);
  const ttl = kind === 'verify' ? 24 * 3600_000 : 3600_000;
  run('DELETE FROM email_tokens WHERE user_id = ? AND kind = ?', userId, kind);
  run('INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, kind, Date.now() + ttl);
  const link = `${config.appUrl}/${kind === 'verify' ? 'verify-email' : 'reset-password'}?token=${token}`;
  return kind === 'verify'
    ? sendMail(email, 'Verify your MemeCoin Radar account', 'Confirm your email address to activate alerts and trading:', link)
    : sendMail(email, 'Reset your MemeCoin Radar password', 'Use this link within 1 hour to choose a new password. If you did not request it, ignore this email.', link);
}

export async function signup(ctx: Ctx, input: { name: string; email: string; password: string }) {
  if (one('SELECT 1 FROM users WHERE email = ?', input.email)) {
    throw new HttpError(409, 'An account with this email already exists', 'email_taken', { email: 'Email already registered' });
  }
  const id = uid('usr_');
  const now = Date.now();
  const hash = await hashPassword(input.password);
  run('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, input.email, input.name, hash, now, now);
  const mail = await sendEmailToken(id, input.email, 'verify');
  issueSession(ctx, id);
  return { user: getUser(id)!, devLink: mail.devLink };
}

export async function login(ctx: Ctx, email: string, password: string): Promise<User> {
  const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email);
  if (row?.locked_until && row.locked_until > Date.now()) {
    throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.', 'locked');
  }
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    if (row) {
      const failed = row.failed_logins + 1;
      run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', failed, failed >= MAX_FAILED ? Date.now() + LOCK_MS : null, row.id);
    }
    throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
  }
  run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', row.id);
  issueSession(ctx, row.id);
  return toUser(row);
}

export function logout(ctx: Ctx) {
  const [sid] = (ctx.cookies[REFRESH_COOKIE] ?? '').split('.');
  if (sid) run('UPDATE sessions SET revoked_at = ? WHERE id = ?', Date.now(), sid);
  clearSession(ctx);
}

export function consumeEmailToken(token: string, kind: 'verify' | 'reset'): string {
  const row = one<{ user_id: string; expires_at: number; used_at: number | null }>('SELECT * FROM email_tokens WHERE token_hash = ? AND kind = ?', sha256(token), kind);
  if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(400, 'This link is invalid or has expired', 'invalid_token');
  run('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?', Date.now(), sha256(token));
  return row.user_id;
}

export function verifyEmail(token: string) {
  const userId = consumeEmailToken(token, 'verify');
  run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', Date.now(), userId);
  return getUser(userId)!;
}

export async function resendVerification(userId: string) {
  const u = getUser(userId);
  if (!u) throw new HttpError(404, 'Account not found', 'not_found');
  if (u.emailVerified) return { alreadyVerified: true };
  const mail = await sendEmailToken(u.id, u.email, 'verify');
  return { devLink: mail.devLink };
}

export async function requestReset(email: string) {
  const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email);
  // Same response whether or not the account exists (no user enumeration).
  if (!row) return {};
  const mail = await sendEmailToken(row.id, row.email, 'reset');
  return { devLink: mail.devLink };
}

export async function resetPassword(token: string, password: string) {
  const userId = consumeEmailToken(token, 'reset');
  const hash = await hashPassword(password);
  tx(() => {
    run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, email_verified = 1, updated_at = ? WHERE id = ?', hash, Date.now(), userId);
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', Date.now(), userId);
  });
}

export async function changePassword(ctx: Ctx, current: string, next: string) {
  const row = one<UserRow>('SELECT * FROM users WHERE id = ?', ctx.userId!);
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect', 'invalid_credentials', { current: 'Current password is incorrect' });
  }
  const hash = await hashPassword(next);
  const [sid] = (ctx.cookies[REFRESH_COOKIE] ?? '').split('.');
  tx(() => {
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hash, Date.now(), row.id);
    // Sign out every other device.
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL', Date.now(), row.id, sid ?? '');
  });
}

export async function updateProfile(userId: string, patch: { name: string; email: string }) {
  const current = getUser(userId);
  if (!current) throw new HttpError(404, 'Account not found', 'not_found');
  const emailChanged = patch.email !== current.email;
  if (emailChanged && one('SELECT 1 FROM users WHERE email = ? AND id != ?', patch.email, userId)) {
    throw new HttpError(409, 'Email already in use', 'email_taken', { email: 'Email already in use' });
  }
  run('UPDATE users SET name = ?, email = ?, email_verified = CASE WHEN ? THEN 0 ELSE email_verified END, updated_at = ? WHERE id = ?', patch.name, patch.email, emailChanged ? 1 : 0, Date.now(), userId);
  const devLink = emailChanged ? (await sendEmailToken(userId, patch.email, 'verify')).devLink : undefined;
  return { user: getUser(userId)!, devLink };
}

export function listSessions(userId: string) {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?', userId, Date.now())?.n ?? 0;
}

export function revokeOtherSessions(ctx: Ctx) {
  const [sid] = (ctx.cookies[REFRESH_COOKIE] ?? '').split('.');
  run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL', Date.now(), ctx.userId!, sid ?? '');
}

export function deleteAccount(ctx: Ctx) {
  run('DELETE FROM users WHERE id = ?', ctx.userId!);
  clearSession(ctx);
}
