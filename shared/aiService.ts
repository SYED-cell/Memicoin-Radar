import type { AIAnalysis, Breakdown, Scenario, ScoreChange, Signal, Token } from './types.ts';
import { age as formatAge, compactUsd as formatCompactUsd } from './numbers.ts';
import { riskLevel } from './riskEngine.ts';

export const AI_DISCLAIMER =
  'Automated, rule-based analysis of on-chain and market metrics. It explains the data — it does not predict prices and is not financial advice.';
export const SCENARIO_DISCLAIMER = 'Model estimate — not a prediction. Ranges come from recent volatility and current scores.';

export const SIGNAL_EXPLAINER: Record<Signal, string> = {
  WATCH: 'Metrics look constructive with manageable risk. Worth monitoring — not a buy signal.',
  'HIGH-RISK SETUP': 'Some positive activity, but risk signals are elevated. Only appropriate for simulated or very small positions.',
  AVOID: 'Risk outweighs observable opportunity, or activity is too weak.',
  'INSUFFICIENT DATA': 'Too new or too little data for a reliable read. Wait for more trades and holder data.',
};

/** Compares two breakdowns and describes the largest point movements. */
function diffFactors(prev: Breakdown, next: Breakdown, kind: 'Opportunity' | 'Risk'): { delta: number; text: string }[] {
  return next.factors
    .map((f) => {
      const before = prev.factors.find((p) => p.key === f.key);
      const delta = f.points - (before?.points ?? 0);
      return { delta, text: `${kind} · ${f.label} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts — ${f.detail}` };
    })
    .filter((d) => Math.abs(d.delta) >= 1);
}

export function explainChange(prev: Token, next: Token): ScoreChange | null {
  const scoreDelta = next.score - prev.score;
  const riskDelta = next.riskScore - prev.riskScore;
  if (Math.abs(scoreDelta) < 3 && Math.abs(riskDelta) < 3) return null;
  const reasons = [...diffFactors(prev.opportunity, next.opportunity, 'Opportunity'), ...diffFactors(prev.risk, next.risk, 'Risk')]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4)
    .map((d) => d.text);
  if (next.risk.floorReason && next.risk.floorReason !== prev.risk.floorReason) reasons.unshift(`Risk floor applied: ${next.risk.floorReason}`);
  if (next.opportunity.coverage - prev.opportunity.coverage > 0.1) reasons.push('More data became available, so more factors are now scored.');
  return { t: Date.now(), scoreDelta, riskDelta, reasons };
}

/** Realised volatility of log returns, scaled to ~24h, from recorded history. */
function realisedVol(t: Token): number {
  const h = t.history.slice(-120);
  if (h.length < 5) return 1.2;
  const rets = h.slice(1).map((p, i) => Math.log(p.price / h[i].price)).filter(Number.isFinite);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(rets.length - 1, 1));
  const spanMs = Math.max(h[h.length - 1].t - h[0].t, 60_000);
  const perDay = sd * Math.sqrt((86_400_000 / spanMs) * rets.length);
  return Math.min(3, Math.max(0.4, perDay));
}

export function scenarios(t: Token): Scenario[] {
  const vol = realisedVol(t);
  const bias = (t.score - 50) / 100 - (t.riskScore - 50) / 140;
  const mk = (label: Scenario['label'], lo: number, hi: number, rationale: string): Scenario => {
    const a = Math.max(-0.99, Math.exp(lo) - 1);
    const b = Math.max(-0.99, Math.exp(hi) - 1);
    return { label, changeLow: Math.min(a, b) * 100, changeHigh: Math.max(a, b) * 100, mcapLow: t.marketCap * (1 + Math.min(a, b)), mcapHigh: t.marketCap * (1 + Math.max(a, b)), rationale };
  };
  return [
    mk('Bull', vol * (0.4 + bias * 0.5), vol * (1.1 + bias), `Momentum and holder growth persist; volatility ${Math.round(vol * 100)}%/day.`),
    mk('Base', -vol * 0.35 + bias * vol * 0.3, vol * 0.35 + bias * vol * 0.3, 'Activity normalises and price ranges around current levels.'),
    mk('Bear', -vol * (1.3 + t.riskScore / 100), -vol * (0.35 - bias * 0.3), `Liquidity fades or insiders exit; risk score ${t.riskScore}/100 widens the downside.`),
  ];
}

