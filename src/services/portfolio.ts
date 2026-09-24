import type { Position, Token, TradingState } from '../types';

export interface EnrichedPosition extends Position {
  token?: Token;
  currentPrice: number;
  value: number;
  cost: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  pnl24h: number;
  exposurePct: number;
  /** Loss if the stop-loss is hit (null when no stop set). */
  riskAtStop: number | null;
}

export interface PortfolioSummary {
  cash: number;
  holdingsValue: number;
  totalValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  pnl24h: number;
  pnl24hPct: number;
  exposurePct: number;
  riskAtStops: number;
  positions: EnrichedPosition[];
}

const DAY = 86_400_000;

export function summarizePortfolio(state: TradingState, tokenMap: Map<string, Token>, now = Date.now()): PortfolioSummary {
  const raw = state.positions.map((p) => {
    const token = tokenMap.get(p.tokenId);
    const currentPrice = token?.price || p.avgEntry;
    const value = p.quantity * currentPrice;
    const cost = p.quantity * p.avgEntry;
    const ref = now - p.openedAt < DAY || !token ? p.avgEntry : currentPrice / (1 + token.priceChange24h / 100);
    return {
      ...p,
      token,
      currentPrice,
      value,
      cost,
      unrealizedPnl: value - cost,
      unrealizedPct: cost ? (value / cost - 1) * 100 : 0,
      pnl24h: p.quantity * (currentPrice - ref),
      riskAtStop: p.stopLoss !== undefined ? p.quantity * (currentPrice - p.stopLoss) : null,
    };
  });
  const holdingsValue = raw.reduce((s, p) => s + p.value, 0);
  const totalValue = state.cash + holdingsValue;
  const positions: EnrichedPosition[] = raw.map((p) => ({ ...p, exposurePct: totalValue ? (p.value / totalValue) * 100 : 0 })).sort((a, b) => b.value - a.value);
  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const realizedPnl = state.transactions.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const pnl24h = positions.reduce((s, p) => s + p.pnl24h, 0);
  const totalPnl = totalValue - state.startingBalance;
  return {
    cash: state.cash,
    holdingsValue,
    totalValue,
    unrealizedPnl,
    realizedPnl,
    totalPnl,
    totalPnlPct: (totalPnl / state.startingBalance) * 100,
    pnl24h,
    pnl24hPct: totalValue - pnl24h ? (pnl24h / (totalValue - pnl24h)) * 100 : 0,
    exposurePct: totalValue ? (holdingsValue / totalValue) * 100 : 0,
    riskAtStops: positions.reduce((s, p) => s + Math.max(0, p.riskAtStop ?? 0), 0),
    positions,
  };
}

/** Classic fixed-fractional sizing: risk a % of balance between entry and stop. */
export function positionSize(input: { balance: number; riskPct: number; entry: number; stop: number; maxPositionPct: number }) {
  const { balance, riskPct, entry, stop, maxPositionPct } = input;
  const riskAmount = (balance * riskPct) / 100;
  const perUnitRisk = entry - stop;
  if (!(entry > 0) || !(perUnitRisk > 0)) return null;
  const rawQty = riskAmount / perUnitRisk;
  const maxQty = (balance * maxPositionPct) / 100 / entry;
  const quantity = Math.min(rawQty, maxQty);
  return {
    riskAmount,
    quantity,
    positionValue: quantity * entry,
    maxLoss: quantity * perUnitRisk,
    stopDistancePct: (perUnitRisk / entry) * 100,
    cappedByMax: rawQty > maxQty,
    positionPct: ((quantity * entry) / balance) * 100,
  };
}
