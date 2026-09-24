import { generateDailyReport } from '../shared/marketStats.ts';
import type { DailyReport, UserSettings } from '../shared/types.ts';
import * as auth from './auth/auth.ts';
import { all, one, run } from './db.ts';
import { config } from './env.ts';
import { HttpError, Router, type Ctx } from './lib/http.ts';
import { rateLimit } from './lib/rateLimit.ts';
import { v, validate } from './lib/validate.ts';
import { monitor } from './pipeline/monitor.ts';
import { scanSecurity } from './pipeline/security.ts';
import { getCreatorIntel, getHolderIntel } from './pipeline/wallet.ts';
import { invalidateHeld, listAlerts, refreshUsers } from './services/alerts.ts';
import { addClient } from './services/sse.ts';
import { evidenceStats, verify } from './services/verification.ts';
import { formatVerifiedTelegram } from '../shared/verification.ts';
import * as telegram from './services/telegram.ts';
import * as trading from './services/trading.ts';
import { addWatch, clearWatch, DEFAULT_SETTINGS, getSettings, getWatchlist, invalidateUserCaches, removeWatch, saveSettings } from './services/userData.ts';

export const router = new Router();

const authLimit = rateLimit('auth', 20, 10);
const emailLimit = rateLimit('email', 3, 1);
const apiLimit = rateLimit('api', 240, 240);
const tradeLimit = rateLimit('trade', 30, 30);
const intelLimit = rateLimit('intel', 40, 40);

const requireAuth = (ctx: Ctx) => {
  auth.requireAuth(ctx);
  apiLimit(ctx);
};
const requireVerified = (ctx: Ctx) => {
  auth.requireVerified(ctx);
  apiLimit(ctx);
};

const mintParam = (ctx: Ctx) => validate({ mint: ctx.params.mint }, { mint: v.mint() }).mint;

/* ───────────────────────── Auth ───────────────────────── */

router.post('/api/auth/signup', authLimit, async (ctx) => {
  const body = validate(await ctx.body(), { name: v.string({ min: 2, max: 60 }), email: v.email(), password: v.password() });
  const r = await auth.signup(ctx, body);
  refreshUsers();
  return { user: r.user, devLink: r.devLink, verificationRequired: config.requireEmailVerification };
});

router.post('/api/auth/login', authLimit, async (ctx) => {
  const body = validate(await ctx.body(), { email: v.email(), password: v.string({ min: 1, max: 128, trim: false }) });
  return { user: await auth.login(ctx, body.email, body.password) };
});

router.post('/api/auth/logout', (ctx) => {
  auth.logout(ctx);
  return { ok: true };
});

router.post('/api/auth/refresh', authLimit, (ctx) => ({ user: auth.refreshSession(ctx) }));

router.get('/api/auth/me', (ctx) => {
  auth.requireAuth(ctx);
  const user = auth.getUser(ctx.userId!);
  if (!user) throw new HttpError(401, 'Account not found', 'unauthorized');
  return { user, verificationRequired: config.requireEmailVerification, sessions: auth.listSessions(user.id) };
});

router.post('/api/auth/verify-email', authLimit, async (ctx) => {
  const { token } = validate(await ctx.body(), { token: v.string({ min: 20, max: 200 }) });
  return { user: auth.verifyEmail(token) };
});

router.post('/api/auth/resend-verification', emailLimit, async (ctx) => {
  auth.requireAuth(ctx);
  return auth.resendVerification(ctx.userId!);
});

router.post('/api/auth/forgot-password', emailLimit, async (ctx) => {
  const { email } = validate(await ctx.body(), { email: v.email() });
  const r = await auth.requestReset(email);
  return { ok: true, devLink: r.devLink };
});

router.post('/api/auth/reset-password', authLimit, async (ctx) => {
  const body = validate(await ctx.body(), { token: v.string({ min: 20, max: 200 }), password: v.password() });
  await auth.resetPassword(body.token, body.password);
  return { ok: true };
});

router.post('/api/auth/change-password', authLimit, async (ctx) => {
  auth.requireAuth(ctx);
  const body = validate(await ctx.body(), { current: v.string({ min: 1, max: 128, trim: false }), next: v.password() });
  await auth.changePassword(ctx, body.current, body.next);
  return { ok: true };
});

