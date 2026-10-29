import { uid } from '../../shared/random.ts';
import { buildLevelsPlan } from '../../shared/levels.ts';
import { buildExits, DEFAULT_STRATEGY, evaluateStrategy, inPriceTerms, nextAction, type BotPosition, type ExitRule, type StrategyConfig } from '../../shared/strategy.ts';
import type { Alert, Token } from '../../shared/types.ts';
import { all, one, run } from '../db.ts';
import { log } from '../lib/log.ts';
import { monitor } from '../pipeline/monitor.ts';
import { isPro } from './billing.ts';
import { deliver } from './alerts.ts';
import { equityValue, execute, getPortfolio } from './trading.ts';

/**
 * The paper trading bot.
 *
 * It applies `shared/strategy.ts` without a human in the loop: it finds setups that qualify, sizes
 * them from the stop, and then manages the exit ladder until the position is gone. Every fill goes
 * through the same paper engine a manual trade does, so fees, slippage, position caps and the
 * recorded setup context are identical — a bot trade and a hand trade are comparable afterwards,
 * which is the only way to tell whether the rules are worth anything.
 *
 * This moves PAPER money. There is no wallet, no key and no signing anywhere in this application,
 * and nothing here can place a real order. That is a property of the design, not a setting.
 */

export interface BotSettings {
  enabled: boolean;
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  minScore: number;
  maxRisk: number;
  timeStopMin: number;
}

const DEFAULTS: BotSettings = {
  enabled: false,
  riskPct: DEFAULT_STRATEGY.riskPctPerTrade,
  maxPositions: 3,
  maxPositionPct: DEFAULT_STRATEGY.maxPositionPctOfAccount,
  minScore: DEFAULT_STRATEGY.minScore,
  maxRisk: DEFAULT_STRATEGY.maxRisk,
  timeStopMin: DEFAULT_STRATEGY.timeStopMin,
};

interface SettingsRow {
  enabled: number;
  risk_pct: number;
  max_positions: number;
  max_position_pct: number;
  min_score: number;
  max_risk: number;
  time_stop_min: number;
}

export function getBotSettings(userId: string): BotSettings {
  const r = one<SettingsRow>('SELECT * FROM bot_settings WHERE user_id = ?', userId);
  if (!r) return { ...DEFAULTS };
  return {
    enabled: Boolean(r.enabled),
    riskPct: r.risk_pct,
    maxPositions: r.max_positions,
    maxPositionPct: r.max_position_pct,
    minScore: r.min_score,
    maxRisk: r.max_risk,
    timeStopMin: r.time_stop_min,
  };
}

/** Bounds are enforced here, not in the UI: the API is reachable without it. */
export function saveBotSettings(userId: string, patch: Partial<BotSettings>): BotSettings {
  const cur = getBotSettings(userId);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const next: BotSettings = {
    enabled: patch.enabled ?? cur.enabled,
    riskPct: clamp(patch.riskPct ?? cur.riskPct, 0.25, 10),
    maxPositions: Math.round(clamp(patch.maxPositions ?? cur.maxPositions, 1, 10)),
    maxPositionPct: clamp(patch.maxPositionPct ?? cur.maxPositionPct, 1, 50),
    minScore: Math.round(clamp(patch.minScore ?? cur.minScore, 50, 100)),
    maxRisk: Math.round(clamp(patch.maxRisk ?? cur.maxRisk, 0, 100)),
    timeStopMin: Math.round(clamp(patch.timeStopMin ?? cur.timeStopMin, 5, 24 * 60)),
  };
  run(
    `INSERT INTO bot_settings (user_id, enabled, risk_pct, max_positions, max_position_pct, min_score, max_risk, time_stop_min, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, risk_pct = excluded.risk_pct, max_positions = excluded.max_positions,
       max_position_pct = excluded.max_position_pct, min_score = excluded.min_score, max_risk = excluded.max_risk,
       time_stop_min = excluded.time_stop_min, updated_at = excluded.updated_at`,
    userId,
    next.enabled ? 1 : 0,
    next.riskPct,
    next.maxPositions,
    next.maxPositionPct,
    next.minScore,
    next.maxRisk,
    next.timeStopMin,
    Date.now(),
  );
  return next;
}

