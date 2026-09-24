import { compactUsd, priceUsd, signedPct } from './numbers.ts';
import { uid } from './random.ts';
import { riskLevel } from './riskEngine.ts';
import type { Alert, AlertCategory, AlertSeverity, AlertThresholds, Token } from './types.ts';

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  newTokens: true,
  newTokenMinScore: 55,
  priceMovePct: 25,
  scoreThreshold: 65,
  riskJump: 15,
  liquidityDropPct: 25,
  volumeSpikeX: 3,
  largeSellUsd: 1500,
  creatorSell: true,
  smartMoney: true,
  watchMinScore: 60,
  watchMaxRisk: 50,
};

const COOLDOWN_MS: Partial<Record<AlertCategory, number>> = {
  volume: 5 * 60_000,
  smart_money: 10 * 60_000,
  whale_sell: 60_000,
  liquidity: 3 * 60_000,
  risk: 3 * 60_000,
  score: 5 * 60_000,
  price: 5 * 60_000,
  high_risk: 30 * 60_000,
};

const DISCOVERY_COOLDOWN_MS = 60 * 60_000;

/** Per-subscriber cooldown bookkeeping (key = `${subscriber}:${mint}:${category}`). */
export class Cooldowns {
  private last = new Map<string, number>();
  allow(key: string, category: AlertCategory, now: number, cooldownMs = COOLDOWN_MS[category] ?? 0): boolean {
    const cd = cooldownMs;
    const k = `${key}:${category}`;
    if (now - (this.last.get(k) ?? 0) < cd) return false;
    this.last.set(k, now);
    if (this.last.size > 50_000) this.last.clear();
    return true;
  }
}

function make(t: Token, severity: AlertSeverity, category: AlertCategory, title: string, message: string, now: number): Alert {
  return { id: uid('al_'), severity, category, tokenId: t.id, symbol: t.symbol, title, message, createdAt: now, read: false };
}

export interface AlertContext {
  thresholds: AlertThresholds;
  watched: Set<string>;
  held: Set<string>;
  cooldowns: Cooldowns;
  subscriber: string;
}

const meetsWatch = (t: Token, th: AlertThresholds) => t.signal !== 'INSUFFICIENT DATA' && t.score >= th.watchMinScore && t.riskScore <= th.watchMaxRisk;

/**
 * Compares consecutive token states and returns alerts for meaningful transitions, honouring the
 * subscriber's thresholds. New tokens alert once their first full analysis is available.
 */
