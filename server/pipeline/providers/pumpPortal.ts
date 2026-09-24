import type { LaunchStream, StreamHandlers } from './types.ts';

interface PumpMessage {
  message?: string;
  txType?: 'create' | 'buy' | 'sell' | 'migrate' | string;
  signature?: string;
  mint?: string;
  traderPublicKey?: string;
  initialBuy?: number;
  solAmount?: number;
  tokenAmount?: number;
  bondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  name?: string;
  symbol?: string;
  uri?: string;
  pool?: string;
}

const MAX_BACKOFF = 30_000;
const WATCHDOG_MS = 45_000;
const PUMP_SUPPLY = 1_000_000_000;

/**
 * PumpPortal WebSocket client.
 * - New-launch + migration events are free; per-token trade events require an API key,
 *   which the server proxy appends (the browser never sees it).
 * - Automatic reconnection with exponential backoff + jitter, a silence watchdog,
 *   and resubscription of trade keys after reconnect.
 */
export class PumpPortalStream implements LaunchStream {
  private ws: WebSocket | null = null;
  private handlers: StreamHandlers | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private lastMessage = 0;
  private closedByUser = false;
  private everOpened = false;
  private urlIndex = 0;
  private tradeKeys = new Set<string>();
  private tradeStream: boolean;
  private urls: string[];

  constructor(urls: string[], tradeStream: boolean) {
    this.urls = urls;
    this.tradeStream = tradeStream;
  }

  private get url() {
    return this.urls[this.urlIndex] ?? this.urls[0];
  }

  connect(handlers: StreamHandlers) {
    this.handlers = handlers;
    this.closedByUser = false;
    this.open();
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMessage > WATCHDOG_MS) {
        // Launches arrive every few seconds; prolonged silence means a stale connection.
        this.ws.close(4000, 'watchdog');
      }
    }, 10_000);
  }

  disconnect() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.watchdog);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.handlers?.onStatus('offline', { attempts: this.attempts, url: this.url, tradeStream: this.tradeStream });
  }

  setTradeSubscriptions(mints: string[]) {
    if (!this.tradeStream) return;
    const next = new Set(mints);
    const add = mints.filter((m) => !this.tradeKeys.has(m));
    const remove = [...this.tradeKeys].filter((m) => !next.has(m));
    this.tradeKeys = next;
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (remove.length) this.send({ method: 'unsubscribeTokenTrade', keys: remove });
    if (add.length) this.send({ method: 'subscribeTokenTrade', keys: add });
  }

  private send(payload: unknown) {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch {
      /* socket closing — resubscribed on reconnect */
    }
  }

  private open() {
    const h = this.handlers;
    if (!h) return;
    h.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting', { attempts: this.attempts, url: this.url, tradeStream: this.tradeStream });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : 'Socket error');
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.everOpened = true;
      this.attempts = 0;
      this.lastMessage = Date.now();
      this.send({ method: 'subscribeNewToken' });
      this.send({ method: 'subscribeMigration' });
      if (this.tradeStream && this.tradeKeys.size) this.send({ method: 'subscribeTokenTrade', keys: [...this.tradeKeys] });
      h.onStatus('open', { attempts: 0, url: this.url, tradeStream: this.tradeStream });
    };

    ws.onmessage = (ev) => {
      this.lastMessage = Date.now();
      let msg: PumpMessage;
      try {
        msg = JSON.parse(String(ev.data)) as PumpMessage;
      } catch {
        return;
      }
      if (msg.message) {
        if (/api key/i.test(msg.message) && this.tradeStream) {
          // Server rejected trade subscriptions — degrade gracefully to launch-only mode.
          this.tradeStream = false;
          this.tradeKeys.clear();
          h.onStatus('open', { attempts: 0, url: this.url, tradeStream: false, error: msg.message });
        }
        return;
      }
      if (!msg.mint) return;
      const now = Date.now();
      if (msg.txType === 'create') {
        const vSol = msg.vSolInBondingCurve ?? 0;
        const vTok = msg.vTokensInBondingCurve ?? 0;
        h.onLaunch({
          mint: msg.mint,
          name: msg.name ?? 'Unknown',
          symbol: msg.symbol ?? '???',
          creator: msg.traderPublicKey,
          createdAt: now,
          uri: msg.uri,
          bondingCurve: msg.bondingCurveKey,
          initialBuyTokens: msg.initialBuy,
          initialBuySol: msg.solAmount,
          marketCapSol: msg.marketCapSol ?? (vTok > 0 ? (vSol / vTok) * PUMP_SUPPLY : undefined),
          pool: msg.pool,
          signature: msg.signature,
        });
      } else if (msg.txType === 'buy' || msg.txType === 'sell') {
        h.onTrade({
          mint: msg.mint,
          signature: msg.signature ?? `${msg.mint}-${now}`,
          side: msg.txType,
          trader: msg.traderPublicKey ?? 'unknown',
          solAmount: msg.solAmount ?? 0,
          tokenAmount: msg.tokenAmount ?? 0,
          marketCapSol: msg.marketCapSol ?? 0,
          t: now,
        });
      } else if (msg.txType === 'migrate' || msg.pool) {
        h.onMigration({ mint: msg.mint, pool: msg.pool, t: now });
      }
    };

    ws.onerror = () => {
      /* onclose follows and handles reconnection */
    };

    ws.onclose = (ev) => {
      this.ws = null;
      if (this.closedByUser) return;
      // If the proxied URL never worked, try the direct public endpoint (launches only).
      if (!this.everOpened && this.attempts >= 1 && this.urlIndex < this.urls.length - 1) {
        this.urlIndex++;
        this.tradeStream = false;
      }
      this.scheduleReconnect(ev.reason || `Closed (${ev.code})`);
    };
  }

  private scheduleReconnect(error: string) {
    this.attempts++;
    const delay = Math.min(MAX_BACKOFF, 1000 * 2 ** Math.min(this.attempts - 1, 5)) * (0.8 + Math.random() * 0.4);
    this.handlers?.onStatus(this.attempts > 4 ? 'offline' : 'reconnecting', {
      attempts: this.attempts,
      url: this.url,
      tradeStream: this.tradeStream,
      error,
    });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** Allows the market service to request an immediate reconnect (e.g. when the tab regains focus). */
  reconnectNow() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.reconnectTimer);
    this.open();
  }
}
