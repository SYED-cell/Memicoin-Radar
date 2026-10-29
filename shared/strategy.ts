import type { Token, TradePlan } from './types.ts';

/**
 * The trading rules, written once.
 *
 * Everywhere else in this app answers "where would I get in". None of it answers the questions
 * that decide whether a run of trades makes or loses money: how much to buy, when to refuse the
 * trade at all, what to do after it moves, and when to give up on one that does nothing. Those
 * live here, so the plan the screen shows, the plan the bot sends and the plan the tracker scores
 * are the same plan — a rule that is only in the UI cannot be measured, and a rule that is only in
 * the bot cannot be argued with.
 *
 * What this is not: a prediction. Every number below is a rule about OUR behaviour — size, exit,
 * abandonment — not a claim about the coin's. The edge, if there is one, has to show up in the
 * recorded outcomes; the strategy's job is to make sure a win is bigger than a loss and that no
 * single trade can end the account.
 */

export interface StrategyConfig {
  /** Share of the account allowed to be lost if the stop fills. The whole position size falls out of this. */
  riskPctPerTrade: number;
  /** No single position may exceed this share of the account, however tight the stop is. */
  maxPositionPctOfAccount: number;
  /**
   * No position may exceed this share of the pool's liquidity. On a thin meme coin your own exit
   * moves the price, so a position sized only against the account can be unsellable at the number
   * that justified it.
   */
  maxPositionPctOfLiquidity: number;
  /** Below this reward-for-risk the trade is refused, however good it looks. */
  minRiskReward: number;
  /** Opportunity score floor. */
  minScore: number;
  /** Risk score ceiling. */
  maxRisk: number;
  /** A pool this thin cannot be exited at any size worth taking. */
  minLiquidityUsd: number;
  /** Liquidity must be at least this share of market cap, or the price is paper. */
  minLiquidityToMcap: number;
  /** Flat exit if neither the first target nor the stop has been touched in this long. */
  timeStopMin: number;
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  riskPctPerTrade: 2,
  maxPositionPctOfAccount: 20,
  maxPositionPctOfLiquidity: 1,
  minRiskReward: 2,
  minScore: 60,
  maxRisk: 70,
  minLiquidityUsd: 5_000,
  minLiquidityToMcap: 0.03,
  timeStopMin: 60,
};

/** One rung of the exit ladder. The shares sum to 100: the position is always fully planned out. */
export interface ExitRule {
  label: string;
  price: number;
  /** Share of the original position sold here. */
  sharePct: number;
  /** What to do with the stop once this rung fills. */
  thenStop: 'unchanged' | 'break-even' | 'trail-to-previous';
  reason: string;
}

export interface Sizing {
  /** Dollars of the account at risk if the stop fills — the input, not the outcome. */
  riskUsd: number;
  /** Dollars to put in. */
  positionUsd: number;
  /** That position as a share of the account. */
  positionPctOfAccount: number;
  /** Which rule actually decided the size. Worth surfacing: it is usually not the one people expect. */
  cappedBy: 'risk' | 'account' | 'liquidity';
}

export interface TradeSetup {
  source: 'model' | 'price-action';
  entries: TradePlan['entries'];
  stop: number;
  stopPct: number;
  exits: ExitRule[];
  sizing: Sizing;
  timeStopMin: number;
  rr: number;
  invalidation: string[];
}

export type StrategyVerdict = { take: true; setup: TradeSetup } | { take: false; reasons: string[] };

/**
 * Why a setup is refused. Collected as a list rather than returning on the first failure: when a
 * coin is rejected you want to know everything wrong with it, not just whichever check ran first.
 */
export function disqualify(t: Token, plan: TradePlan, cfg: StrategyConfig = DEFAULT_STRATEGY): string[] {
  const reasons: string[] = [];
  if (t.signal === 'AVOID') reasons.push('Rated AVOID');
  if (t.signal === 'INSUFFICIENT DATA') reasons.push('Not enough data to rate it');
  if (t.score < cfg.minScore) reasons.push(`Opportunity ${t.score} is below ${cfg.minScore}`);
  if (t.riskScore > cfg.maxRisk) reasons.push(`Risk ${t.riskScore} is above ${cfg.maxRisk}`);
  if (t.liquidity < cfg.minLiquidityUsd) reasons.push(`Liquidity ${Math.round(t.liquidity)} is below ${cfg.minLiquidityUsd}`);
  if (t.marketCap > 0 && t.liquidity / t.marketCap < cfg.minLiquidityToMcap) {
    reasons.push(`Liquidity is only ${((t.liquidity / t.marketCap) * 100).toFixed(1)}% of market cap`);
  }
  if (plan.rr < cfg.minRiskReward) reasons.push(`Reward-for-risk ${plan.rr.toFixed(2)} is below ${cfg.minRiskReward}`);
  if (!(plan.stop > 0) || plan.stop >= plan.entryHigh) reasons.push('Stop is not below the entry');
  return reasons;
}

