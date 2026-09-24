import { config } from '../../env.ts';
import type { LaunchEvent, TokenAudit, TokenMarketData, WindowStats } from '../../../shared/types.ts';
import { registerSource, requestJson } from '../httpClient.ts';
import type { MarketDataProvider } from './types.ts';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOURCE = 'market';
registerSource(SOURCE, 1100);

interface JupStats {
  priceChange?: number;
  holderChange?: number;
  liquidityChange?: number;
  volumeChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  buyOrganicVolume?: number;
  sellOrganicVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
  numNetBuyers?: number;
}

interface JupToken {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  dev?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  launchpad?: string;
  graduatedPool?: string;
  graduatedAt?: string;
  holderCount?: number;
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  bondingCurve?: number;
  stats5m?: JupStats;
  stats1h?: JupStats;
  stats24h?: JupStats;
  firstPool?: { id?: string; createdAt?: string };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
    devMints?: number;
    devMigrations?: number;
  };
  organicScore?: number;
  tags?: string[];
  createdAt?: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ts = (v?: string) => (v ? Date.parse(v) || undefined : undefined);

function stats(s?: JupStats): WindowStats | undefined {
  if (!s) return undefined;
  return {
    priceChange: num(s.priceChange),
    holderChange: num(s.holderChange),
    liquidityChange: num(s.liquidityChange),
    volumeChange: num(s.volumeChange),
    buyVolume: s.buyVolume ?? 0,
    sellVolume: s.sellVolume ?? 0,
    buyOrganicVolume: num(s.buyOrganicVolume),
    sellOrganicVolume: num(s.sellOrganicVolume),
    numBuys: s.numBuys ?? 0,
    numSells: s.numSells ?? 0,
    numTraders: s.numTraders ?? 0,
    numNetBuyers: s.numNetBuyers ?? 0,
  };
}

export function normalizeJupiter(t: JupToken): TokenMarketData {
  const audit: TokenAudit = {
    mintAuthorityDisabled: t.audit?.mintAuthorityDisabled ?? null,
    freezeAuthorityDisabled: t.audit?.freezeAuthorityDisabled ?? null,
    topHoldersPercentage: num(t.audit?.topHoldersPercentage),
    devBalancePercentage: num(t.audit?.devBalancePercentage),
    devMints: num(t.audit?.devMints),
    devMigrations: num(t.audit?.devMigrations),
  };
  const supply = t.totalSupply ?? t.circSupply ?? 0;
  return {
    mint: t.id,
    name: t.name,
    symbol: t.symbol,
    icon: t.icon,
    dev: t.dev,
    decimals: t.decimals,
    price: t.usdPrice ?? 0,
    mcap: t.mcap ?? 0,
    fdv: t.fdv ?? t.mcap ?? 0,
    liquidity: t.liquidity ?? 0,
    holderCount: t.holderCount ?? 0,
    supply,
    launchpad: t.launchpad,
    graduated: Boolean(t.graduatedPool),
    graduatedPool: t.graduatedPool,
    graduatedAt: ts(t.graduatedAt),
    firstPool: t.firstPool?.id,
    createdAt: ts(t.firstPool?.createdAt) ?? ts(t.createdAt),
    bondingProgress: num(t.bondingCurve),
    stats5m: stats(t.stats5m),
    stats1h: stats(t.stats1h),
    stats24h: stats(t.stats24h),
    audit,
    organicScore: num(t.organicScore),
    socials: { twitter: t.twitter, telegram: t.telegram, website: t.website },
    tokenProgram: t.tokenProgram,
    tags: t.tags,
  };
}

/** Jupiter public API (no key). Token search accepts comma-separated mints for batching. */
export const jupiterProvider: MarketDataProvider = {
  name: 'Jupiter',

  async fetchTokens(mints) {
    if (mints.length === 0) return [];
    const wanted = new Set(mints);
    const data = await requestJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/search?query=${mints.join(',')}`, {
      source: SOURCE,
      ttl: 2500,
    });
    return (Array.isArray(data) ? data : []).filter((t) => wanted.has(t.id)).map(normalizeJupiter);
  },

  async fetchRecent() {
    const data = await requestJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/recent`, { source: SOURCE, ttl: 5000 });
    return (Array.isArray(data) ? data : [])
      .filter((t) => t.id && t.symbol)
      .map<LaunchEvent>((t) => {
        const market = normalizeJupiter(t);
        return {
          mint: t.id,
          name: t.name ?? 'Unknown',
          symbol: t.symbol ?? '???',
          creator: t.dev,
          createdAt: market.createdAt ?? Date.now(),
          image: t.icon,
          market,
        };
      });
  },

  async fetchSolPrice() {
    const data = await requestJson<Record<string, { usdPrice?: number }>>(`${config.jupiterApi}/price/v3?ids=${SOL_MINT}`, {
      source: SOURCE,
      ttl: 20_000,
    });
    const price = data[SOL_MINT]?.usdPrice;
    if (!price) throw new Error('SOL price unavailable');
    return price;
  },
};
