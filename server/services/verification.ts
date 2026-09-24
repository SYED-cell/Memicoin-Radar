import { uid } from '../../shared/random.ts';
import type { Alert, EvidenceStats, Token, VerificationResult } from '../../shared/types.ts';
import { formatVerifiedTelegram, isTrackableSetup, STRICT, summarizeVerification, verifyToken, type OutcomeSample } from '../../shared/verification.ts';
import { all, one, run } from '../db.ts';
import { config } from '../env.ts';
import { log } from '../lib/log.ts';
import { monitor } from '../pipeline/monitor.ts';
import { allUserIdsCached, deliver } from './alerts.ts';
import { enqueue } from './telegram.ts';
import { getSettings } from './userData.ts';

/**
 * Strict verified-coin filter (server side):
 *  1. Re-verifies tokens as data changes and publishes a compact verdict to clients.
 *  2. Outcome tracker: records every setup that passes the core safety/activity checks and, after
 *     STRICT.outcomeHorizonMin, stores what actually happened. These real outcomes are the ONLY
 *     basis for probabilities, targets and risk/reward — no outcomes, no estimates, no alert.
 *  3. Sends an alert (in-app + Telegram) only when a token passes all 14 checks.
 */

const HORIZON_MS = STRICT.outcomeHorizonMin * 60_000;
const SAMPLE_COOLDOWN_MS = 2 * 3_600_000;
const ALERT_COOLDOWN_MS = 6 * 3_600_000;
const VERIFY_THROTTLE_MS = 5_000;

let samples: OutcomeSample[] = [];
const lastVerified = new Map<string, number>();
const lastRescan = new Map<string, number>();

function loadSamples() {
  samples = all<{ score: number; risk: number; return_pct: number; max_up_pct: number; max_dd_pct: number; taken_at: number }>(
    "SELECT score, risk, return_pct, max_up_pct, max_dd_pct, taken_at FROM setup_samples WHERE status = 'resolved' AND taken_at > ? ORDER BY taken_at DESC LIMIT 5000",
    Date.now() - 30 * 86_400_000,
  ).map((r) => ({ score: r.score, risk: r.risk, returnPct: r.return_pct, maxUpPct: r.max_up_pct, maxDrawdownPct: r.max_dd_pct, takenAt: r.taken_at }));
}

export function verify(t: Token): VerificationResult {
  return verifyToken(t, samples);
}

export function evidenceStats(): EvidenceStats {
  const counts = one<{ total: number; resolved: number; pending: number; first: number | null; last: number | null }>(
    "SELECT COUNT(*) AS total, SUM(status = 'resolved') AS resolved, SUM(status = 'pending') AS pending, MIN(taken_at) AS first, MAX(CASE WHEN status = 'resolved' THEN resolved_at END) AS last FROM setup_samples",
  );
  return {
    samples: counts?.total ?? 0,
    resolved: counts?.resolved ?? 0,
    pending: counts?.pending ?? 0,
    required: STRICT.minComparables,
    horizonMin: STRICT.outcomeHorizonMin,
    firstAt: counts?.first ?? null,
    lastResolvedAt: counts?.last ?? null,
  };
}

function recordSample(t: Token, now: number) {
  const recent = one('SELECT 1 FROM setup_samples WHERE mint = ? AND taken_at > ?', t.mint, now - SAMPLE_COOLDOWN_MS);
  if (recent || !(t.price > 0)) return;
  run('INSERT INTO setup_samples (id, mint, symbol, taken_at, score, risk, entry_price) VALUES (?, ?, ?, ?, ?, ?, ?)', uid('smp_'), t.mint, t.symbol, now, t.score, t.riskScore, t.price);
  log.info('verify', `outcome tracker: recorded setup $${t.symbol} (score ${t.score}, risk ${t.riskScore})`);
}

/** Resolves setups whose horizon has elapsed using the recorded price path. */
async function resolveSamples() {
  const due = all<{ id: string; mint: string; taken_at: number; entry_price: number }>("SELECT id, mint, taken_at, entry_price FROM setup_samples WHERE status = 'pending' AND taken_at <= ? LIMIT 50", Date.now() - HORIZON_MS);
  for (const s of due) {
    const t = monitor.get(s.mint) ?? (await monitor.lookup(s.mint).catch(() => undefined));
    const end = s.taken_at + HORIZON_MS;
    const path = (t?.history ?? []).filter((h) => h.t >= s.taken_at && h.t <= end + 60_000 && h.price > 0);
    // Exit = the last recorded price at or before the horizon; without a path we cannot score it honestly.
    const exit = path.length ? path[path.length - 1].price : null;
    if (!exit || !t || path.length < 3) {
      run("UPDATE setup_samples SET status = 'untracked', resolved_at = ? WHERE id = ?", Date.now(), s.id);
      continue;
    }
    const max = Math.max(...path.map((p) => p.price));
    const min = Math.min(...path.map((p) => p.price));
    run(
      "UPDATE setup_samples SET status = 'resolved', resolved_at = ?, exit_price = ?, return_pct = ?, max_up_pct = ?, max_dd_pct = ? WHERE id = ?",
      Date.now(),
      exit,
      (exit / s.entry_price - 1) * 100,
      (max / s.entry_price - 1) * 100,
      (min / s.entry_price - 1) * 100,
      s.id,
    );
  }
  if (due.length) loadSamples();
}