/**
 * Position size, from the stop outwards.
 *
 * The stop decides the size, not the other way round: risk a fixed slice of the account, divide by
 * how far the stop is, and that is how much to buy. Then two caps that have nothing to do with
 * conviction — never too much of the account, never too much of the pool.
 */
export function sizePosition(equityUsd: number, entry: number, stop: number, liquidityUsd: number, cfg: StrategyConfig = DEFAULT_STRATEGY): Sizing {
  const stopDistance = (entry - stop) / entry;
  const riskUsd = (equityUsd * cfg.riskPctPerTrade) / 100;
  // A stop 25% away means $200 of risk buys $800 of coin.
  const byRisk = stopDistance > 0 ? riskUsd / stopDistance : 0;
  const byAccount = (equityUsd * cfg.maxPositionPctOfAccount) / 100;
  const byLiquidity = (liquidityUsd * cfg.maxPositionPctOfLiquidity) / 100;

  const positionUsd = Math.max(0, Math.min(byRisk, byAccount, byLiquidity));
  const cappedBy: Sizing['cappedBy'] = positionUsd === byLiquidity && byLiquidity < byRisk ? 'liquidity' : positionUsd === byAccount && byAccount < byRisk ? 'account' : 'risk';

  return {
    riskUsd: Math.round(riskUsd * 100) / 100,
    positionUsd: Math.round(positionUsd * 100) / 100,
    positionPctOfAccount: equityUsd > 0 ? Math.round((positionUsd / equityUsd) * 1000) / 10 : 0,
    cappedBy,
  };
}

/**
 * The exit ladder.
 *
 * Most of the position comes off at the first target, because on a coin this thin the first move
 * is the one most likely to exist. Taking that much early then lets the stop move up to the entry,
 * which caps what a reversal costs on the rest.
 *
 * It does NOT make the trade risk-free, and it is worth being exact about why. A stop is a price
 * we watch, not a price we are guaranteed. In testing, a position whose stop had moved to the
 * entry at 2.4464e-5 filled at 1.8846e-5 — the price gapped straight through between two updates
 * and the remainder sold 23% below the stop. "Break-even" means the order rests at the entry, not
 * that the trade can no longer lose.
 */
export function buildExits(plan: TradePlan): ExitRule[] {
  return [
    {
      label: 'Target 1',
      price: plan.tp1,
      sharePct: 40,
      thenStop: 'break-even',
      reason: 'Take the move most likely to exist, then lift the stop to the entry to cap the rest',
    },
    { label: 'Target 2', price: plan.tp2, sharePct: 35, thenStop: 'trail-to-previous', reason: 'Trail the stop up behind the last rung' },
    { label: 'Target 3', price: plan.tp3, sharePct: 25, thenStop: 'unchanged', reason: 'The tail, if it runs' },
  ];
}

/**
 * A plan expressed in market caps, converted to per-token prices.
 *
 * `buildLevelsPlan` reads a coin's recorded market caps, so every number it returns is a market
 * cap. A bot that compares those to a per-token price will stop out on the first tick of every
 * trade it ever opens — a stop of 12,990 is "above" a price of 0.00001536 — and it will do it
 * silently, because the arithmetic is valid and only the units are wrong.
 *
 * Scaling by price/marketCap rather than dividing by supply keeps it correct when supply is
 * missing or stale, which it often is for a coin minutes old.
 */
export function inPriceTerms(plan: TradePlan, marketCap: number, price: number): TradePlan | null {
  if (!(marketCap > 0) || !(price > 0)) return null;
  const scale = price / marketCap;
  const at = (v: number) => v * scale;
  return {
    ...plan,
    entryLow: at(plan.entryLow),
    entryHigh: at(plan.entryHigh),
    entries: plan.entries.map((e) => ({ ...e, price: at(e.price) })),
    stop: at(plan.stop),
    tp1: at(plan.tp1),
    tp2: at(plan.tp2),
    tp3: at(plan.tp3),
    // stopPct and rr are ratios: they are the same number in either unit.
  };
}