router.patch('/api/auth/profile', requireAuth, async (ctx) => {
  const body = validate(await ctx.body(), { name: v.string({ min: 2, max: 60 }), email: v.email() });
  return auth.updateProfile(ctx.userId!, body);
});

router.post('/api/auth/logout-others', requireAuth, (ctx) => {
  auth.revokeOtherSessions(ctx);
  return { ok: true };
});

router.delete('/api/auth/account', authLimit, async (ctx) => {
  auth.requireAuth(ctx);
  const { password } = validate(await ctx.body(), { password: v.string({ min: 1, max: 128, trim: false }) });
  const email = auth.getUser(ctx.userId!)?.email ?? '';
  await auth.login(ctx, email, password); // re-authenticate before destructive action
  invalidateUserCaches(ctx.userId!);
  auth.deleteAccount(ctx);
  refreshUsers();
  return { ok: true };
});

/* ───────────────────────── Market ───────────────────────── */

router.get('/api/health', () => {
  const h = monitor.getHealth();
  return { ok: true, mode: h.mode, stream: h.stream, tradeStream: h.tradeStream, rpcKind: h.rpcKind, tokens: monitor.list().length, telegram: telegram.telegramConfigured() };
});

router.get('/api/stream', (ctx) => {
  auth.requireAuth(ctx);
  addClient(ctx.userId!, ctx.res);
  return undefined; // response is held open
});

router.get('/api/tokens/:mint', requireAuth, async (ctx) => {
  const mint = mintParam(ctx);
  const t = monitor.get(mint) ?? (await monitor.lookup(mint).catch(() => undefined));
  if (!t) throw new HttpError(404, 'Token not found on the radar or market data providers', 'not_found');
  return { token: t, health: monitor.getHealth() };
});

async function tokenOr404(ctx: Ctx) {
  const t = monitor.get(mintParam(ctx));
  if (!t) throw new HttpError(404, 'Token is not currently tracked', 'not_found');
  return t;
}

router.get('/api/tokens/:mint/holders', requireAuth, intelLimit, async (ctx) => getHolderIntel(monitor.chain, await tokenOr404(ctx)));
router.get('/api/tokens/:mint/creator', requireAuth, intelLimit, async (ctx) => {
  const t = await tokenOr404(ctx);
  return { intel: await getCreatorIntel(monitor.chain, t, t.creator ? monitor.creatorLaunches(t.creator).filter((l) => l.mint !== t.id) : []) };
});
router.get('/api/tokens/:mint/verification', requireAuth, async (ctx) => {
  const t = await tokenOr404(ctx);
  const result = verify(t);
  return { result, evidence: evidenceStats(), telegramPreview: result.status === 'TRADEABLE' ? formatVerifiedTelegram(result, config.appUrl) : null };
});
router.get('/api/verification/stats', requireAuth, () => ({ evidence: evidenceStats() }));
router.get('/api/tokens/:mint/security', requireAuth, intelLimit, async (ctx) => (await scanSecurity(monitor.chain, await tokenOr404(ctx))).intel);

/* ───────────────────────── Watchlist ───────────────────────── */

router.get('/api/watchlist', requireAuth, (ctx) => ({ items: getWatchlist(ctx.userId!) }));
router.post('/api/watchlist', requireAuth, async (ctx) => {
  const { mint } = validate(await ctx.body(), { mint: v.mint() });
  if ((one<{ n: number }>('SELECT COUNT(*) AS n FROM watchlist WHERE user_id = ?', ctx.userId!)?.n ?? 0) >= 200) throw new HttpError(422, 'Watchlist limit reached (200)', 'limit');
  addWatch(ctx.userId!, mint);
  return { items: getWatchlist(ctx.userId!) };
});
router.delete('/api/watchlist/:mint', requireAuth, (ctx) => {
  removeWatch(ctx.userId!, mintParam(ctx));
  return { items: getWatchlist(ctx.userId!) };
});
router.delete('/api/watchlist', requireAuth, (ctx) => {
  clearWatch(ctx.userId!);
  return { items: [] };
});

