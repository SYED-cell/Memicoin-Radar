/**
 * DEMO/FALLBACK ONLY. Simulates a pump.fun-style launch environment so the app remains usable
 * offline or when live sources are unreachable. It emits the same event and data shapes as the
 * live providers, so the whole analytics pipeline runs unchanged. Every token it produces is
 * tagged `source: 'mock'` and labelled DEMO in the UI.
 */
import type { HistoryPoint, LaunchEvent, TokenMarketData, WindowStats } from '../../../shared/types.ts';
import { clamp, gaussian, hashString, mulberry32 } from '../../../shared/random.ts';
import { NEW_LISTING_PARTS, TOKEN_CATALOG } from './mockCatalog.ts';
import type { ChainProvider, LaunchStream, MarketDataProvider, StreamHandlers } from './types.ts';

const SUPPLY = 1_000_000_000;
const SOL_USD = 150;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const GRADUATION_MCAP = 69_000;

function addr(rand: () => number, suffix = ''): string {
  let s = '';
  for (let i = 0; i < 44 - suffix.length; i++) s += B58[Math.floor(rand() * B58.length)];
  return s + suffix;
}

interface SimTrade {
  t: number;
  side: 'buy' | 'sell';
  usd: number;
  trader: string;
  organic: boolean;
}

interface SimToken {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurve: string;
  createdAt: number;
  mcap: number;
  liquidity: number;
  holders: number;
  quality: number;
  rug: boolean;
  mintAuthorityDisabled: boolean;
  freezeAuthorityDisabled: boolean;
  topPct: number;
  devPct: number;
  devInitialPct: number;
  devMints: number;
  devMigrations: number;
  organicShare: number;
  socials: TokenMarketData['socials'];
  description: string;
  graduated: boolean;
  pool?: string;
  trades: SimTrade[];
  lastStep: number;
  traders: string[];
}

type WorldEvent =
  | { kind: 'trade'; mint: string; trade: SimTrade & { tokens: number; mcapSol: number } }
  | { kind: 'migrate'; mint: string; pool: string };

class MockWorld {
  tokens = new Map<string, SimToken>();
  private rand = Math.random;
  private counter = 0;
  listeners = new Set<(e: WorldEvent) => void>();

  create(ageMs = 0): SimToken {
    const r = this.rand;
    const useCatalog = r() < 0.5;
    const entry = TOKEN_CATALOG[Math.floor(r() * TOKEN_CATALOG.length)];
    const { prefixes, animals } = NEW_LISTING_PARTS;
    const pre = prefixes[Math.floor(r() * prefixes.length)];
    const animal = animals[Math.floor(r() * animals.length)];
    const name = useCatalog ? `${entry.name}` : `${pre} ${animal.word}`;
    const symbol = (useCatalog ? entry.symbol : (pre.slice(0, 2) + animal.word.slice(0, 3)).toUpperCase()) + (++this.counter % 7 === 0 ? '2' : '');
    const quality = clamp(r() ** 1.4, 0.02, 0.98);
    const rug = r() < 0.18;
    const devInitialPct = clamp(r() ** 2 * 18 + 0.5, 0.5, 22);
    const t: SimToken = {
      mint: addr(r, 'pump'),
      name,
      symbol,
      creator: addr(r),
      bondingCurve: addr(r),
      createdAt: Date.now() - ageMs,
      mcap: 4200 + r() * 1500,
      liquidity: 0,
      holders: 1,
      quality,
      rug,
      mintAuthorityDisabled: r() > 0.04,
      freezeAuthorityDisabled: r() > 0.03,
      topPct: clamp(55 - quality * 35 + (rug ? 20 : 0) + gaussian(r) * 6, 8, 92),
      devPct: devInitialPct,
      devInitialPct,
      devMints: Math.floor(r() ** 3 * (rug ? 180 : 25)),
      devMigrations: Math.floor(r() ** 2 * 3),
      organicShare: clamp(quality * 0.8 + gaussian(r) * 0.1, 0.02, 0.95),
      socials: {
        twitter: r() < 0.3 + quality * 0.5 ? `https://x.com/${symbol.toLowerCase()}coin` : undefined,
        telegram: r() < 0.2 + quality * 0.4 ? `https://t.me/${symbol.toLowerCase()}portal` : undefined,
        website: r() < quality * 0.5 ? `https://${symbol.toLowerCase()}.fun` : undefined,
      },
      description: `${name} — ${useCatalog ? entry.narrative : 'community'} meme on Solana.`,
      graduated: false,
      trades: [],
      lastStep: Date.now() - ageMs,
      traders: [],
    };
    t.liquidity = t.mcap * 0.2;
    this.tokens.set(t.mint, t);
    return t;
  }