/* ── Managing a position that is already open ─────────────────────────────── */

export interface BotPosition {
  /** Average fill price of the position. */
  entry: number;
  /** Size the position was opened at, which is what every rung's share is measured against. */
  originalQty: number;
  /** Size still held. */
  remainingQty: number;
  /** The stop as it stands now — it moves up as rungs fill. */
  stop: number;
  /** Indexes of the exit rungs already taken. */
  filled: number[];
  openedAt: number;
}

export type BotAction =
  | { type: 'hold' }
  | { type: 'take'; rungs: number[]; quantity: number; newStop: number | null; reason: string }
  | { type: 'close'; quantity: number; cause: 'stop' | 'time-stop'; reason: string };

/**
 * What to do with an open position at this price, right now.
 *
 * The stop is checked first as a matter of precedence, though with a single observed price the
 * two cannot both be true: the stop sits below the entry and the targets above it, and when the
 * stop later trails upward it only ever reaches the rung below the next target.
 *
 * What this deliberately does NOT do is infer the path between two polls. The bot sees prices, not
 * candles, so a move that went through a target and back before the next update is simply missed —
 * which is the honest outcome. Claiming the fill would mean booking a profit on a price this
 * position never actually got.
 *
 * A single price above several unfilled rungs takes all of them at once, because that is what
 * happens when the order is actually sent.
 */
export function nextAction(pos: BotPosition, exits: ExitRule[], price: number, now: number, timeStopMin: number): BotAction {
  if (pos.remainingQty <= 0) return { type: 'hold' };

  if (price <= pos.stop) {
    const atBreakEven = pos.stop >= pos.entry;
    return {
      type: 'close',
      quantity: pos.remainingQty,
      cause: 'stop',
      reason: atBreakEven ? 'Stop at break-even was hit — the trade is closed flat' : `Stop at ${pos.stop.toPrecision(6)} was hit`,
    };
  }

  const reached = exits.map((e, i) => ({ e, i })).filter(({ e, i }) => !pos.filled.includes(i) && price >= e.price);
  if (reached.length) {
    const sharePct = reached.reduce((s, { e }) => s + e.sharePct, 0);
    // Shares are of the original size, and the last rung must not try to sell more than is left.
    const quantity = Math.min(pos.remainingQty, (pos.originalQty * sharePct) / 100);
    const movesToBreakEven = reached.some(({ e }) => e.thenStop === 'break-even');
    const trails = reached.some(({ e }) => e.thenStop === 'trail-to-previous');
    const highest = reached[reached.length - 1];
    const newStop = movesToBreakEven
      ? Math.max(pos.stop, pos.entry)
      : trails
        ? Math.max(pos.stop, exits[highest.i - 1]?.price ?? pos.entry)
        : null;
    return {
      type: 'take',
      rungs: reached.map(({ i }) => i),
      quantity,
      newStop,
      reason: reached.map(({ e }) => e.label).join(' + ') + ' reached',
    };
  }

  if (now - pos.openedAt >= timeStopMin * 60_000) {
    return {
      type: 'close',
      quantity: pos.remainingQty,
      cause: 'time-stop',
      reason: `No target and no stop in ${timeStopMin} minutes — closed rather than held`,
    };
  }

  return { type: 'hold' };
}

/** The whole decision: take it with this plan, or refuse it with reasons. */
export function evaluateStrategy(t: Token, plan: TradePlan, equityUsd: number, cfg: StrategyConfig = DEFAULT_STRATEGY): StrategyVerdict {
  const reasons = disqualify(t, plan, cfg);
  if (reasons.length) return { take: false, reasons };

  const entry = plan.entries[0]?.price ?? plan.entryHigh;
  const sizing = sizePosition(equityUsd, entry, plan.stop, t.liquidity, cfg);
  if (sizing.positionUsd <= 0) return { take: false, reasons: ['Position would be zero at this account size'] };

  return {
    take: true,
    setup: {
      source: 'price-action',
      entries: plan.entries,
      stop: plan.stop,
      stopPct: plan.stopPct,
      exits: buildExits(plan),
      sizing,
      timeStopMin: cfg.timeStopMin,
      rr: plan.rr,
      invalidation: [
        ...plan.invalidation,
        `Nothing happens for ${cfg.timeStopMin} minutes — close it and move on`,
      ],
    },
  };
}