/* ───────────────────────── Alerts ───────────────────────── */

router.get('/api/alerts', requireAuth, (ctx) => ({ alerts: listAlerts(ctx.userId!) }));
router.post('/api/alerts/read-all', requireAuth, (ctx) => {
  run('UPDATE alerts SET read = 1 WHERE user_id = ?', ctx.userId!);
  return { ok: true };
});
router.post('/api/alerts/:id/read', requireAuth, async (ctx) => {
  const { read } = validate(await ctx.body(), { read: v.boolean() });
  run('UPDATE alerts SET read = ? WHERE id = ? AND user_id = ?', read ? 1 : 0, ctx.params.id, ctx.userId!);
  return { ok: true };
});
router.delete('/api/alerts/:id', requireAuth, (ctx) => {
  run('DELETE FROM alerts WHERE id = ? AND user_id = ?', ctx.params.id, ctx.userId!);
  return { ok: true };
});
router.delete('/api/alerts', requireAuth, (ctx) => {
  run('DELETE FROM alerts WHERE user_id = ?', ctx.userId!);
  return { ok: true };
});

/* ───────────────────────── Settings ───────────────────────── */

const clampNum = (val: unknown, min: number, max: number, fallback: number) => (typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback);
const bool = (val: unknown, fallback: boolean) => (typeof val === 'boolean' ? val : fallback);

function sanitizeSettings(input: unknown, current: UserSettings): UserSettings {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Expected settings object', 'bad_request');
  const i = input as Partial<Record<keyof UserSettings, Record<string, unknown>>>;
  const n = { ...current.notifications, ...i.notifications };
  const a = { ...current.alerts, ...i.alerts };
  const tr = { ...current.trading, ...i.trading };
  const tg = { ...current.telegram, ...i.telegram };
  const d = DEFAULT_SETTINGS;
  return {
    notifications: {
      inApp: bool(n.inApp, d.notifications.inApp),
      sound: bool(n.sound, d.notifications.sound),
      browser: bool(n.browser, d.notifications.browser),
      critical: bool(n.critical, true),
      warning: bool(n.warning, true),
      info: bool(n.info, true),
    },
    alerts: {
      newTokens: bool(a.newTokens, true),
      newTokenMinScore: clampNum(a.newTokenMinScore, 0, 100, d.alerts.newTokenMinScore),
      priceMovePct: clampNum(a.priceMovePct, 5, 500, d.alerts.priceMovePct),
      scoreThreshold: clampNum(a.scoreThreshold, 1, 100, d.alerts.scoreThreshold),
      riskJump: clampNum(a.riskJump, 1, 100, d.alerts.riskJump),
      liquidityDropPct: clampNum(a.liquidityDropPct, 5, 95, d.alerts.liquidityDropPct),
      volumeSpikeX: clampNum(a.volumeSpikeX, 1.2, 50, d.alerts.volumeSpikeX),
      largeSellUsd: clampNum(a.largeSellUsd, 50, 10_000_000, d.alerts.largeSellUsd),
      creatorSell: bool(a.creatorSell, true),
      smartMoney: bool(a.smartMoney, true),
      watchMinScore: clampNum(a.watchMinScore, 0, 100, d.alerts.watchMinScore),
      watchMaxRisk: clampNum(a.watchMaxRisk, 0, 100, d.alerts.watchMaxRisk),
    },
    trading: {
      riskPerTradePct: clampNum(tr.riskPerTradePct, 0.1, 20, d.trading.riskPerTradePct),
      maxPositionPct: clampNum(tr.maxPositionPct, 1, 100, d.trading.maxPositionPct),
      defaultStopLossPct: clampNum(tr.defaultStopLossPct, 1, 95, d.trading.defaultStopLossPct),
      defaultTakeProfitPct: clampNum(tr.defaultTakeProfitPct, 1, 5000, d.trading.defaultTakeProfitPct),
    },
    telegram: {
      enabled: bool(tg.enabled, true),
      mode: tg.mode === 'strict' ? 'strict' : 'score',
      minScore: clampNum(tg.minScore, 0, 100, d.telegram.minScore),
    },
  };
}