export function evaluateAlerts(prev: Token, next: Token, ctx: AlertContext, now = Date.now()): Alert[] {
  const th = ctx.thresholds;
  const out: Alert[] = [];
  const key = `${ctx.subscriber}:${next.id}`;
  const allow = (c: AlertCategory) => ctx.cooldowns.allow(key, c, now);
  const relevant = ctx.watched.has(next.id) || ctx.held.has(next.id);
  const scored = next.signal !== 'INSUFFICIENT DATA';

  if (th.newTokens && scored && prev.signal === 'INSUFFICIENT DATA' && next.score >= th.newTokenMinScore && now - next.createdAt < 30 * 60_000) {
    out.push(make(next, next.riskScore >= 50 ? 'warning' : 'info', 'new_token', 'New token detected', `${next.signal} · Opportunity ${next.score}/100 · Risk ${next.riskScore}/100 · ${compactUsd(next.marketCap)} mcap`, now));
  }

  // Discovery alerts for tokens the user doesn't follow: a score crossing at most once per hour.
  if (scored && prev.score < th.scoreThreshold && next.score >= th.scoreThreshold && (relevant ? allow('score') : ctx.cooldowns.allow(`${key}:discovery`, 'score', now, DISCOVERY_COOLDOWN_MS))) {
    out.push(make(next, 'info', 'score', `Opportunity crossed ${th.scoreThreshold}`, `Score ${prev.score} → ${next.score} · ${next.signal}`, now));
  }

  // Every other rule monitors tokens the user follows (watchlist or open paper positions).
  if (!relevant) return out;

  const riskDelta = next.riskScore - prev.riskScore;
  if (prev.risk.factors.length && riskDelta >= th.riskJump && allow('risk')) {
    out.push(make(next, 'warning', 'risk', `Risk score +${riskDelta} → ${next.riskScore}/100`, next.lastChange?.reasons.find((r) => r.startsWith('Risk')) ?? 'Risk factors deteriorated', now));
  }
  const wasHigh = prev.riskScore >= 50;
  if (prev.risk.factors.length && !wasHigh && next.riskScore >= 50 && scored && allow('high_risk')) {
    out.push(make(next, riskLevel(next.riskScore) === 'Extreme' ? 'critical' : 'warning', 'high_risk', `Now ${riskLevel(next.riskScore).toUpperCase()} risk`, next.risk.floorReason ?? `Risk ${prev.riskScore} → ${next.riskScore}`, now));
  }

  if (next.priceChange5m !== null && Math.abs(next.priceChange5m) >= th.priceMovePct && allow('price')) {
    const up = next.priceChange5m > 0;
    out.push(make(next, up ? 'info' : 'warning', 'price', `Price ${signedPct(next.priceChange5m)} in 5m`, `${priceUsd(next.price)} · ${compactUsd(next.marketCap)} mcap`, now));
  }

  // On a bonding curve liquidity tracks price, so only real AMM pools can have liquidity pulled.
  if (next.graduated && prev.liquidity > 1000 && next.liquidity < prev.liquidity * (1 - th.liquidityDropPct / 100) && allow('liquidity')) {
    const drop = (1 - next.liquidity / prev.liquidity) * 100;
    out.push(make(next, 'critical', 'liquidity', `Liquidity dropped ${drop.toFixed(0)}%`, `${compactUsd(prev.liquidity)} → ${compactUsd(next.liquidity)}`, now));
  }

  if (th.creatorSell && next.creatorSoldPct >= prev.creatorSoldPct + 5) {
    out.push(make(next, 'critical', 'creator_sell', 'Creator is selling', `Creator has sold ~${next.creatorSoldPct.toFixed(0)}% of their initial allocation`, now));
  }

  const known = new Set(prev.trades.map((x) => x.signature));
  const bigSells = next.trades.filter((x) => !known.has(x.signature) && x.side === 'sell' && !x.isCreator && x.usd >= th.largeSellUsd);
  if (bigSells.length && allow('whale_sell')) {
    const top = bigSells.reduce((a, b) => (b.usd > a.usd ? b : a));
    out.push(make(next, 'warning', 'whale_sell', `Large holder sold ${compactUsd(top.usd)}`, `Wallet ${top.trader.slice(0, 4)}…${top.trader.slice(-4)}${bigSells.length > 1 ? ` (+${bigSells.length - 1} more)` : ''}`, now));
  }

  const runRate = next.volume1h > 0 ? (next.volume5m * 12) / next.volume1h : 0;
  // A token younger than ~20 minutes always shows a huge 5m-vs-1h ratio, so require some history.
  if (now - next.createdAt > 20 * 60_000 && next.volume5m > 2000 && runRate >= th.volumeSpikeX && allow('volume')) {
    out.push(make(next, 'warning', 'volume', `Volume spike ${runRate.toFixed(1)}×`, `${compactUsd(next.volume5m)} traded in 5m vs hourly run-rate`, now));
  }

  if (th.smartMoney && (next.organicVolumeRatio ?? 0) >= 0.45 && next.netBuyers - prev.netBuyers >= 8 && allow('smart_money')) {
    out.push(make(next, 'info', 'smart_money', 'Organic buyer activity', `+${next.netBuyers - prev.netBuyers} net buyers, ${Math.round((next.organicVolumeRatio ?? 0) * 100)}% organic volume (smart-money proxy)`, now));
  }

  if (ctx.watched.has(next.id)) {
    const was = meetsWatch(prev, th);
    const is = meetsWatch(next, th);
    if (!was && is) out.push(make(next, 'info', 'watchlist', 'Entered watch conditions', `Score ${next.score} ≥ ${th.watchMinScore}, risk ${next.riskScore} ≤ ${th.watchMaxRisk}`, now));
    if (was && !is) out.push(make(next, 'warning', 'watchlist', 'Exited watch conditions', `Score ${next.score}, risk ${next.riskScore}`, now));
  }
  return out;
}
