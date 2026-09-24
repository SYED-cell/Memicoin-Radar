import type { DataSource, HistoryPoint, LaunchEvent, MigrationEvent, Token, TokenMarketData, Trade, TradeEvent } from './types.ts';
import { hashString } from './random.ts';
import { explainChange } from './aiService.ts';
import { computeOpportunity, deriveConfidence, deriveMomentum, derivePhase, deriveSignal } from './opportunityEngine.ts';
import { computeRisk } from './riskEngine.ts';
import { ipfsUrl } from './ipfs.ts';

const PUMP_SUPPLY = 1_000_000_000;
const MAX_HISTORY = 720;
const MAX_TRADES = 150;
const MAX_SCORE_HISTORY = 240;
const LOGOS = ['🐸', '🐕', '🐱', '🚀', '🦊', '🐻', '🐵', '🦄', '🐉', '🐳', '🦈', '🐧', '🦉', '🐂', '🐺', '🤖'];
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#eab308', '#06b6d4', '#ef4444'];

const EMPTY_BREAKDOWN = { total: 0, factors: [], coverage: 0, floorReason: null };

export function createToken(e: LaunchEvent, source: DataSource, solPrice: number, now = Date.now()): Token {
  const h = hashString(e.mint);
  const mcapUsd = e.marketCapSol && solPrice ? e.marketCapSol * solPrice : 0;
  const base: Token = {
    id: e.mint,
    mint: e.mint,
    address: e.mint,
    symbol: (e.symbol || '???').slice(0, 14),
    name: (e.name || 'Unknown').slice(0, 40),
    logo: LOGOS[h % LOGOS.length],
    image: ipfsUrl(e.image),
    color: COLORS[h % COLORS.length],
    chain: 'Solana',
    source,
    launchpad: e.pool === 'bonk' ? 'letsbonk' : e.pool && e.pool !== 'pump' ? e.pool : 'pump.fun',
    narrative: '',
    socials: {},
    metadataUri: e.uri,
    createdAt: e.createdAt,
    detectedAt: now,
    updatedAt: now,
    marketUpdatedAt: null,
    creator: e.creator,
    bondingCurve: e.bondingCurve,
    creatorInitialBuyPct: e.initialBuyTokens ? (e.initialBuyTokens / PUMP_SUPPLY) * 100 : null,
    graduated: false,
    bondingProgress: null,
    price: mcapUsd / PUMP_SUPPLY,
    marketCap: mcapUsd,
    fdv: mcapUsd,
    liquidity: 0,
    supply: PUMP_SUPPLY,
    priceChange5m: null,
    priceChange1h: null,
    priceChange24h: 0,
    liquidityChange5m: null,
    volume5m: 0,
    volume1h: 0,
    volume24h: 0,
    buyVolume: 0,
    sellVolume: 0,
    buys24h: 0,
    sells24h: 0,
    transactions24h: 0,
    traders: 0,
    netBuyers: 0,
    organicScore: null,
    organicVolumeRatio: null,
    holders: e.creator ? 1 : 0,
    holdersChange: null,
    topHoldersPct: null,
    devHoldingPct: null,
    devMints: null,
    devMigrations: null,
    mintAuthorityDisabled: null,
    freezeAuthorityDisabled: null,
    securityRisk: null,
    securityNotes: [],
    onChainVerifiedAt: null,
    metadataOk: null,
    verify: null,
    history: e.history?.slice(-MAX_HISTORY) ?? (mcapUsd ? [point(now, mcapUsd / PUMP_SUPPLY, mcapUsd, 0, 0, 0, 0, 1)] : []),
    trades: [],
    creatorSoldPct: 0,
    score: 0,
    riskScore: 0,
    momentum: 'Unknown',
    phase: 'Early',
    confidence: 0,
    signal: 'INSUFFICIENT DATA',
    risk: EMPTY_BREAKDOWN,
    opportunity: EMPTY_BREAKDOWN,
    scoreHistory: [],
    lastChange: null,
  };
  const withMarket = e.market ? applyMarket(base, e.market, now, true) : base;
  return evaluate(withMarket, undefined, now);
}

function point(t: number, price: number, mcap: number, liquidity: number, volume: number, buyVolume: number, sellVolume: number, holders: number): HistoryPoint {
  return { t, price, mcap, liquidity, volume, buyVolume, sellVolume, holders };
}

/** Appends a history point, merging points closer than `mergeMs` to keep arrays bounded. */
function pushHistory(history: HistoryPoint[], p: HistoryPoint, mergeMs = 3000): HistoryPoint[] {
  const last = history[history.length - 1];
  if (last && p.t - last.t < mergeMs) {
    const merged = { ...p, volume: last.volume + p.volume, buyVolume: last.buyVolume + p.buyVolume, sellVolume: last.sellVolume + p.sellVolume };
    return [...history.slice(0, -1), merged];
  }
  const next = [...history, p];
  return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
}

