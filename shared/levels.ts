import type { PlanEntry, Token, TradePlan } from './types.ts';

/**
 * Entry levels read from a token's own recorded price action.
 *
 * This is not the strict filter's plan: it has no comparable outcomes behind it and makes no claim
 * about what happens next. It marks where the market cap has actually traded — the floor it has
 * held, the ceiling it has reached — and splits an entry between market and a pullback toward that
 * floor. Use it as structure, not as a recommendation.
 */

export interface LevelsPlan extends TradePlan {
  /** Lowest and highest market cap observed in the window the levels were read from. */
  support: number;
  resistance: number;
  windowMinutes: number;
  samples: number;
}

/** Needs enough points that "the range" means something. */
const MIN_POINTS = 5;

export function buildLevelsPlan(t: Token, now = Date.now(), windowMs = 30 * 60_000): LevelsPlan | null {
  const points = t.history.filter((h) => h.t >= now - windowMs && h.mcap > 0);
  const caps = points.map((h) => h.mcap);
  const current = t.marketCap;
  if (caps.length < MIN_POINTS || !(current > 0)) return null;

  const support = Math.min(...caps);
  const resistance = Math.max(...caps, current);

  // Momentum decides how patient the second entry is: a coin pushing up is waited for less.
  const momentum = t.priceChange5m ?? t.priceChange1h ?? 0;
  const dipPct = Math.max(3, Math.min(12, 8 - momentum / 4));
  const pullback = Math.max(support, current * (1 - dipPct / 100));

  // Stop sits under the observed floor, bounded so a quiet range cannot imply a reckless stop.
  const stop = Math.max(support * 0.9, current * 0.75);
  const stopPct = ((current - stop) / current) * 100;

  const range = Math.max(resistance - support, current * 0.05);
  const tp1 = Math.max(resistance, current * 1.05);
  const tp2 = tp1 + range;
  const tp3 = tp1 + range * 2;

  // A stronger opportunity score puts more size on at market, the weaker one waits lower.
  const atMarket = Math.round(Math.max(30, Math.min(70, 30 + (t.score - 50))));
  const entries: PlanEntry[] = [
    { label: 'Entry 1 — at market', price: current, allocationPct: atMarket, reason: `Opportunity ${t.score}/100, ${momentum >= 0 ? '+' : ''}${momentum.toFixed(1)}% in the last 5m` },
    {
      label: 'Entry 2 — on a pullback',
      price: pullback,
      allocationPct: 100 - atMarket,
      reason: pullback <= support * 1.001 ? 'At the floor this range has held' : `−${dipPct.toFixed(1)}% toward the range floor`,
    },
  ];

  return {
    entryLow: pullback,
    entryHigh: current,
    entries,
    stop,
    stopPct,
    tp1,
    tp2,
    tp3,
    rr: (tp2 - current) / Math.max(current - stop, 1e-12),
    invalidation: [
      `Market cap trades below ${Math.round(stop).toLocaleString()} (−${stopPct.toFixed(0)}%)`,
      'Liquidity is pulled from the pool',
      'Creator or a top holder sells a large share of supply',
    ],
    support,
    resistance,
    windowMinutes: Math.round(windowMs / 60_000),
    samples: caps.length,
  };
}
