import { refreshSession } from './api';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface StreamHandlers {
  onEvent: (event: string, data: unknown) => void;
  onStatus: (status: StreamStatus, attempts: number) => void;
}

/**
 * EventSource wrapper with exponential-backoff reconnection. EventSource cannot report HTTP
 * status, so after a failure we refresh the session (the access cookie may have expired) before
 * reconnecting. Also reconnects immediately when the tab becomes visible or the network returns.
 */
export class LiveStream {
  private es: EventSource | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private handlers: StreamHandlers;
  private events: string[];

  constructor(handlers: StreamHandlers, events: string[]) {
    this.handlers = handlers;
    this.events = events;
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.es) this.connectNow();
  };
  private onOnline = () => this.connectNow();

  start() {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onOnline);
    this.open();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onOnline);
    this.es?.close();
    this.es = null;
  }

  connectNow() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.es?.close();
    this.es = null;
    this.open();
  }

  private open() {
    this.handlers.onStatus(this.attempts ? 'reconnecting' : 'connecting', this.attempts);
    const es = new EventSource('/api/stream', { withCredentials: true });
    this.es = es;
    es.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus('open', 0);
    };
    for (const name of this.events) {
      es.addEventListener(name, (ev) => {
        try {
          this.handlers.onEvent(name, JSON.parse((ev as MessageEvent<string>).data));
        } catch {
          /* ignore malformed frame */
        }
      });
    }
    es.onerror = () => {
      es.close();
      if (this.es === es) this.es = null;
      if (this.stopped) return;
      this.attempts++;
      this.handlers.onStatus(this.attempts > 4 ? 'offline' : 'reconnecting', this.attempts);
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts - 1, 5)) * (0.8 + Math.random() * 0.4);
      this.timer = setTimeout(async () => {
        await refreshSession();
        if (!this.stopped) this.open();
      }, delay);
    };
  }
}