  /** Advances one token's simulation up to `now` in ≤10s steps. */
  step(tok: SimToken, now: number, emit: boolean) {
    const r = this.rand;
    while (tok.lastStep + 1000 < now) {
      const dt = Math.min(10_000, now - tok.lastStep);
      tok.lastStep += dt;
      const ageMin = (tok.lastStep - tok.createdAt) / 60_000;
      const hype = Math.exp(-ageMin / (8 + tok.quality * 90));
      const activity = (0.15 + tok.quality * 1.4) * (0.3 + hype * 2) * (dt / 10_000);
      let drift = (tok.quality - 0.45) * 0.03 * hype + gaussian(r) * 0.045 * (0.5 + hype);
      if (tok.rug && ageMin > 6 + tok.quality * 20 && r() < 0.02) {
        drift -= 0.55; // rug / dev dump
        tok.devPct = Math.max(0, tok.devPct * 0.1);
      }
      if (!tok.rug && tok.devPct > 0 && r() < 0.004) tok.devPct *= 0.5; // occasional partial dev sell
      const prev = tok.mcap;
      tok.mcap = clamp(tok.mcap * Math.exp(drift), 2500, 40_000_000);
      const n = Math.max(0, Math.round(activity * (2 + r() * 5)));
      for (let i = 0; i < n; i++) {
        const buy = r() < clamp(0.5 + (tok.mcap - prev) / prev * 4, 0.1, 0.9);
        const trader = tok.traders.length > 3 && r() < 0.35 ? tok.traders[Math.floor(r() * tok.traders.length)] : addr(r);
        if (!tok.traders.includes(trader)) tok.traders.push(trader);
        if (tok.traders.length > 400) tok.traders.shift();
        const trade: SimTrade = {
          t: tok.lastStep - Math.floor(r() * dt),
          side: buy ? 'buy' : 'sell',
          usd: Math.exp(gaussian(r) * 1.1) * (20 + tok.mcap / 900),
          trader,
          organic: r() < tok.organicShare,
        };
        tok.trades.push(trade);
        if (buy && r() < 0.6) tok.holders++;
        if (!buy && r() < 0.25) tok.holders = Math.max(1, tok.holders - 1);
        if (emit) this.emitTrade(tok, trade);
      }
      if (emit && drift < -0.4) {
        this.emitTrade(tok, { t: tok.lastStep, side: 'sell', usd: prev * 0.08, trader: tok.creator, organic: false });
      }
      const cutoff = tok.lastStep - 86_400_000;
      if (tok.trades.length > 4000 || (tok.trades[0] && tok.trades[0].t < cutoff)) tok.trades = tok.trades.filter((x) => x.t >= cutoff).slice(-4000);
      if (!tok.graduated && tok.mcap >= GRADUATION_MCAP) {
        tok.graduated = true;
        tok.pool = addr(r);
        if (emit) this.listeners.forEach((l) => l({ kind: 'migrate', mint: tok.mint, pool: tok.pool! }));
      }
      tok.liquidity = tok.graduated ? tok.mcap * clamp(0.12 + tok.quality * 0.1, 0.08, 0.25) : tok.mcap * 0.2;
      tok.topPct = clamp(tok.topPct + gaussian(r) * 0.3 - (n > 3 ? 0.15 : 0), 5, 95);
    }
  }

  private emitTrade(tok: SimToken, trade: SimTrade) {
    const price = tok.mcap / SUPPLY;
    this.listeners.forEach((l) =>
      l({ kind: 'trade', mint: tok.mint, trade: { ...trade, tokens: trade.usd / price, mcapSol: tok.mcap / SOL_USD } }),
    );
  }

  windowStats(tok: SimToken, windowMs: number, now: number): WindowStats {
    const from = now - windowMs;
    const inWin = tok.trades.filter((x) => x.t >= from);
    const prevWin = tok.trades.filter((x) => x.t >= from - windowMs && x.t < from);
    const sum = (arr: SimTrade[], side: 'buy' | 'sell', organicOnly = false) =>
      arr.filter((x) => x.side === side && (!organicOnly || x.organic)).reduce((s, x) => s + x.usd, 0);
    const traders = new Set(inWin.map((x) => x.trader));
    const buyers = new Set(inWin.filter((x) => x.side === 'buy').map((x) => x.trader));
    const sellers = new Set(inWin.filter((x) => x.side === 'sell').map((x) => x.trader));
    const vol = sum(inWin, 'buy') + sum(inWin, 'sell');
    const prevVol = sum(prevWin, 'buy') + sum(prevWin, 'sell');
    return {
      priceChange: null,
      holderChange: null,
      liquidityChange: null,
      volumeChange: prevVol > 0 ? (vol / prevVol - 1) * 100 : null,
      buyVolume: sum(inWin, 'buy'),
      sellVolume: sum(inWin, 'sell'),
      buyOrganicVolume: sum(inWin, 'buy', true),
      sellOrganicVolume: sum(inWin, 'sell', true),
      numBuys: inWin.filter((x) => x.side === 'buy').length,
      numSells: inWin.filter((x) => x.side === 'sell').length,
      numTraders: traders.size,
      numNetBuyers: [...buyers].filter((b) => !sellers.has(b)).length - [...sellers].filter((s) => !buyers.has(s)).length,
    };
  }

