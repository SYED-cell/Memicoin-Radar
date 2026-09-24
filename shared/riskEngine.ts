import type { Breakdown, RiskLevel, Token } from './types.ts';
import { aggregate, clamp01, pct, runFactors, usd, type FactorDef } from './engineUtils.ts';

/**
 * Transparent 0–100 risk model (100 = most dangerous). 13 weighted signals; missing inputs are
 * excluded and their weight redistributed (see `coverage`). Hard safety failures apply a floor.
 */
const DEFS: FactorDef<Token>[] = [
  {
    key: 'liquidity',
    label: 'Liquidity',
    weight: 9,
    description: 'Thin pools can be drained or moved with small orders.',
    evaluate: (t) => {
      if (!t.marketUpdatedAt || t.liquidity <= 0) return { value: null, detail: 'No liquidity data yet' };
      const depth = 1 - Math.log10(Math.max(t.liquidity, 1) / 2_000) / Math.log10(50);
      const ratio = t.marketCap > 0 ? t.liquidity / t.marketCap : 0;
      const ratioRisk = ratio < 0.05 ? 0.8 : ratio < 0.1 ? 0.4 : 0;
      return { value: Math.max(clamp01(depth), ratioRisk), detail: `${usd(t.liquidity)} liquidity (${pct(ratio * 100, 1)} of mcap)` };
    },
  },
  {
    key: 'holderConcentration',
    label: 'Holder concentration',
    weight: 11,
    description: 'Share of supply held by the largest wallets (excluding pools/curve).',
    evaluate: (t) =>
      t.topHoldersPct === null
        ? { value: null, detail: 'Top-holder data unavailable' }
        : { value: (t.topHoldersPct - 15) / 50, detail: `Top holders own ${pct(t.topHoldersPct, 1)}` },
  },
  {
    key: 'creatorAllocation',
    label: 'Creator allocation',
    weight: 8,
    description: 'Tokens the deployer still controls and can dump.',
    evaluate: (t) => {
      const v = t.devHoldingPct ?? t.creatorInitialBuyPct;
      if (v === null) return { value: null, detail: 'Creator balance unknown' };
      return { value: v / 15, detail: `Creator holds ${pct(v, 2)}${t.devHoldingPct === null ? ' (initial buy)' : ''}` };
    },
  },
  {
    key: 'walletClustering',
    label: 'Wallet clustering',
    weight: 7,
    description: 'Many trades from few wallets suggests bundled / coordinated buying.',
    evaluate: (t) => {
      const trades = t.buys24h + t.sells24h;
      if (trades < 10 || t.traders <= 0) return { value: null, detail: 'Not enough trades to assess' };
      const ratio = t.traders / trades;
      return { value: (0.55 - ratio) / 0.45, detail: `${t.traders} wallets made ${trades} trades (${ratio.toFixed(2)} wallets/trade)` };
    },
  },
  {
    key: 'insiderActivity',
    label: 'Insider activity',
    weight: 9,
    description: 'Serial-launcher creators and creator selling.',
    evaluate: (t) => {
      const serial = t.devMints === null ? null : clamp01(Math.log10(t.devMints + 1) / 2);
      const selling = clamp01(t.creatorSoldPct / 60);
      if (serial === null && t.creatorSoldPct === 0 && t.devHoldingPct === null) return { value: null, detail: 'No creator history available' };
      const parts = [];
      if (t.devMints !== null) parts.push(`creator launched ${t.devMints} token${t.devMints === 1 ? '' : 's'} before`);
      if (t.creatorSoldPct > 0) parts.push(`sold ${pct(t.creatorSoldPct)} of initial buy`);
      return { value: Math.max(serial ?? 0, selling), detail: parts.join(', ') || 'No insider red flags observed' };
    },
  },
  {
    key: 'buySellImbalance',
    label: 'Buy/sell imbalance',
    weight: 6,
    description: 'Persistent sell pressure relative to buys.',
    evaluate: (t) => {
      const total = t.buyVolume + t.sellVolume;
      if (total < 200) return { value: null, detail: 'Too little volume' };
      const sellShare = t.sellVolume / total;
      return { value: (sellShare - 0.5) / 0.3, detail: `${pct(sellShare * 100)} of volume is selling` };
    },
  },
  {
    key: 'volumeQuality',
    label: 'Volume quality',
    weight: 8,
    description: 'Share of volume that is not organic (wash / bot-driven).',
    evaluate: (t) =>
      t.organicVolumeRatio === null
        ? { value: null, detail: 'Organic volume not reported' }
        : { value: 1 - t.organicVolumeRatio / 0.6, detail: `${pct(t.organicVolumeRatio * 100)} organic volume` },
  },
  {
    key: 'botActivity',
    label: 'Bot activity',
    weight: 7,
    description: 'Provider organic score — low scores indicate bot-dominated trading.',
    evaluate: (t) =>
      t.organicScore === null
        ? { value: null, detail: 'Organic score unavailable' }
        : { value: 1 - t.organicScore / 70, detail: `Organic score ${Math.round(t.organicScore)}/100` },
  },
  {
    key: 'suddenTransfers',
    label: 'Sudden transfers',
    weight: 7,
    description: 'Abrupt liquidity pulls or outsized single sells.',
    evaluate: (t) => {
      const bigSell = t.trades.filter((x) => x.side === 'sell' && t.marketCap > 0 && x.usd / t.marketCap > 0.03).length;
      const liqDrop = t.liquidityChange5m;
      if (liqDrop === null && t.trades.length === 0) return { value: null, detail: 'No flow data' };
      const liqRisk = liqDrop !== null && liqDrop < 0 ? clamp01(-liqDrop / 40) : 0;
      const details = [];
      if (liqDrop !== null) details.push(`liquidity ${liqDrop >= 0 ? '+' : ''}${liqDrop.toFixed(1)}% (5m)`);
      if (bigSell) details.push(`${bigSell} sell(s) >3% of mcap`);
      return { value: Math.max(liqRisk, clamp01(bigSell / 3)), detail: details.join(', ') || 'No abrupt moves' };
    },
  },
  {
    key: 'lpStatus',
    label: 'LP status',
    weight: 5,
    description: 'Whether liquidity can be withdrawn by the deployer.',
    evaluate: (t) => {
      if (t.launchpad.toLowerCase().includes('pump') || t.launchpad.toLowerCase().includes('bonk')) {
        return t.graduated
          ? { value: 0.2, detail: 'Migrated to AMM pool by launchpad (protocol-managed LP)' }
          : { value: 0.15, detail: 'Liquidity held by bonding-curve program (cannot be pulled)' };
      }
      return { value: null, detail: 'LP lock status unknown for this launchpad' };
    },
  },
  {
    key: 'mintFreeze',
    label: 'Mint / freeze authority',
    weight: 12,
    description: 'Active authorities allow infinite minting or freezing holders.',
    evaluate: (t) => {
      if (t.mintAuthorityDisabled === null && t.freezeAuthorityDisabled === null) return { value: null, detail: 'Authorities not yet checked' };
      const mint = t.mintAuthorityDisabled === false ? 1 : 0;
      const freeze = t.freezeAuthorityDisabled === false ? 0.85 : 0;
      const parts = [
        t.mintAuthorityDisabled === false ? 'mint authority ACTIVE' : t.mintAuthorityDisabled ? 'mint revoked' : 'mint unknown',
        t.freezeAuthorityDisabled === false ? 'freeze authority ACTIVE' : t.freezeAuthorityDisabled ? 'freeze revoked' : 'freeze unknown',
      ];
      return { value: Math.max(mint, freeze), detail: parts.join(', ') };
    },
  },
  {
    key: 'contractSignals',
    label: 'Contract / security signals',
    weight: 4,
    description: 'Risky token extensions, mutable metadata and missing metadata.',
    evaluate: (t) =>
      t.securityRisk === null
        ? { value: null, detail: 'Security scan pending' }
        : { value: t.securityRisk, detail: t.securityNotes.length ? t.securityNotes.join('; ') : 'No contract issues found' },
  },
  {
    key: 'priceManipulation',
    label: 'Price manipulation',
    weight: 7,
    description: 'Parabolic spikes followed by sharp reversals (pump-and-dump shape).',
    evaluate: (t) => {
      if (t.history.length < 4) return { value: null, detail: 'Not enough price history' };
      const recent = t.history.filter((h) => h.t >= Date.now() - 30 * 60_000);
      const series = recent.length >= 4 ? recent : t.history.slice(-20);
      let peak = series[0].price;
      let maxDd = 0;
      let maxRun = 0;
      let trough = series[0].price;
      for (const p of series) {
        peak = Math.max(peak, p.price);
        trough = Math.min(trough, p.price);
        maxDd = Math.max(maxDd, 1 - p.price / peak);
        maxRun = Math.max(maxRun, p.price / trough - 1);
      }
      const spike = t.priceChange5m !== null ? clamp01(Math.abs(t.priceChange5m) / 150) : 0;
      const pumpDump = maxRun > 1 && maxDd > 0.5 ? 1 : clamp01(maxDd * maxRun);
      return { value: Math.max(spike, pumpDump), detail: `Max run +${pct(maxRun * 100)}, max drawdown -${pct(maxDd * 100)} (30m)` };
    },
  },
];

export const RISK_FACTOR_DEFS = DEFS.map(({ key, label, description, weight }) => ({ key, label, description, weight }));

export function riskLevel(total: number): RiskLevel {
  if (total >= 75) return 'Extreme';
  if (total >= 50) return 'High';
  if (total >= 30) return 'Medium';
  return 'Low';
}

/** Hard floors for critical safety failures, shown to the user as explicit overrides. */
export function criticalFloor(t: Token): { floor: number; reason: string } | null {
  if (t.mintAuthorityDisabled === false) return { floor: 80, reason: 'Mint authority is active — supply can be inflated' };
  if (t.freezeAuthorityDisabled === false) return { floor: 70, reason: 'Freeze authority is active — holders can be frozen' };
  if (t.creatorSoldPct >= 80) return { floor: 65, reason: 'Creator dumped most of their allocation' };
  return null;
}

export function computeRisk(token: Token): Breakdown & { floorReason: string | null } {
  const b = aggregate(runFactors(DEFS, token));
  const floor = criticalFloor(token);
  return floor && floor.floor > b.total ? { ...b, total: floor.floor, floorReason: floor.reason } : { ...b, floorReason: null };
}
