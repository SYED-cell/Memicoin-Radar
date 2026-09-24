import { EventEmitter } from 'node:events';
import { applyMarket, applyMetadata, applyMigration, applySecurity, applyTrade, compactToken, createToken, evaluate, tokenFromMarket } from '../../shared/tokenService.ts';
import type { ConnectionHealth, LaunchEvent, StreamState, Token } from '../../shared/types.ts';
import { all, run, tx } from '../db.ts';
import { config } from '../env.ts';
import { log } from '../lib/log.ts';
import { pruneCache, sourceHealth } from './httpClient.ts';
import { jupiterProvider } from './providers/jupiter.ts';
import { mockChain, mockMarketProvider, MockStream } from './providers/mock.ts';
import { PumpPortalStream } from './providers/pumpPortal.ts';
import { rpcHealthSources, solanaRpc } from './providers/solanaRpc.ts';
import type { ChainProvider, LaunchStream, MarketDataProvider } from './providers/types.ts';
import { scanSecurity } from './security.ts';

export interface MonitorEvents {
  /** Fired for every analysed state change (used by the alert engine). */
  transition: (prev: Token, next: Token) => void;
  launch: (token: Token) => void;
}

/**
 * Real-time pipeline:
 * PumpPortal WS (launches, migrations, optional trades) → Jupiter batched market data →
 * Solana RPC security scan → risk/opportunity engines → SQLite persistence → subscribers (SSE, alerts).
 */
class Monitor extends EventEmitter {
  readonly mode = config.dataMode;
  private tokens = new Map<string, Token>();
  private lastPolled = new Map<string, number>();
  private scanned = new Set<string>();
  private scanQueue: string[] = [];
  private pinned = new Set<string>();
  private changed = new Set<string>();
  private removed = new Set<string>();
  private solPrice = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private stream: LaunchStream;
  readonly market: MarketDataProvider;
  readonly chain: ChainProvider;
  private health: ConnectionHealth;

  constructor() {
    super();
    this.setMaxListeners(100);
    const live = this.mode === 'live';
    const url = `wss://pumpportal.fun/api/data${config.pumpPortalKey ? `?api-key=${encodeURIComponent(config.pumpPortalKey)}` : ''}`;
    this.stream = live ? new PumpPortalStream([url], Boolean(config.pumpPortalKey)) : new MockStream();
    this.market = live ? jupiterProvider : mockMarketProvider;
    this.chain = live ? solanaRpc : mockChain;
    this.health = {
      mode: live ? 'live' : 'mock',
      stream: 'connecting',
      streamUrl: live ? 'wss://pumpportal.fun/api/data' : 'demo://simulated-stream',
      tradeStream: live ? Boolean(config.pumpPortalKey) : true,
      reconnectAttempts: 0,
      lastEventAt: null,
      launchesDetected: 0,
      market: sourceHealth('market'),
      rpc: sourceHealth('rpc0'),
      rpcKind: config.dedicatedRpc ? 'dedicated' : 'public',
      fallbackReason: null,
    };
  }

  /* ─────────── lifecycle ─────────── */

  async start() {
    this.restore();
    await this.refreshSolPrice();
    this.stream.connect({
      onLaunch: (e) => this.onLaunch(e, true),
      onTrade: (e) => {
        const t = this.tokens.get(e.mint);
        if (!t) return;
        this.health.lastEventAt = Date.now();
        this.commit(t, evaluate(applyTrade(t, e, this.solPrice), t));
      },
      onMigration: (e) => {
        const t = this.tokens.get(e.mint);
        if (t) this.commit(t, evaluate(applyMigration(t, e), t));
      },
      onStatus: (state: StreamState, info) => {
        this.health.stream = state;
        this.health.reconnectAttempts = info.attempts;
        this.health.tradeStream = info.tradeStream;
        if (info.error) log.warn('stream', `${state}: ${info.error}`);
        else log.info('stream', `${state} (${info.url.replace(/api-key=[^&]+/, 'api-key=***')})`);
      },
    });
    void this.pollRecent(true);
    this.timers.push(
      setInterval(() => void this.pollMarket(), config.monitor.pollIntervalMs),
      setInterval(() => void this.refreshSolPrice(), 30_000),
      // Recent-launch polling: backfill + detection fallback when the stream is down.
      setInterval(() => void this.pollRecent(false), 15_000),
      setInterval(() => void this.processScans(), 2_000),
      setInterval(() => this.updateTradeSubscriptions(), 10_000),
      setInterval(() => this.persist(), 15_000),
      setInterval(() => {
        this.evict();
        pruneCache();
      }, 60_000),
    );
    log.info('monitor', `started in ${this.mode.toUpperCase()} mode (${this.tokens.size} tokens restored)`);
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.stream.disconnect();
    this.persist();
  }

  /* ─────────── events ─────────── */