  marketData(tok: SimToken, now: number, history?: HistoryPoint[]): TokenMarketData {
    const price = tok.mcap / SUPPLY;
    const at = (ms: number) => {
      if (!history?.length) return null;
      const target = now - ms;
      const p = history.find((h) => h.t >= target) ?? history[0];
      return p ? (price / p.price - 1) * 100 : null;
    };
    const s5 = this.windowStats(tok, 300_000, now);
    const s1h = this.windowStats(tok, 3_600_000, now);
    const s24 = this.windowStats(tok, 86_400_000, now);
    s5.priceChange = at(300_000);
    s1h.priceChange = at(3_600_000);
    s24.priceChange = at(86_400_000);
    return {
      mint: tok.mint,
      name: tok.name,
      symbol: tok.symbol,
      dev: tok.creator,
      decimals: 6,
      price,
      mcap: tok.mcap,
      fdv: tok.mcap,
      liquidity: tok.liquidity,
      holderCount: tok.holders,
      supply: SUPPLY,
      launchpad: 'pump.fun',
      graduated: tok.graduated,
      graduatedPool: tok.pool,
      createdAt: tok.createdAt,
      bondingProgress: tok.graduated ? 100 : clamp((tok.mcap / GRADUATION_MCAP) * 100, 0, 100),
      stats5m: s5,
      stats1h: s1h,
      stats24h: s24,
      audit: {
        mintAuthorityDisabled: tok.mintAuthorityDisabled,
        freezeAuthorityDisabled: tok.freezeAuthorityDisabled,
        topHoldersPercentage: tok.topPct,
        devBalancePercentage: tok.devPct,
        devMints: tok.devMints,
        devMigrations: tok.devMigrations,
      },
      organicScore: Math.round(tok.organicShare * 100),
      socials: tok.socials,
      tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    };
  }

  /** Builds a demo token that already has some history (startup backfill). */
  backfill(ageMs: number): LaunchEvent {
    const tok = this.create(ageMs);
    const history: HistoryPoint[] = [];
    let t = tok.createdAt;
    let lastTradeIdx = 0;
    while (t < Date.now()) {
      t = Math.min(Date.now(), t + 30_000);
      this.step(tok, t, false);
      const newTrades = tok.trades.slice(lastTradeIdx);
      lastTradeIdx = tok.trades.length;
      history.push({
        t,
        price: tok.mcap / SUPPLY,
        mcap: tok.mcap,
        liquidity: tok.liquidity,
        volume: newTrades.reduce((s, x) => s + x.usd, 0),
        buyVolume: newTrades.filter((x) => x.side === 'buy').reduce((s, x) => s + x.usd, 0),
        sellVolume: newTrades.filter((x) => x.side === 'sell').reduce((s, x) => s + x.usd, 0),
        holders: tok.holders,
      });
    }
    return {
      mint: tok.mint,
      name: tok.name,
      symbol: tok.symbol,
      creator: tok.creator,
      createdAt: tok.createdAt,
      bondingCurve: tok.bondingCurve,
      initialBuyTokens: (tok.devInitialPct / 100) * SUPPLY,
      marketCapSol: tok.mcap / SOL_USD,
      market: this.marketData(tok, Date.now(), history),
      history,
    };
  }
}

const world = new MockWorld();
const recordedHistory = new Map<string, HistoryPoint[]>();

export class MockStream implements LaunchStream {
  private timer: ReturnType<typeof setInterval> | undefined;
  private subs = new Set<string>();
  private handlers: StreamHandlers | null = null;
  private listener = (e: WorldEvent) => {
    if (!this.handlers) return;
    if (e.kind === 'migrate') {
      this.handlers.onMigration({ mint: e.mint, pool: e.pool, t: Date.now() });
      return;
    }
    if (!this.subs.has(e.mint)) return;
    this.handlers.onTrade({
      mint: e.mint,
      signature: addr(Math.random).slice(0, 44) + addr(Math.random).slice(0, 44),
      side: e.trade.side,
      trader: e.trade.trader,
      solAmount: e.trade.usd / SOL_USD,
      tokenAmount: e.trade.tokens,
      marketCapSol: e.trade.mcapSol,
      t: Math.min(Date.now(), e.trade.t),
    });
  };

