import type { Breakdown, Momentum, Phase, Signal, Token } from './types.ts';
import { aggregate, clamp01, pct, runFactors, usd, type FactorDef } from './engineUtils.ts';

const volumeAccel = (t: Token): number | null => {
  if (t.volume1h <= 0) return null;
  // Compare the last 5 minutes (scaled to an hour) with the full hour.
  return (t.volume5m * 12) / t.volume1h;
};

const DEFS: FactorDef<Token>[] = [
  {
    key: 'momentum',
    label: 'Momentum',
    weight: 16,
    description: 'Short-term price trend (5m and 1h).',
    evaluate: (t) => {
      if (t.priceChange5m === null && t.priceChange1h === null) return { value: null, detail: 'No price trend yet' };
      const m5 = t.priceChange5m ?? 0;
      const m1 = t.priceChange1h ?? m5;
      const v = 0.5 + Math.tanh(m5 / 40) * 0.3 + Math.tanh(m1 / 120) * 0.2;
      return { value: v, detail: `${m5 >= 0 ? '+' : ''}${m5.toFixed(1)}% 5m, ${m1 >= 0 ? '+' : ''}${m1.toFixed(1)}% 1h` };
    },
  },
  {
    key: 'liquidityQuality',
    label: 'Liquidity quality',
    weight: 12,
    description: 'Depth of liquidity and its ratio to market cap.',
    evaluate: (t) => {
      if (!t.marketUpdatedAt || t.liquidity <= 0) return { value: null, detail: 'No liquidity data yet' };
      const depth = Math.log10(Math.max(t.liquidity, 1) / 2_000) / Math.log10(100);
      const ratio = t.marketCap > 0 ? t.liquidity / t.marketCap : 0;
      return { value: clamp01(depth) * 0.7 + clamp01(ratio / 0.2) * 0.3, detail: `${usd(t.liquidity)} depth, ${pct(ratio * 100, 1)} of mcap` };
    },
  },
  {
    key: 'smartMoney',
    label: 'Smart-money activity',
    weight: 12,
    description: 'Proxy: organic (non-bot) buy volume and net new buyers. True wallet labelling needs a paid data source.',
    evaluate: (t) => {
      if (t.organicVolumeRatio === null && t.netBuyers === 0) return { value: null, detail: 'No organic-flow data' };
      const organic = t.organicVolumeRatio ?? 0.3;
      const net = t.traders > 0 ? clamp01(t.netBuyers / Math.max(10, t.traders * 0.4)) : 0;
      return { value: organic * 0.6 + net * 0.4, detail: `${pct(organic * 100)} organic volume, ${t.netBuyers} net buyers` };
    },
  },
  {
    key: 'holderGrowth',
    label: 'Holder growth',
    weight: 14,
    description: 'Rate at which new wallets are accumulating.',
    evaluate: (t) => {
      if (!t.marketUpdatedAt) return { value: null, detail: 'Holder count pending' };
      const change = t.holdersChange;
      const base = clamp01(Math.log10(Math.max(t.holders, 1)) / 3);
      const growth = change === null ? 0.5 : 0.5 + Math.tanh(change / 30) * 0.5;
      return { value: base * 0.4 + growth * 0.6, detail: `${t.holders} holders${change !== null ? `, ${change >= 0 ? '+' : ''}${change.toFixed(1)}% (1h)` : ''}` };
    },
  },
  {
    key: 'volumeAcceleration',
    label: 'Volume acceleration',
    weight: 14,
    description: 'Last 5 minutes of volume versus the hourly run-rate.',
    evaluate: (t) => {
      const a = volumeAccel(t);
      if (a === null) return { value: null, detail: 'Not enough volume history' };
      return { value: clamp01(a / 2.5), detail: `${a.toFixed(2)}× hourly run-rate (${usd(t.volume5m)} in 5m)` };
    },
  },
  {
    key: 'buyPressure',
    label: 'Buy pressure',
    weight: 10,
    description: 'Share of volume that is buying.',
    evaluate: (t) => {
      const total = t.buyVolume + t.sellVolume;
      if (total < 200) return { value: null, detail: 'Too little volume' };
      const share = t.buyVolume / total;
      return { value: (share - 0.35) / 0.35, detail: `${pct(share * 100)} buys by volume` };
    },
  },
  {
    key: 'social',
    label: 'Social / narrative',
    weight: 10,
    description: 'Presence of social links and a described narrative.',
    evaluate: (t) => {
      const links = [t.socials.twitter, t.socials.telegram, t.socials.website].filter(Boolean).length;
      const hasDesc = Boolean(t.description && t.description.length > 12);
      if (!t.marketUpdatedAt && links === 0 && !hasDesc) return { value: null, detail: 'Metadata pending' };
      return { value: links / 3 * 0.8 + (hasDesc ? 0.2 : 0), detail: `${links}/3 social links${hasDesc ? ', has description' : ''}` };
    },
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle phase',
    weight: 12,
    description: 'Early launches with traction score highest; late-stage tokens have less asymmetric upside.',
    evaluate: (t) => {
      const phase = derivePhase(t);
      const traction = clamp01(t.marketCap / 30_000);
      const v = phase === 'Early' ? 0.45 + traction * 0.5 : phase === 'Mid' ? 0.6 : 0.3;
      return { value: v, detail: `${phase} phase${t.bondingProgress !== null && !t.graduated ? `, ${t.bondingProgress.toFixed(0)}% bonding curve` : t.graduated ? ', graduated' : ''}` };
    },
  },
];

