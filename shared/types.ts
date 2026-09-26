export type Chain = 'Solana';
export type DataSource = 'live' | 'mock';

export type Momentum = 'Explosive' | 'Strong' | 'Building' | 'Neutral' | 'Weak' | 'Unknown';
/** Lifecycle phase of a launch. */
export type Phase = 'Early' | 'Mid' | 'Late';
/** What the terminal shows instead of pretending to predict the future. */
export type Signal = 'WATCH' | 'HIGH-RISK SETUP' | 'AVOID' | 'INSUFFICIENT DATA';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Extreme';
/** Chart ranges for young, fast-moving tokens. */
export type Timeframe = '5M' | '1H' | '6H' | '24H';

/* ─────────────────────────── Raw provider data ─────────────────────────── */

export interface WindowStats {
  priceChange: number | null;
  holderChange: number | null;
  liquidityChange: number | null;
  volumeChange: number | null;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume: number | null;
  sellOrganicVolume: number | null;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numNetBuyers: number;
}

export interface TokenAudit {
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  topHoldersPercentage: number | null;
  devBalancePercentage: number | null;
  devMints: number | null;
  devMigrations: number | null;
}

export interface Socials {
  twitter?: string;
  telegram?: string;
  website?: string;
}

/** Normalised market snapshot from a market-data provider (Jupiter in live mode). */
export interface TokenMarketData {
  mint: string;
  name?: string;
  symbol?: string;
  icon?: string;
  dev?: string;
  decimals?: number;
  price: number;
  mcap: number;
  fdv: number;
  liquidity: number;
  holderCount: number;
  supply: number;
  launchpad?: string;
  graduated: boolean;
  graduatedPool?: string;
  graduatedAt?: number;
  firstPool?: string;
  createdAt?: number;
  bondingProgress?: number | null;
  stats5m?: WindowStats;
  stats1h?: WindowStats;
  stats24h?: WindowStats;
  audit: TokenAudit;
  organicScore: number | null;
  socials: Socials;
  tokenProgram?: string;
  tags?: string[];
}

export interface LaunchEvent {
  mint: string;
  name: string;
  symbol: string;
  creator?: string;
  createdAt: number;
  uri?: string;
  image?: string;
  bondingCurve?: string;
  initialBuyTokens?: number;
  initialBuySol?: number;
  marketCapSol?: number;
  pool?: string;
  signature?: string;
  /** Pre-fetched market data (e.g. from a "recent tokens" poll). */
  market?: TokenMarketData;
  /** Optional pre-built history (demo backfill only). */
  history?: HistoryPoint[];
}

export interface TradeEvent {
  mint: string;
  signature: string;
  side: 'buy' | 'sell';
  trader: string;
  solAmount: number;
  tokenAmount: number;
  marketCapSol: number;
  t: number;
}

export interface MigrationEvent {
  mint: string;
  pool?: string;
  t: number;
}

/* ─────────────────────────── Derived analytics ─────────────────────────── */

export interface Factor {
  key: string;
  label: string;
  description: string;
  weight: number;
  /** 0..1 intensity (risk: 1 = worst; opportunity: 1 = best). null = no data. */
  value: number | null;
  /** Weighted points after normalisation over available factors. */
  points: number;
  /** Plain-language evidence for the current value. */
  detail: string;
}

export interface Breakdown {
  total: number;
  factors: Factor[];
  coverage: number;
  /** Set when a critical safety failure forced a minimum score. */
  floorReason?: string | null;
}

export interface Trade {
  signature: string;
  side: 'buy' | 'sell';
  trader: string;
  sol: number;
  usd: number;
  tokens: number;
  price: number;
  t: number;
  isCreator: boolean;
}

export interface HistoryPoint {
  t: number;
  price: number;
  mcap: number;
  liquidity: number;
  /** Volume (USD) observed since the previous point. */
  volume: number;
  buyVolume: number;
  sellVolume: number;
  holders: number;
}

export interface ScorePoint {
  t: number;
  score: number;
  risk: number;
}

export interface ScoreChange {
  t: number;
  scoreDelta: number;
  riskDelta: number;
  reasons: string[];
}

export interface Token {
  id: string;
  mint: string;
  address: string;
  symbol: string;
  name: string;
  logo: string;
  image?: string;
  color: string;
  chain: Chain;
  source: DataSource;
  launchpad: string;
  narrative: string;
  description?: string;
  socials: Socials;
  metadataUri?: string;

  createdAt: number;
  detectedAt: number;
  updatedAt: number;
  marketUpdatedAt: number | null;
  /** When the on-chain bonding curve was last read; the curve owns pricing while this is fresh. */
  curveAt?: number | null;

  creator?: string;
  bondingCurve?: string;
  creatorInitialBuyPct: number | null;
  graduated: boolean;
  pool?: string;
  bondingProgress: number | null;

  price: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
  supply: number;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange24h: number;
  liquidityChange5m: number | null;