  connect(handlers: StreamHandlers) {
    this.handlers = handlers;
    world.listeners.add(this.listener);
    handlers.onStatus('open', { attempts: 0, url: 'demo://simulated-stream', tradeStream: true });
    let nextLaunch = Date.now() + 2000;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const mint of this.subs) {
        const tok = world.tokens.get(mint);
        if (tok) world.step(tok, now, true);
      }
      if (now >= nextLaunch) {
        nextLaunch = now + 3500 + Math.random() * 6000;
        const tok = world.create(0);
        handlers.onLaunch({
          mint: tok.mint,
          name: tok.name,
          symbol: tok.symbol,
          creator: tok.creator,
          createdAt: tok.createdAt,
          bondingCurve: tok.bondingCurve,
          initialBuyTokens: (tok.devInitialPct / 100) * SUPPLY,
          initialBuySol: ((tok.devInitialPct / 100) * tok.mcap) / SOL_USD,
          marketCapSol: tok.mcap / SOL_USD,
          pool: 'pump',
        });
      }
    }, 1000);
  }

  disconnect() {
    clearInterval(this.timer);
    world.listeners.delete(this.listener);
    this.handlers?.onStatus('offline', { attempts: 0, url: 'demo://simulated-stream', tradeStream: true });
    this.handlers = null;
  }

  setTradeSubscriptions(mints: string[]) {
    this.subs = new Set(mints);
  }
}

let backfilled = false;

export const mockMarketProvider: MarketDataProvider = {
  name: 'Demo simulator',
  async fetchTokens(mints) {
    const now = Date.now();
    return mints
      .map((m) => world.tokens.get(m))
      .filter((t): t is SimToken => !!t)
      .map((t) => {
        world.step(t, now, false);
        const h = recordedHistory.get(t.mint) ?? [];
        h.push({ t: now, price: t.mcap / SUPPLY, mcap: t.mcap, liquidity: t.liquidity, volume: 0, buyVolume: 0, sellVolume: 0, holders: t.holders });
        recordedHistory.set(t.mint, h.slice(-400));
        return world.marketData(t, now, h);
      });
  },
  async fetchRecent() {
    if (backfilled) return [];
    backfilled = true;
    return Array.from({ length: 22 }, () => world.backfill((2 + Math.random() ** 1.5 * 180) * 60_000)).map((e) => {
      recordedHistory.set(e.mint, e.history ?? []);
      return e;
    });
  },
  async fetchSolPrice() {
    return SOL_USD;
  },
};

export const mockChain: ChainProvider = {
  name: 'Demo chain',
  async getMintInfo(mint) {
    const t = world.tokens.get(mint);
    if (!t) return null;
    return {
      decimals: 6,
      supply: SUPPLY,
      mintAuthority: t.mintAuthorityDisabled ? null : t.creator,
      freezeAuthority: t.freezeAuthorityDisabled ? null : t.creator,
      tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      extensions: ['metadataPointer', 'tokenMetadata'],
      metadata: { name: t.name, symbol: t.symbol, uri: undefined, updateAuthority: null },
    };
  },
  async getLargestAccounts(mint) {
    const t = world.tokens.get(mint);
    if (!t) return [];
    const rand = mulberry32(hashString(mint));
    const out = [];
    const curvePct = t.graduated ? 0 : clamp(100 - (t.mcap / GRADUATION_MCAP) * 80, 20, 95);
    if (!t.graduated) out.push({ tokenAccount: addr(rand), owner: t.bondingCurve, amount: (curvePct / 100) * SUPPLY });
    else out.push({ tokenAccount: addr(rand), owner: t.pool ?? addr(rand), amount: 0.18 * SUPPLY });
    if (t.devPct > 0.2) out.push({ tokenAccount: addr(rand), owner: t.creator, amount: (t.devPct / 100) * SUPPLY });
    let remaining = t.topPct - t.devPct;
    for (let i = 0; i < 18 && remaining > 0.2; i++) {
      const pct = Math.max(0.2, remaining * (0.18 + rand() * 0.2));
      remaining -= pct;
      out.push({ tokenAccount: addr(rand), owner: t.traders[Math.floor(rand() * t.traders.length)] ?? addr(rand), amount: (pct / 100) * SUPPLY });
    }
    return out.sort((a, b) => b.amount - a.amount);
  },
  async getBalanceSol(wallet) {
    return Math.round(mulberry32(hashString(wallet))() ** 2 * 4000) / 100;
  },
  async getSignatures(wallet, limit) {
    const rand = mulberry32(hashString(wallet + 'sig'));
    let t = Date.now() / 1000;
    return Array.from({ length: limit }, () => {
      t -= rand() * 3600 * 6;
      return { signature: addr(rand) + addr(rand), blockTime: Math.floor(t), err: rand() < 0.05 ? { InstructionError: 1 } : null };
    });
  },
  async getMetadataJson() {
    return null;
  },
};