router.get('/api/settings', requireAuth, (ctx) => ({ settings: getSettings(ctx.userId!) }));
router.put('/api/settings', requireAuth, async (ctx) => {
  const next = sanitizeSettings(await ctx.body(), getSettings(ctx.userId!));
  saveSettings(ctx.userId!, next);
  return { settings: next };
});

/* ───────────────────────── Paper trading ───────────────────────── */

router.get('/api/portfolio', requireAuth, (ctx) => ({ portfolio: trading.getPortfolio(ctx.userId!), fee: trading.FEE_RATE, slippage: trading.SLIPPAGE }));
router.post('/api/portfolio/trades', requireVerified, tradeLimit, async (ctx) => {
  const b = validate(await ctx.body(), {
    mint: v.mint(),
    side: v.oneOf(['buy', 'sell'] as const),
    quantity: v.optional(v.number({ min: 0 })),
    usd: v.optional(v.number({ min: 0.01, max: 1e9 })),
    stopLoss: v.optional(v.number({ min: 0 })),
    takeProfit: v.optional(v.number({ min: 0 })),
  });
  if (b.quantity === undefined && b.usd === undefined) throw new HttpError(422, 'Provide a quantity or USD amount', 'validation_error', { quantity: 'Required' });
  const transaction = await trading.execute(ctx.userId!, b);
  return { transaction, portfolio: trading.getPortfolio(ctx.userId!) };
});
router.patch('/api/portfolio/positions/:mint', requireAuth, async (ctx) => {
  const body = (await ctx.body()) as { stopLoss?: unknown; takeProfit?: unknown };
  const parse = (val: unknown, field: string) => (val === null || val === undefined || val === '' ? null : v.number({ min: 0 })(val, field));
  try {
    trading.setOrders(ctx.userId!, mintParam(ctx), { stopLoss: parse(body.stopLoss, 'stopLoss'), takeProfit: parse(body.takeProfit, 'takeProfit') });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, e instanceof Error ? e.message : 'Invalid value', 'validation_error');
  }
  return { portfolio: trading.getPortfolio(ctx.userId!) };
});
router.post('/api/portfolio/reset', requireAuth, (ctx) => {
  trading.resetPortfolio(ctx.userId!);
  invalidateHeld(ctx.userId!);
  return { portfolio: trading.getPortfolio(ctx.userId!) };
});

/* ───────────────────────── Telegram ───────────────────────── */

router.get('/api/telegram', requireAuth, (ctx) => ({ status: telegram.getStatus(ctx.userId!) }));
router.post('/api/telegram/link', requireVerified, rateLimit('tglink', 5, 2), (ctx) => telegram.createLinkCode(ctx.userId!));
router.post('/api/telegram/test', requireVerified, rateLimit('tgtest', 3, 2), async (ctx) => telegram.sendTest(ctx.userId!));
router.delete('/api/telegram', requireAuth, (ctx) => {
  telegram.disconnect(ctx.userId!);
  return { status: telegram.getStatus(ctx.userId!) };
});

/* ───────────────────────── Reports ───────────────────────── */

router.get('/api/reports', requireAuth, (ctx) => ({
  reports: all<{ json: string }>('SELECT json FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', ctx.userId!).map((r) => JSON.parse(r.json) as DailyReport),
}));
router.post('/api/reports', requireAuth, rateLimit('report', 10, 5), (ctx) => {
  const report = generateDailyReport(monitor.list(), monitor.getHealth().mode);
  run('INSERT INTO reports (id, user_id, json, created_at) VALUES (?, ?, ?, ?)', report.id, ctx.userId!, JSON.stringify(report), report.generatedAt);
  run('DELETE FROM reports WHERE user_id = ? AND id NOT IN (SELECT id FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 30)', ctx.userId!, ctx.userId!);
  return { report };
});
router.delete('/api/reports/:id', requireAuth, (ctx) => {
  run('DELETE FROM reports WHERE id = ? AND user_id = ?', ctx.params.id, ctx.userId!);
  return { ok: true };
});