  volume5m: number;
  volume1h: number;
  volume24h: number;
  buyVolume: number;
  sellVolume: number;
  buys24h: number;
  sells24h: number;
  transactions24h: number;
  traders: number;
  netBuyers: number;
  organicScore: number | null;
  organicVolumeRatio: number | null;

  holders: number;
  holdersChange: number | null;
  topHoldersPct: number | null;
  devHoldingPct: number | null;
  devMints: number | null;
  devMigrations: number | null;
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  tokenProgram?: string;
  /** 0..1 contract/security risk from on-chain checks (null until checked). */
  securityRisk: number | null;
  /** When the mint account was last read successfully from the Solana RPC. */
  onChainVerifiedAt: number | null;
  /** Metadata resolved with a name + symbol (null = not checked). */
  metadataOk: boolean | null;
  /** Latest strict-filter verdict (full evidence via /api/tokens/:mint/verification). */
  verify: VerificationSummary | null;
  securityNotes: string[];

  history: HistoryPoint[];
  trades: Trade[];
  /** Largest single sells observed (stream) — used for whale/creator sell detection. */
  creatorSoldPct: number;

  score: number;
  riskScore: number;
  momentum: Momentum;
  phase: Phase;
  confidence: number;
  signal: Signal;
  risk: Breakdown;
  opportunity: Breakdown;
  scoreHistory: ScorePoint[];
  lastChange: ScoreChange | null;
}

/* ─────────────────────────── Intelligence ─────────────────────────── */

export interface HolderEntry {
  owner: string;
  tokenAccount: string;
  amount: number;
  pct: number;
  label?: 'Bonding curve' | 'Liquidity pool' | 'Creator' | 'Early buyer';
}

export interface HolderIntel {
  source: 'rpc' | 'trade-flow' | 'unavailable';
  fetchedAt: number;
  holders: HolderEntry[];
  top10Pct: number | null;
  note?: string;
}

export interface WalletTx {
  signature: string;
  t: number | null;
  ok: boolean;
}