function sendVerifiedAlert(v: VerificationResult, t: Token, now: number) {
  const sent = one<{ sent_at: number }>('SELECT sent_at FROM verified_alerts WHERE mint = ?', t.mint);
  if (sent && now - sent.sent_at < ALERT_COOLDOWN_MS) return;
  run('INSERT INTO verified_alerts (mint, sent_at) VALUES (?, ?) ON CONFLICT(mint) DO UPDATE SET sent_at = excluded.sent_at', t.mint, now);
  const text = formatVerifiedTelegram(v, config.appUrl);
  const plan = v.estimates.plan;
  log.info('verify', `$${t.symbol} passed all ${v.total} strict checks — alerting`);
  for (const userId of allUserIdsCached()) {
    const alert: Alert = {
      id: uid('al_'),
      severity: 'info',
      category: 'verified',
      tokenId: t.id,
      symbol: t.symbol,
      title: `Passed all ${v.total} strict checks`,
      message: plan ? `Opportunity ${v.opportunityScore}/100 · Risk ${v.riskScore}/100 · R/R ${plan.rr.toFixed(2)} · model estimate, not a prediction` : `Opportunity ${v.opportunityScore}/100 · Risk ${v.riskScore}/100`,
      createdAt: now,
      read: false,
    };
    // Score-mode users get their Telegram report from sendScoreReports instead.
    deliver(userId, [alert], t, getSettings(userId).telegram.mode === 'strict' ? text : undefined);
  }
}

/**
 * Score mode: every analysed token whose opportunity score reaches the user's minimum is reported
 * to Telegram with its explicit status (TRADEABLE / WATCH / AVOID / INSUFFICIENT DATA), once per
 * token per cooldown. Tokens the engine could not analyse at all (signal INSUFFICIENT DATA) are skipped.
 */
function sendScoreReports(v: VerificationResult, t: Token, now: number) {
  if (t.signal === 'INSUFFICIENT DATA') return;
  let text: string | null = null;
  for (const userId of allUserIdsCached()) {
    const tg = getSettings(userId).telegram;
    if (!tg.enabled || tg.mode !== 'score' || t.score < tg.minScore) continue;
    const sent = one<{ sent_at: number }>('SELECT sent_at FROM telegram_sent WHERE user_id = ? AND mint = ?', userId, t.mint);
    if (sent && now - sent.sent_at < ALERT_COOLDOWN_MS) continue;
    text ??= formatVerifiedTelegram(v, config.appUrl);
    if (enqueue(userId, text)) {
      run('INSERT INTO telegram_sent (user_id, mint, sent_at) VALUES (?, ?, ?) ON CONFLICT(user_id, mint) DO UPDATE SET sent_at = excluded.sent_at', userId, t.mint, now);
      log.info('telegram', `queued $${t.symbol} (score ${t.score}, ${v.status})`);
    }
  }
}

function onTransition(prev: Token, next: Token) {
  const now = Date.now();
  if (now - (lastVerified.get(next.id) ?? 0) < VERIFY_THROTTLE_MS && next.verify?.status !== 'TRADEABLE') return;
  lastVerified.set(next.id, now);
  const v = verify(next);
  const summary = summarizeVerification(v);
  const prevStatus = prev.verify?.status ?? next.verify?.status;
  if (next.verify?.status !== summary.status || next.verify.passed !== summary.passed) {
    monitor.patch(next.id, (t) => ({ ...t, verify: summary }));
  }

  // Keep on-chain evidence fresh for promising tokens.
  const onchain = v.checks.find((c) => c.key === 'onchain');
  if (onchain?.outcome !== 'pass' && v.passed >= 9 && now - (lastRescan.get(next.id) ?? 0) > 10 * 60_000) {
    lastRescan.set(next.id, now);
    monitor.requestRescan(next.id);
  }

  if (isTrackableSetup(v)) recordSample(next, now);
  if (v.status === 'TRADEABLE' && prevStatus !== 'TRADEABLE') sendVerifiedAlert(v, next, now);
  sendScoreReports(v, next, now);
}

let timers: ReturnType<typeof setInterval>[] = [];

export function startVerification() {
  loadSamples();
  monitor.on('transition', (prev: Token, next: Token) => {
    try {
      onTransition(prev, next);
    } catch (err) {
      log.error('verify', 'verification failed', err);
    }
  });
  timers = [
    setInterval(() => void resolveSamples().catch((e: unknown) => log.warn('verify', 'resolve failed', e)), 60_000),
    setInterval(() => {
      if (lastVerified.size > 20_000) lastVerified.clear();
    }, 3_600_000),
  ];
  const s = evidenceStats();
  log.info('verify', `strict filter ready · ${s.resolved} resolved outcomes (${STRICT.minComparables} comparable outcomes required before any alert)`);
}

export function stopVerification() {
  timers.forEach(clearInterval);
}