  private onLaunch(e: LaunchEvent, fresh: boolean) {
    if (this.tokens.has(e.mint)) return;
    const token = createToken(e, this.health.mode, this.solPrice);
    if (!fresh) token.detectedAt = Math.min(token.detectedAt, token.createdAt + 60_000);
    this.tokens.set(token.id, token);
    this.changed.add(token.id);
    if (fresh) {
      this.health.launchesDetected++;
      this.health.lastEventAt = Date.now();
    }
    if (token.creator) {
      run('INSERT OR IGNORE INTO creator_launches (creator, mint, symbol, t) VALUES (?, ?, ?, ?)', token.creator, token.mint, token.symbol, token.createdAt);
    }
    this.emit('launch', token);
  }

  private commit(prev: Token, next: Token) {
    this.tokens.set(next.id, next);
    this.changed.add(next.id);
    this.emit('transition', prev, next);
  }

  /* ─────────── polling ─────────── */

  private async refreshSolPrice() {
    try {
      this.solPrice = await this.market.fetchSolPrice();
    } catch (err) {
      if (!this.solPrice) this.solPrice = 150;
      log.warn('market', 'SOL price unavailable', err);
    }
  }

  private async pollRecent(initial: boolean) {
    // While the stream is healthy, the recent endpoint still catches launches from other launchpads.
    if (!initial && this.health.stream === 'open' && Math.random() < 0.5) return;
    try {
      const recent = await this.market.fetchRecent();
      const fresh = !initial && this.health.stream !== 'open';
      for (const e of recent) this.onLaunch(e, fresh);
      if (fresh && recent.length) this.health.fallbackReason = 'Stream offline — detecting launches by polling';
      else if (this.health.stream === 'open') this.health.fallbackReason = null;
    } catch (err) {
      log.warn('market', 'recent tokens poll failed', err);
    }
  }

  private isActive(t: Token, now: number) {
    return this.pinned.has(t.id) || now - t.createdAt < config.monitor.activeWindowMs || t.marketCap >= config.monitor.tractionMcapUsd;
  }

  private pickBatch(now: number): string[] {
    const candidates = [...this.pinned].filter((m) => !this.tokens.has(m));
    const scored = [...this.tokens.values()]
      .filter((t) => this.isActive(t, now))
      .map((t) => {
        const last = this.lastPolled.get(t.id) ?? 0;
        const urgency = (now - last) / 1000 + (this.pinned.has(t.id) ? 30 : 0) + (t.marketUpdatedAt ? 0 : 20);
        return { id: t.id, urgency };
      })
      .sort((a, b) => b.urgency - a.urgency);
    return [...candidates, ...scored.map((s) => s.id)].slice(0, config.monitor.batchSize);
  }

  private async pollMarket() {
    const now = Date.now();
    const batch = this.pickBatch(now);
    if (!batch.length) return;
    batch.forEach((m) => this.lastPolled.set(m, now));
    try {
      const data = await this.market.fetchTokens(batch);
      for (const m of data) {
        const prev = this.tokens.get(m.mint);
        if (!prev) {
          const t = tokenFromMarket(m, this.health.mode);
          this.tokens.set(t.id, t);
          this.changed.add(t.id);
          continue;
        }
        const next = evaluate(applyMarket(prev, m, Date.now()), prev);
        this.commit(prev, next);
        if (!this.scanned.has(next.id) && !this.scanQueue.includes(next.id)) this.scanQueue.push(next.id);
      }
      this.health.fallbackReason = this.health.stream === 'open' ? null : this.health.fallbackReason;
    } catch (err) {
      log.warn('market', `batch poll failed (${batch.length} tokens)`, err);
    }
  }

  /** Security scans (mint/freeze authority, extensions, metadata) — rate-limited per minute. */
  private async processScans() {
    const perTick = Math.max(1, Math.round(config.monitor.securityScanPerMinute / 30));
    // Pinned tokens jump the queue.
    this.scanQueue.sort((a, b) => Number(this.pinned.has(b)) - Number(this.pinned.has(a)));
    for (const id of this.scanQueue.splice(0, perTick)) {
      const t = this.tokens.get(id);
      if (!t) continue;
      this.scanned.add(id);
      try {
        const r = await scanSecurity(this.chain, t);
        const current = this.tokens.get(id) ?? t;
        const hasNames = Boolean(current.name && current.symbol && current.symbol !== '???');
        // Metadata is valid if it resolved on-chain/IPFS; invalid if a URI exists but does not resolve;
        // otherwise fall back to the indexer's name/symbol/icon, and 'unknown' if even that is missing.
        const metadataOk = r.intel.metadata ? Boolean(r.intel.metadata.name ?? current.name) : current.metadataUri ? false : current.image && hasNames ? true : null;
        let next = applySecurity(
          current,
          r.risk,
          r.notes,
          r.mintDisabled !== null && r.freezeDisabled !== null ? { mintDisabled: r.mintDisabled, freezeDisabled: r.freezeDisabled } : undefined,
          { onChainAt: r.intel.decimals !== null ? r.intel.fetchedAt : null, metadataOk },
        );
        next = applyMetadata(next, { description: r.description, image: r.image, socials: r.socials });
        this.commit(current, evaluate(next, current));
      } catch (err) {
        this.scanned.delete(id);
        log.warn('security', `scan failed for ${id}`, err);
      }
    }
  }