const configFor = (s: BotSettings): StrategyConfig => ({
  ...DEFAULT_STRATEGY,
  riskPctPerTrade: s.riskPct,
  maxPositionPctOfAccount: s.maxPositionPct,
  minScore: s.minScore,
  maxRisk: s.maxRisk,
  timeStopMin: s.timeStopMin,
});

export interface PlanRow {
  id: string;
  user_id: string;
  mint: string;
  symbol: string;
  status: 'open' | 'closed';
  entry: number;
  original_qty: number;
  stop: number;
  initial_stop: number;
  exits: string;
  filled: string;
  time_stop_min: number;
  opened_at: number;
  closed_at: number | null;
  close_cause: string | null;
  realized_pnl: number;
}

export function listPlans(userId: string, limit = 50) {
  return all<PlanRow>('SELECT * FROM bot_plans WHERE user_id = ? ORDER BY opened_at DESC LIMIT ?', userId, limit).map((r) => ({
    id: r.id,
    mint: r.mint,
    symbol: r.symbol,
    status: r.status,
    entry: r.entry,
    originalQty: r.original_qty,
    stop: r.stop,
    initialStop: r.initial_stop,
    exits: JSON.parse(r.exits) as ExitRule[],
    filled: JSON.parse(r.filled) as number[],
    timeStopMin: r.time_stop_min,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    closeCause: r.close_cause,
    realizedPnl: r.realized_pnl,
  }));
}

function alertFor(userId: string, token: Token, title: string, message: string, severity: Alert['severity']) {
  deliver(
    userId,
    [{ id: uid('al_'), severity, category: 'trade', tokenId: token.id, symbol: token.symbol, title, message, createdAt: Date.now(), read: false }],
    token,
  );
}

/* ─────────── Entries ─────────── */

/** Accounts the bot is allowed to act for: switched on, and Pro. */
function activeUsers(): string[] {
  return all<{ user_id: string }>('SELECT user_id FROM bot_settings WHERE enabled = 1')
    .map((r) => r.user_id)
    .filter((id) => isPro(id));
}

async function scanForEntries() {
  const tokens = monitor.list();
  if (!tokens.length) return;

  for (const userId of activeUsers()) {
    try {
      const settings = getBotSettings(userId);
      const open = all<{ n: number }>("SELECT COUNT(*) AS n FROM bot_plans WHERE user_id = ? AND status = 'open'", userId)[0]?.n ?? 0;
      if (open >= settings.maxPositions) continue;

      const portfolio = getPortfolio(userId);
      const equity = equityValue(userId, portfolio.cash);
      const held = new Set(portfolio.positions.map((p) => p.tokenId));
      const cfg = configFor(settings);

      // Best first: the bot takes the strongest qualifying setup, not the first one it trips over.
      const ranked = [...tokens].filter((t) => !held.has(t.id)).sort((a, b) => b.score - a.score);
      for (const token of ranked) {
        // The levels plan is in market caps; everything from here on is a per-token price.
        const plan = inPriceTerms(buildLevelsPlan(token) ?? ({} as never), token.marketCap, token.price);
        if (!plan || !plan.stop) continue;
        const verdict = evaluateStrategy(token, plan, equity, cfg);
        if (!verdict.take) continue;

        // Last line of defence on units: a stop at or above the live price would close the
        // position on its very next tick, so refuse rather than open a trade that cannot live.
        if (!(plan.stop < token.price) || !(plan.tp1 > token.price)) {
          log.warn('bot', `skipping ${token.symbol}: levels do not bracket the price (stop ${plan.stop}, price ${token.price}, tp1 ${plan.tp1})`);
          continue;
        }

        const usd = Math.min(verdict.setup.sizing.positionUsd, portfolio.cash * 0.98);
        if (usd < 1) continue;

        const txn = await execute(userId, { mint: token.id, side: 'buy', usd, reason: 'manual' });
        const exits = buildExits(plan);
        run(
          `INSERT INTO bot_plans (id, user_id, mint, symbol, status, entry, original_qty, stop, initial_stop, exits, filled, time_stop_min, opened_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, '[]', ?, ?)`,
          uid('bp_'),
          userId,
          token.id,
          token.symbol,
          txn.price,
          txn.quantity,
          plan.stop,
          plan.stop,
          JSON.stringify(exits),
          settings.timeStopMin,
          Date.now(),
        );
        alertFor(
          userId,
          token,
          `Bot opened $${token.symbol} (paper)`,
          `${txn.quantity.toFixed(0)} at $${txn.price.toPrecision(4)} · risking $${verdict.setup.sizing.riskUsd.toFixed(2)} · size capped by ${verdict.setup.sizing.cappedBy}`,
          'info',
        );
        break; // one new position per sweep, so a single scan cannot spend the account
      }
    } catch (err) {
      log.warn('bot', `entry scan failed for ${userId}`, err);
    }
  }
}

