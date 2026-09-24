import { compactUsd, signedPct } from './numbers.ts';
import { uid } from './random.ts';
import { riskLevel } from './riskEngine.ts';
import type { DailyReport, RiskLevel, Signal, Token } from './types.ts';

export type MarketStatus = 'Bullish' | 'Neutral' | 'Bearish';

export interface MarketStats {
  totalTokens: number;
  launchesLastHour: number;
  newTokens24h: number;
  totalVolume: number;
  totalLiquidity: number;
  medianChange: number;
  advancers: number;
  decliners: number;
  sentiment: number;
  status: MarketStatus;
  signals: Record<Signal, number>;
}

const HOUR = 3_600_000;

export function computeMarketStats(tokens: Token[], now = Date.now()): MarketStats {
  const priced = tokens.filter((t) => t.marketUpdatedAt);
  const changes = priced.map((t) => t.priceChange1h ?? t.priceChange24h).sort((a, b) => a - b);
  const median = changes.length ? changes[Math.floor(changes.length / 2)] : 0;
  const advancers = priced.filter((t) => (t.priceChange1h ?? t.priceChange24h) > 0).length;
  const decliners = priced.length - advancers;
  const breadth = priced.length ? advancers / priced.length : 0.5;
  const sentiment = Math.round(Math.min(100, Math.max(0, breadth * 70 + Math.tanh(median / 40) * 30 + 15)));
  const signals: Record<Signal, number> = { WATCH: 0, 'HIGH-RISK SETUP': 0, AVOID: 0, 'INSUFFICIENT DATA': 0 };
  tokens.forEach((t) => signals[t.signal]++);
  return {
    totalTokens: tokens.length,
    launchesLastHour: tokens.filter((t) => now - t.createdAt < HOUR).length,
    newTokens24h: tokens.filter((t) => now - t.createdAt < 24 * HOUR).length,
    totalVolume: tokens.reduce((s, t) => s + t.volume24h, 0),
    totalLiquidity: tokens.reduce((s, t) => s + t.liquidity, 0),
    medianChange: median,
    advancers,
    decliners,
    sentiment,
    status: sentiment >= 60 ? 'Bullish' : sentiment <= 40 ? 'Bearish' : 'Neutral',
    signals,
  };
}

export function generateDailyReport(tokens: Token[], source: Token['source'], now = Date.now()): DailyReport {
  const stats = computeMarketStats(tokens, now);
  const scored = tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA');
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const byChange = [...scored].sort((a, b) => b.priceChange24h - a.priceChange24h);
  const riskSummary: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0, Extreme: 0 };
  scored.forEach((t) => riskSummary[riskLevel(t.riskScore)]++);
  const top = byScore[0];
  const gainer = byChange[0];
  const loser = byChange[byChange.length - 1];
  const highlights = [
    `${stats.launchesLastHour} launches detected in the last hour; ${stats.totalTokens} tokens currently tracked.`,
    `${stats.status} tape: ${stats.advancers} up vs ${stats.decliners} down, median ${signedPct(stats.medianChange, 1)}.`,
    top ? `Highest opportunity score: $${top.symbol} ${top.score}/100 (risk ${top.riskScore}/100, ${top.signal}).` : '',
    gainer ? `Biggest gainer: $${gainer.symbol} ${signedPct(gainer.priceChange24h, 1)} on ${compactUsd(gainer.volume24h)} volume.` : '',
    loser && loser !== gainer ? `Biggest loser: $${loser.symbol} ${signedPct(loser.priceChange24h, 1)}.` : '',
    `${riskSummary.High + riskSummary.Extreme} of ${scored.length} scored tokens are High/Extreme risk; ${stats.signals.AVOID} flagged AVOID.`,
  ].filter(Boolean);
  return {
    id: uid('rp_'),
    generatedAt: now,
    source,
    totalTokens: stats.totalTokens,
    newTokens: stats.newTokens24h,
    totalVolume: stats.totalVolume,
    totalLiquidity: stats.totalLiquidity,
    avgChange: stats.medianChange,
    marketStatus: stats.status,
    topOpportunities: byScore.slice(0, 5).map((t) => ({ tokenId: t.id, symbol: t.symbol, score: t.score })),
    gainers: byChange.slice(0, 5).map((t) => ({ tokenId: t.id, symbol: t.symbol, change: t.priceChange24h })),
    losers: byChange.slice(-5).reverse().map((t) => ({ tokenId: t.id, symbol: t.symbol, change: t.priceChange24h })),
    riskSummary,
    highlights,
  };
}

export function reportToMarkdown(r: DailyReport): string {
  return [
    '# MemeCoin Radar — Market Report',
    `Generated: ${new Date(r.generatedAt).toISOString()} · data: ${r.source}`,
    '',
    '## Overview',
    `- Status: ${r.marketStatus}`,
    `- Tokens tracked: ${r.totalTokens} (${r.newTokens} launched in 24h)`,
    `- 24h volume: ${compactUsd(r.totalVolume)}`,
    `- Liquidity: ${compactUsd(r.totalLiquidity)}`,
    `- Median change: ${signedPct(r.avgChange, 1)}`,
    '',
    '## Top opportunity scores',
    ...r.topOpportunities.map((t, i) => `${i + 1}. $${t.symbol} — ${t.score}/100`),
    '',
    '## Biggest gainers',
    ...r.gainers.map((t) => `- $${t.symbol} ${signedPct(t.change, 1)}`),
    '',
    '## Biggest losers',
    ...r.losers.map((t) => `- $${t.symbol} ${signedPct(t.change, 1)}`),
    '',
    '## Risk summary',
    ...Object.entries(r.riskSummary).map(([k, n]) => `- ${k}: ${n}`),
    '',
    '## Highlights',
    ...r.highlights.map((h) => `- ${h}`),
    '',
    '_Model-generated analysis of live market data. Not financial advice._',
  ].join('\n');
}