  private updateTradeSubscriptions() {
    const now = Date.now();
    const ids = [...this.tokens.values()]
      .filter((t) => this.pinned.has(t.id) || now - t.createdAt < 15 * 60_000)
      .sort((a, b) => Number(this.pinned.has(b.id)) - Number(this.pinned.has(a.id)) || b.createdAt - a.createdAt)
      .slice(0, 60)
      .map((t) => t.id);
    this.stream.setTradeSubscriptions(ids);
  }

  /* ─────────── storage ─────────── */

  private restore() {
    const rows = all<{ json: string }>('SELECT json FROM tokens ORDER BY detected_at DESC LIMIT ?', config.monitor.maxTokens);
    for (const r of rows) {
      try {
        const t = JSON.parse(r.json) as Token;
        // Fields added in later versions default to 'not yet checked'.
        t.onChainVerifiedAt ??= null;
        t.metadataOk ??= null;
        t.verify ??= null;
        if (t.source === this.health.mode) this.tokens.set(t.id, t);
      } catch {
        /* skip corrupt row */
      }
    }
  }

  private persist() {
    const now = Date.now();
    try {
      tx(() => {
        for (const t of this.tokens.values()) {
          if (now - t.updatedAt > 20_000 && !this.pinned.has(t.id)) continue;
          run(
            'INSERT INTO tokens (mint, json, detected_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(mint) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
            t.id,
            JSON.stringify(compactToken(t)),
            t.detectedAt,
            t.updatedAt,
          );
        }
        // Keep the table bounded to recent + pinned tokens.
        const keep = [...this.tokens.keys()];
        if (keep.length) run(`DELETE FROM tokens WHERE mint NOT IN (${keep.map(() => '?').join(',')}) AND updated_at < ?`, ...keep, now - 24 * 3600_000);
      });
    } catch (err) {
      log.error('monitor', 'persist failed', err);
    }
  }

  private evict() {
    if (this.tokens.size <= config.monitor.maxTokens) return;
    const now = Date.now();
    const victims = [...this.tokens.values()]
      .filter((t) => !this.pinned.has(t.id))
      .sort((a, b) => Number(this.isActive(a, now)) - Number(this.isActive(b, now)) || a.marketCap - b.marketCap || a.createdAt - b.createdAt)
      .slice(0, this.tokens.size - config.monitor.maxTokens);
    for (const t of victims) {
      this.tokens.delete(t.id);
      this.lastPolled.delete(t.id);
      this.scanned.delete(t.id);
      this.removed.add(t.id);
    }
  }

  /* ─────────── public API ─────────── */

  setPinned(mints: Set<string>) {
    const added = [...mints].filter((m) => !this.pinned.has(m));
    this.pinned = mints;
    if (added.length) void this.pollMarket();
  }

  /** Drains the set of changed/removed ids since the last call (used for SSE batching). */
  drainChanges(): { changed: Token[]; removed: string[] } {
    const changed = [...this.changed].map((id) => this.tokens.get(id)).filter((t): t is Token => !!t);
    const removed = [...this.removed];
    this.changed.clear();
    this.removed.clear();
    return { changed, removed };
  }

  list(): Token[] {
    return [...this.tokens.values()];
  }

  get(mint: string): Token | undefined {
    return this.tokens.get(mint);
  }

  /** Looks up a mint that is not currently tracked (e.g. pasted address) and starts tracking it. */
  async lookup(mint: string): Promise<Token | undefined> {
    const existing = this.tokens.get(mint);
    if (existing) return existing;
    const [m] = await this.market.fetchTokens([mint]);
    if (!m) return undefined;
    const t = tokenFromMarket(m, this.health.mode);
    this.tokens.set(t.id, t);
    this.changed.add(t.id);
    this.scanQueue.unshift(t.id);
    return t;
  }

  /** Re-queues an on-chain security scan (used when verification needs fresh on-chain evidence). */
  requestRescan(mint: string) {
    if (this.scanQueue.includes(mint)) return;
    this.scanned.delete(mint);
    this.scanQueue.unshift(mint);
  }

  /** Commits an externally-computed update (e.g. verification summary) without re-running analysis. */
  patch(mint: string, fn: (t: Token) => Token) {
    const t = this.tokens.get(mint);
    if (!t) return;
    this.tokens.set(mint, fn(t));
    this.changed.add(mint);
  }

  creatorLaunches(creator: string) {
    return all<{ mint: string; symbol: string; t: number }>('SELECT mint, symbol, t FROM creator_launches WHERE creator = ? ORDER BY t DESC LIMIT 50', creator);
  }

  getHealth(): ConnectionHealth {
    const rpcSources = rpcHealthSources().map(sourceHealth);
    return {
      ...this.health,
      market: sourceHealth(this.health.mode === 'live' ? 'market' : 'market'),
      rpc: rpcSources.find((h) => h.ok) ?? rpcSources[0],
    };
  }

  get solUsd() {
    return this.solPrice;
  }
}

export const monitor = new Monitor();