/* ─────────── Exits ─────────── */

/** Runs on every price update for a coin the bot holds. */
function manageOpen(next: Token) {
  const rows = all<PlanRow>("SELECT * FROM bot_plans WHERE mint = ? AND status = 'open'", next.id);
  for (const r of rows) {
    const portfolio = getPortfolio(r.user_id);
    const pos = portfolio.positions.find((p) => p.tokenId === r.mint);
    if (!pos || pos.quantity <= 0) {
      // Closed by hand, or by the engine's own stop. The plan follows reality rather than arguing.
      run("UPDATE bot_plans SET status = 'closed', closed_at = ?, close_cause = 'closed-elsewhere' WHERE id = ?", Date.now(), r.id);
      continue;
    }

    const position: BotPosition = {
      entry: r.entry,
      originalQty: r.original_qty,
      remainingQty: pos.quantity,
      stop: r.stop,
      filled: JSON.parse(r.filled) as number[],
      openedAt: r.opened_at,
    };
    const exits = JSON.parse(r.exits) as ExitRule[];
    const action = nextAction(position, exits, next.price, Date.now(), r.time_stop_min);
    if (action.type === 'hold') continue;

    const qty = Math.min(action.quantity, pos.quantity);
    if (!(qty > 0)) continue;

    // Claim the work before awaiting, so two price updates cannot sell the same rung twice.
    const claimedFilled = action.type === 'take' ? [...position.filled, ...action.rungs] : position.filled;
    if (action.type === 'take') {
      run('UPDATE bot_plans SET filled = ?, stop = ? WHERE id = ?', JSON.stringify(claimedFilled), action.newStop ?? r.stop, r.id);
    } else {
      run("UPDATE bot_plans SET status = 'closed', closed_at = ?, close_cause = ? WHERE id = ?", Date.now(), action.cause, r.id);
    }

    execute(r.user_id, { mint: r.mint, side: 'sell', quantity: qty, reason: action.type === 'close' && action.cause === 'stop' ? 'stop-loss' : 'take-profit' })
      .then((t) => {
        run('UPDATE bot_plans SET realized_pnl = realized_pnl + ? WHERE id = ?', t.realizedPnl ?? 0, r.id);
        const sold = `Sold ${t.quantity.toFixed(0)} at $${t.price.toPrecision(4)} · P/L $${(t.realizedPnl ?? 0).toFixed(2)}`;
        alertFor(r.user_id, next, `Bot ${action.type === 'take' ? 'took profit on' : 'closed'} $${r.symbol} (paper)`, `${action.reason} · ${sold}`, action.type === 'take' ? 'info' : 'warning');
      })
      .catch((err: unknown) => {
        // Put the claim back: an unsold rung must stay sellable rather than be silently skipped.
        if (action.type === 'take') run('UPDATE bot_plans SET filled = ?, stop = ? WHERE id = ?', r.filled, r.stop, r.id);
        else run("UPDATE bot_plans SET status = 'open', closed_at = NULL, close_cause = NULL WHERE id = ?", r.id);
        log.warn('bot', `exit failed for ${r.user_id}/${r.mint}`, err);
      });
  }
}

let scanTimer: ReturnType<typeof setInterval> | undefined;

export function startBot() {
  monitor.on('transition', (_prev: Token, next: Token) => manageOpen(next));
  scanTimer = setInterval(() => {
    void scanForEntries().catch((err: unknown) => log.warn('bot', 'scan failed', err));
  }, 20_000);
  log.info('bot', 'paper trading bot ready (no real funds can be moved by this application)');
}

export function stopBot() {
  clearInterval(scanTimer);
}