export function analyze(t: Token): AIAnalysis {
  const oppFactors = t.opportunity.factors.filter((f) => f.value !== null);
  const riskFactors = t.risk.factors.filter((f) => f.value !== null);
  const strengths = [...oppFactors].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const threats = [...riskFactors].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const level = riskLevel(t.riskScore);

  const confirmations = strengths.filter((f) => (f.value ?? 0) >= 0.6).slice(0, 5).map((f) => `${f.label}: ${f.detail}`);
  const risks = threats.filter((f) => (f.value ?? 0) >= 0.5).slice(0, 5).map((f) => `${f.label}: ${f.detail}`);
  if (t.risk.floorReason) risks.unshift(t.risk.floorReason);

  const top = strengths[0];
  const worst = threats[0];
  const catalyst = top
    ? top.key === 'social'
      ? 'Social presence and narrative are the strongest input.'
      : top.key === 'volumeAcceleration'
        ? 'Volume is accelerating versus the hourly run-rate.'
        : top.key === 'holderGrowth'
          ? 'New holders are arriving quickly.'
          : top.key === 'smartMoney'
            ? 'Organic (non-bot) buying is the strongest input.'
            : `${top.label} is the strongest input (${top.detail}).`
    : 'No clear catalyst in the data yet.';

  let summary: string;
  if (t.signal === 'INSUFFICIENT DATA') {
    summary = `$${t.symbol} is ${formatAge(t.createdAt)} old and only ${Math.round(((t.risk.coverage + t.opportunity.coverage) / 2) * 100)}% of the model inputs are available. The radar will re-score it as trades, holders and security checks arrive.`;
  } else {
    summary =
      `$${t.symbol} (${formatAge(t.createdAt)} old, ${formatCompactUsd(t.marketCap)} mcap, ${t.holders} holders) scores ${t.score}/100 on opportunity with ${level.toLowerCase()} risk (${t.riskScore}/100). ` +
      (top ? `Strongest input: ${top.label.toLowerCase()} — ${top.detail}. ` : '') +
      (worst && (worst.value ?? 0) >= 0.5 ? `Main concern: ${worst.label.toLowerCase()} — ${worst.detail}. ` : 'No single risk factor dominates. ') +
      SIGNAL_EXPLAINER[t.signal];
  }

  const whyChanged = t.lastChange
    ? [
        `Opportunity ${t.lastChange.scoreDelta >= 0 ? '+' : ''}${t.lastChange.scoreDelta}, risk ${t.lastChange.riskDelta >= 0 ? '+' : ''}${t.lastChange.riskDelta} since the previous update:`,
        ...t.lastChange.reasons,
      ]
    : ['No significant score change since tracking began.'];

  return {
    tokenId: t.id,
    generatedAt: Date.now(),
    opportunityScore: t.score,
    riskScore: t.riskScore,
    momentum: t.momentum,
    phase: t.phase,
    confidence: t.confidence,
    signal: t.signal,
    catalyst,
    summary,
    confirmations: confirmations.length ? confirmations : ['No strong confirmation signals yet'],
    risks: risks.length ? risks : ['No major risk signal above threshold — meme-coin risk is never zero'],
    whyChanged,
    scenarios: scenarios(t),
    horizon: 'Next 24 hours',
  };
}

export function changeSummary(t: Token): string | null {
  if (!t.lastChange) return null;
  const c = t.lastChange;
  return `Score ${c.scoreDelta >= 0 ? '+' : ''}${c.scoreDelta}, risk ${c.riskDelta >= 0 ? '+' : ''}${c.riskDelta}: ${c.reasons[0] ?? ''}`;
}