function priceChangeFromHistory(t: Token, ms: number, now: number): number | null {
  if (t.history.length < 2 || !t.price) return null;
  const target = now - ms;
  const ref = t.history.find((h) => h.t >= target);
  if (!ref || ref.price <= 0 || now - ref.t < ms * 0.25) return null;
  return (t.price / ref.price - 1) * 100;
}

export function applyMarket(t: Token, m: TokenMarketData, now = Date.now(), initial = false): Token {
  const s5 = m.stats5m;
  const s1 = m.stats1h;
  const s24 = m.stats24h ?? s1;
  const vol24 = s24 ? s24.buyVolume + s24.sellVolume : t.volume24h;
  const volumeDelta = initial ? 0 : Math.max(0, vol24 - t.volume24h);
  const buyShare = s24 && vol24 > 0 ? s24.buyVolume / vol24 : 0.5;
  const organic =
    s24 && s24.buyOrganicVolume !== null && s24.sellOrganicVolume !== null && vol24 > 0
      ? (s24.buyOrganicVolume + s24.sellOrganicVolume) / vol24
      : t.organicVolumeRatio;

  const next: Token = {
    ...t,
    symbol: m.symbol?.slice(0, 14) || t.symbol,
    name: m.name?.slice(0, 40) || t.name,
    image: ipfsUrl(m.icon) ?? t.image,
    launchpad: m.launchpad ?? t.launchpad,
    socials: { ...t.socials, ...Object.fromEntries(Object.entries(m.socials).filter(([, v]) => v)) },
    createdAt: m.createdAt && m.createdAt < t.createdAt ? m.createdAt : t.createdAt,
    creator: t.creator ?? m.dev,
    graduated: t.graduated || m.graduated,
    pool: m.graduatedPool ?? t.pool,
    bondingProgress: m.bondingProgress ?? (m.graduated ? 100 : t.bondingProgress),
    price: m.price || t.price,
    marketCap: m.mcap || t.marketCap,
    fdv: m.fdv || m.mcap || t.fdv,
    liquidity: m.liquidity,
    supply: m.supply || t.supply,
    priceChange5m: s5?.priceChange ?? null,
    priceChange1h: s1?.priceChange ?? null,
    liquidityChange5m: s5?.liquidityChange ?? null,
    volume5m: s5 ? s5.buyVolume + s5.sellVolume : 0,
    volume1h: s1 ? s1.buyVolume + s1.sellVolume : 0,
    volume24h: vol24,
    buyVolume: s1 ? s1.buyVolume : vol24 * buyShare,
    sellVolume: s1 ? s1.sellVolume : vol24 * (1 - buyShare),
    buys24h: s24?.numBuys ?? t.buys24h,
    sells24h: s24?.numSells ?? t.sells24h,
    transactions24h: s24 ? s24.numBuys + s24.numSells : t.transactions24h,
    traders: s24?.numTraders ?? t.traders,
    netBuyers: s1?.numNetBuyers ?? t.netBuyers,
    organicScore: m.organicScore ?? t.organicScore,
    organicVolumeRatio: organic,
    holders: m.holderCount || t.holders,
    holdersChange: s1?.holderChange ?? t.holdersChange,
    topHoldersPct: m.audit.topHoldersPercentage ?? t.topHoldersPct,
    devHoldingPct: m.audit.devBalancePercentage ?? t.devHoldingPct,
    devMints: m.audit.devMints ?? t.devMints,
    devMigrations: m.audit.devMigrations ?? t.devMigrations,
    mintAuthorityDisabled: m.audit.mintAuthorityDisabled ?? t.mintAuthorityDisabled,
    freezeAuthorityDisabled: m.audit.freezeAuthorityDisabled ?? t.freezeAuthorityDisabled,
    tokenProgram: m.tokenProgram ?? t.tokenProgram,
    marketUpdatedAt: now,
    updatedAt: now,
  };
  // Creator selling inferred from falling dev balance (works without a trade stream).
  if (t.devHoldingPct !== null && m.audit.devBalancePercentage !== null && t.creatorInitialBuyPct) {
    const sold = ((t.creatorInitialBuyPct - m.audit.devBalancePercentage) / t.creatorInitialBuyPct) * 100;
    next.creatorSoldPct = Math.max(t.creatorSoldPct, Math.min(100, Math.max(0, sold)));
  }
  if (next.price > 0) {
    next.history = pushHistory(
      t.history,
      point(now, next.price, next.marketCap, next.liquidity, volumeDelta, volumeDelta * buyShare, volumeDelta * (1 - buyShare), next.holders),
    );
  }
  next.priceChange24h = s24?.priceChange ?? priceChangeFromHistory(next, 86_400_000, now) ?? (next.history[0] ? (next.price / next.history[0].price - 1) * 100 : 0);
  if (next.priceChange5m === null) next.priceChange5m = priceChangeFromHistory(next, 300_000, now);
  if (next.priceChange1h === null) next.priceChange1h = priceChangeFromHistory(next, 3_600_000, now);
  return next;
}

