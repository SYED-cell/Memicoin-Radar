import type { LaunchEvent, MigrationEvent, StreamState, TokenMarketData, TradeEvent } from '../../../shared/types.ts';

export interface StreamHandlers {
  onLaunch: (e: LaunchEvent) => void;
  onTrade: (e: TradeEvent) => void;
  onMigration: (e: MigrationEvent) => void;
  onStatus: (state: StreamState, info: { attempts: number; url: string; tradeStream: boolean; error?: string }) => void;
}

/** Real-time launch/trade stream (WebSocket in live mode, timer-driven in mock mode). */
export interface LaunchStream {
  connect(handlers: StreamHandlers): void;
  disconnect(): void;
  /** Replaces the set of mints whose trades should be streamed (no-op if unsupported). */
  setTradeSubscriptions(mints: string[]): void;
}

/** Batched market data (price, liquidity, holders, audit, flow stats). */
export interface MarketDataProvider {
  readonly name: string;
  fetchTokens(mints: string[]): Promise<TokenMarketData[]>;
  /** Recently created tokens — used for startup backfill and as a polling fallback for detection. */
  fetchRecent(): Promise<LaunchEvent[]>;
  fetchSolPrice(): Promise<number>;
}

export interface MintAccountInfo {
  decimals: number;
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenProgram: string;
  extensions: string[];
  metadata: { name?: string; symbol?: string; uri?: string; updateAuthority: string | null } | null;
}

export interface LargestAccount {
  tokenAccount: string;
  owner: string | null;
  amount: number;
}

/** On-chain reads (Solana RPC in live mode). */
export interface ChainProvider {
  readonly name: string;
  getMintInfo(mint: string): Promise<MintAccountInfo | null>;
  getLargestAccounts(mint: string): Promise<LargestAccount[]>;
  getBalanceSol(wallet: string): Promise<number>;
  getSignatures(wallet: string, limit: number): Promise<{ signature: string; blockTime: number | null; err: unknown }[]>;
  getMetadataJson(uri: string): Promise<Record<string, unknown> | null>;
}