export const OPPORTUNITY_FACTOR_DEFS = DEFS.map(({ key, label, description, weight }) => ({ key, label, description, weight }));

export function computeOpportunity(token: Token): Breakdown {
  return aggregate(runFactors(DEFS, token));
}

export function derivePhase(t: Token, now = Date.now()): Phase {
  const ageMin = (now - t.createdAt) / 60_000;
  if (!t.graduated && ageMin < 45 && (t.bondingProgress ?? 0) < 60) return 'Early';
  if (!t.graduated || ageMin < 6 * 60) return 'Mid';
  return 'Late';
}

export function deriveMomentum(opp: Breakdown): Momentum {
  const f = opp.factors.find((x) => x.key === 'momentum');
  if (!f || f.value === null) return 'Unknown';
  if (f.value > 0.8) return 'Explosive';
  if (f.value > 0.65) return 'Strong';
  if (f.value > 0.55) return 'Building';
  if (f.value > 0.4) return 'Neutral';
  return 'Weak';
}

export function deriveConfidence(t: Token, risk: Breakdown, opp: Breakdown, now = Date.now()): number {
  const ageMin = (now - t.createdAt) / 60_000;
  const coverage = (risk.coverage + opp.coverage) / 2;
  const c = coverage * 55 + Math.min(ageMin / 30, 1) * 20 + (t.marketUpdatedAt ? 10 : 0) + (t.trades.length > 20 ? 10 : 0);
  return Math.round(Math.min(95, Math.max(5, c)));
}

/** Descriptive signal — never a prediction or recommendation. */
export function deriveSignal(t: Token, risk: Breakdown, opp: Breakdown, now = Date.now()): Signal {
  const ageSec = (now - t.createdAt) / 1000;
  if (!t.marketUpdatedAt || ageSec < 60 || risk.coverage < 0.45 || opp.coverage < 0.45) return 'INSUFFICIENT DATA';
  if (risk.total >= 75 || opp.total < 35) return 'AVOID';
  if (risk.total >= 50) return 'HIGH-RISK SETUP';
  return 'WATCH';
}

export function scoreLabel(total: number): string {
  if (total >= 80) return 'Exceptional setup';
  if (total >= 65) return 'Strong setup';
  if (total >= 50) return 'Developing';
  if (total >= 35) return 'Weak';
  return 'Poor';
}