export interface CreatorIntel {
  wallet: string;
  fetchedAt: number;
  balanceSol: number | null;
  recentTxs: WalletTx[];
  txCount: number | null;
  firstSeen: number | null;
  launchesReported: number | null;
  migrationsReported: number | null;
  launchesObserved: { mint: string; symbol: string; t: number }[];
  initialBuyPct: number | null;
  currentHoldingPct: number | null;
  soldPct: number;
  linkedWallets: { wallet: string; reason: string }[];
  errors: string[];
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface SecurityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SecurityIntel {
  fetchedAt: number;
  checks: SecurityCheck[];
  tokenProgram: string | null;
  decimals: number | null;
  supply: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  updateAuthority: string | null;
  metadata: { name?: string; symbol?: string; description?: string; image?: string; uri?: string; socials: Socials } | null;
  errors: string[];
}

export interface Scenario {
  label: 'Bull' | 'Base' | 'Bear';
  mcapLow: number;
  mcapHigh: number;
  changeLow: number;
  changeHigh: number;
  rationale: string;
}

export interface AIAnalysis {
  tokenId: string;
  generatedAt: number;
  opportunityScore: number;
  riskScore: number;
  momentum: Momentum;
  phase: Phase;
  confidence: number;
  signal: Signal;
  catalyst: string;
  summary: string;
  confirmations: string[];
  risks: string[];
  whyChanged: string[];
  scenarios: Scenario[];
  horizon: string;
}

/* ─────────────────────────── Alerts ─────────────────────────── */

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertCategory =
  | 'new_token'
  | 'score'
  | 'risk'
  | 'liquidity'
  | 'creator_sell'
  | 'whale_sell'
  | 'volume'
  | 'smart_money'
  | 'watchlist'
  | 'price'
  | 'trade'
  | 'high_risk'
  | 'verified';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  tokenId: string;
  symbol: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export interface AlertThresholds {
  newTokens: boolean;
  priceMovePct: number;
  newTokenMinScore: number;
  scoreThreshold: number;
  riskJump: number;
  liquidityDropPct: number;
  volumeSpikeX: number;
  largeSellUsd: number;
  creatorSell: boolean;
  smartMoney: boolean;
  watchMinScore: number;
  watchMaxRisk: number;
}

/* ─────────────────────────── Connection health ─────────────────────────── */

export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'offline' | 'disabled';

export interface SourceHealth {
  ok: boolean;
  lastOk: number | null;
  lastError: string | null;
  rateLimitedUntil: number | null;
}

export interface ConnectionHealth {
  mode: DataSource;
  stream: StreamState;
  streamUrl: string;
  tradeStream: boolean;
  reconnectAttempts: number;
  lastEventAt: number | null;
  launchesDetected: number;
  /** Bonding-curve accounts read from the chain for live USD pricing. */
  curveReads?: number;
  market: SourceHealth;
  rpc: SourceHealth;
  rpcKind: 'dedicated' | 'public' | 'unknown';
  fallbackReason: string | null;
}

/* ─────────────────────────── Charts / trading / misc ─────────────────────────── */

export interface SeriesPoint extends HistoryPoint {
  label: string;
}

export interface ChartMarker {
  t: number;
  price: number;
  side: 'buy' | 'sell';
  label: string;
}

export interface Position {
  tokenId: string;
  symbol: string;
  quantity: number;
  avgEntry: number;
  openedAt: number;
  stopLoss?: number;
  takeProfit?: number;
}

export type TradeSide = 'buy' | 'sell';
export type TradeReason = 'manual' | 'stop-loss' | 'take-profit';

export interface Transaction {
  id: string;
  tokenId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  total: number;
  fee: number;
  realizedPnl?: number;
  reason?: TradeReason;
  createdAt: number;
}

export interface PortfolioPoint {
  t: number;
  value: number;
}

export interface TradingState {
  startingBalance: number;
  cash: number;
  positions: Position[];
  transactions: Transaction[];
  /** Equity snapshots recorded from live prices. */
  equity: PortfolioPoint[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
}

export interface WatchItem {
  tokenId: string;
  addedAt: number;
  /** Snapshot so the watchlist can render even after a token leaves the live feed. */
  symbol?: string;
}

export interface TelegramPrefs {
  enabled: boolean;
  /** strict = only tokens passing all 14 checks; score = every analysed token at/above minScore. */
  mode: 'strict' | 'score';
  /** Minimum opportunity score for score mode (0–100). */
  minScore: number;
}

export interface TelegramStatus {
  /** Server has a bot token configured. */
  configured: boolean;
  botUsername: string | null;
  connected: boolean;
  username: string | null;
  linkedAt: number | null;
  prefs: TelegramPrefs;
  recent: { id: string; text: string; at: number; status: 'queued' | 'sent' | 'failed'; error?: string | null }[];
}

export type Language = 'en-US' | 'en-GB' | 'de-DE' | 'fr-FR' | 'es-ES' | 'ja-JP';

export interface TradingSettings {
  riskPerTradePct: number;
  maxPositionPct: number;
  defaultStopLossPct: number;
  defaultTakeProfitPct: number;
}

/** Per-user settings stored on the server. */
export interface UserSettings {
  notifications: {
    inApp: boolean;
    sound: boolean;
    browser: boolean;
    critical: boolean;
    warning: boolean;
    info: boolean;
  };
  alerts: AlertThresholds;
  trading: TradingSettings;
  telegram: TelegramPrefs;
}

/** Device-local UI preferences (not sensitive). */
export interface UiPrefs {
  theme: 'dark' | 'light';
  language: Language;
  compactNumbers: boolean;
}

export interface DailyReport {
  id: string;
  generatedAt: number;
  source: DataSource;
  totalTokens: number;
  newTokens: number;
  totalVolume: number;
  totalLiquidity: number;
  avgChange: number;
  marketStatus: string;
  topOpportunities: { tokenId: string; symbol: string; score: number }[];
  gainers: { tokenId: string; symbol: string; change: number }[];
  losers: { tokenId: string; symbol: string; change: number }[];
  riskSummary: Record<RiskLevel, number>;
  highlights: string[];
}

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

/* ─────────────────────────── Strict verification ─────────────────────────── */

export type VerifyStatus = 'TRADEABLE' | 'WATCH' | 'AVOID' | 'INSUFFICIENT DATA';
export type CheckOutcome = 'pass' | 'fail' | 'unknown';

export interface VerifyCheck {
  key: string;
  label: string;
  outcome: CheckOutcome;
  /** Critical checks turn a failure into AVOID. */
  critical: boolean;
  evidence: string;
  requirement: string;
  source: string;
  observedAt: number | null;
}

export interface VerifiedFact {
  label: string;
  value: string;
  source: string;
  observedAt: number | null;
}

export interface ComparableStats {
  n: number;
  horizonMin: number;
  band: string;
  bullProb: number;
  baseProb: number;
  bearProb: number;
  meanReturn: number;
  medianReturn: number;
  maxUpQ50: number;
  maxUpQ70: number;
  maxUpQ90: number;
  drawdownQ70: number;
  firstAt: number;
  lastAt: number;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  stop: number;
  stopPct: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  invalidation: string[];
}

export interface VerificationResult {
  mint: string;
  symbol: string;
  name: string;
  status: VerifyStatus;
  checkedAt: number;
  passed: number;
  total: number;
  checks: VerifyCheck[];
  facts: VerifiedFact[];
  estimates: {
    comparables: ComparableStats | null;
    plan: TradePlan | null;
    note: string;
  };
  opportunityScore: number;
  riskScore: number;
  reason: string;
}

export interface VerificationSummary {
  status: VerifyStatus;
  passed: number;
  total: number;
  reason: string;
  checkedAt: number;
}

export interface EvidenceStats {
  samples: number;
  resolved: number;
  pending: number;
  required: number;
  horizonMin: number;
  firstAt: number | null;
  lastResolvedAt: number | null;
}