export function applyTrade(t: Token, e: TradeEvent, solPrice: number): Token {
  const usd = e.solAmount * solPrice;
  const mcap = e.marketCapSol > 0 ? e.marketCapSol * solPrice : t.marketCap;
  const price = mcap / (t.supply || PUMP_SUPPLY);
  const isCreator = Boolean(t.creator && e.trader === t.creator);
  const trade: Trade = { signature: e.signature, side: e.side, trader: e.trader, sol: e.solAmount, usd, tokens: e.tokenAmount, price, t: e.t, isCreator };
  const next: Token = {
    ...t,
    price: price || t.price,
    marketCap: mcap,
    fdv: mcap,
    trades: [trade, ...t.trades].slice(0, MAX_TRADES),
    updatedAt: e.t,
  };
  if (isCreator && e.side === 'sell' && t.creatorInitialBuyPct) {
    const soldPctOfSupply = (e.tokenAmount / (t.supply || PUMP_SUPPLY)) * 100;
    next.creatorSoldPct = Math.min(100, t.creatorSoldPct + (soldPctOfSupply / t.creatorInitialBuyPct) * 100);
  }
  // Without market-data coverage yet, derive flow aggregates from the stream itself.
  if (!t.marketUpdatedAt) {
    next.buyVolume = t.buyVolume + (e.side === 'buy' ? usd : 0);
    next.sellVolume = t.sellVolume + (e.side === 'sell' ? usd : 0);
    next.volume24h = t.volume24h + usd;
    next.buys24h = t.buys24h + (e.side === 'buy' ? 1 : 0);
    next.sells24h = t.sells24h + (e.side === 'sell' ? 1 : 0);
    next.transactions24h = next.buys24h + next.sells24h;
    next.traders = new Set(next.trades.map((x) => x.trader)).size;
  }
  if (price > 0) {
    next.history = pushHistory(t.history, point(e.t, price, mcap, t.liquidity, usd, e.side === 'buy' ? usd : 0, e.side === 'sell' ? usd : 0, t.holders));
  }
  return next;
}

export function applyMigration(t: Token, e: MigrationEvent): Token {
  return { ...t, graduated: true, pool: e.pool ?? t.pool, bondingProgress: 100, updatedAt: e.t };
}

export function applySecurity(
  t: Token,
  risk: number,
  notes: string[],
  authorities?: { mintDisabled: boolean; freezeDisabled: boolean },
  verification?: { onChainAt: number | null; metadataOk: boolean | null },
): Token {
  return {
    ...t,
    onChainVerifiedAt: verification?.onChainAt ?? t.onChainVerifiedAt ?? null,
    metadataOk: verification?.metadataOk ?? t.metadataOk ?? null,
    securityRisk: risk,
    securityNotes: notes,
    mintAuthorityDisabled: authorities ? authorities.mintDisabled : t.mintAuthorityDisabled,
    freezeAuthorityDisabled: authorities ? authorities.freezeDisabled : t.freezeAuthorityDisabled,
  };
}

export function applyMetadata(t: Token, meta: { description?: string; image?: string; socials: Token['socials'] }): Token {
  return {
    ...t,
    description: meta.description?.slice(0, 280) ?? t.description,
    narrative: meta.description ? meta.description.split(/[.\n]/)[0].slice(0, 60) : t.narrative,
    image: t.image ?? ipfsUrl(meta.image),
    socials: { ...meta.socials, ...t.socials },
  };
}

/** Runs the risk + opportunity engines and records score history / change explanations. */
export function evaluate(t: Token, prev: Token | undefined, now = Date.now()): Token {
  const risk = computeRisk(t);
  const opportunity = computeOpportunity(t);
  const next: Token = {
    ...t,
    risk,
    opportunity,
    score: opportunity.total,
    riskScore: risk.total,
    momentum: deriveMomentum(opportunity),
    phase: derivePhase(t, now),
    confidence: deriveConfidence(t, risk, opportunity, now),
    signal: deriveSignal(t, risk, opportunity, now),
  };
  const lastPoint = t.scoreHistory[t.scoreHistory.length - 1];
  if (!lastPoint || lastPoint.score !== next.score || lastPoint.risk !== next.riskScore || now - lastPoint.t > 60_000) {
    next.scoreHistory = [...t.scoreHistory, { t: now, score: next.score, risk: next.riskScore }].slice(-MAX_SCORE_HISTORY);
  }
  if (prev && prev.risk.factors.length) {
    const change = explainChange(prev, next);
    if (change) next.lastChange = change;
  }
  return next;
}

/** Creates a token directly from market data (e.g. a pinned mint that is no longer in the live feed). */
export function tokenFromMarket(m: TokenMarketData, source: DataSource, now = Date.now()): Token {
  return createToken(
    { mint: m.mint, name: m.name ?? 'Unknown', symbol: m.symbol ?? '???', creator: m.dev, createdAt: m.createdAt ?? now, image: m.icon, market: m },
    source,
    0,
    now,
  );
}

/** Trims a token for persistence. */
export function compactToken(t: Token): Token {
  return { ...t, history: t.history.slice(-200), trades: t.trades.slice(0, 30), scoreHistory: t.scoreHistory.slice(-80) };
}
