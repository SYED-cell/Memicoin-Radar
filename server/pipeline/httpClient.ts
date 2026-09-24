import type { SourceHealth } from '../../shared/types.ts';

/**
 * Small HTTP client shared by all providers:
 *  - response cache with TTL + in-flight request de-duplication
 *  - per-source request spacing (client-side rate limiting)
 *  - retry with exponential backoff on 429 / 5xx, honouring Retry-After
 *  - per-source health tracking for the connection indicator
 */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface SourceState {
  minIntervalMs: number;
  nextSlot: number;
  health: SourceHealth;
  queue: Promise<void>;
}

const sources = new Map<string, SourceState>();
const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function registerSource(name: string, minIntervalMs: number) {
  if (!sources.has(name)) {
    sources.set(name, {
      minIntervalMs,
      nextSlot: 0,
      queue: Promise.resolve(),
      health: { ok: true, lastOk: null, lastError: null, rateLimitedUntil: null },
    });
  }
}

export function sourceHealth(name: string): SourceHealth {
  return sources.get(name)?.health ?? { ok: false, lastOk: null, lastError: 'not initialised', rateLimitedUntil: null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialises requests per source so they are spaced at least `minIntervalMs` apart. */
function acquire(state: SourceState): Promise<void> {
  const turn = state.queue.then(async () => {
    const now = Date.now();
    const limitedUntil = state.health.rateLimitedUntil ?? 0;
    const wait = Math.max(state.nextSlot - now, limitedUntil - now, 0);
    if (wait > 0) await sleep(wait);
    state.nextSlot = Date.now() + state.minIntervalMs;
  });
  state.queue = turn.catch(() => undefined);
  return turn;
}

export interface RequestOptions {
  source: string;
  init?: RequestInit;
  /** Cache TTL in ms (0 = no cache). */
  ttl?: number;
  cacheKey?: string;
  timeoutMs?: number;
  retries?: number;
}

export async function requestJson<T>(url: string, opts: RequestOptions): Promise<T> {
  const key = opts.cacheKey ?? `${opts.init?.method ?? 'GET'} ${url} ${typeof opts.init?.body === 'string' ? opts.init.body : ''}`;
  const ttl = opts.ttl ?? 0;
  if (ttl > 0) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const run = (async () => {
    const state = sources.get(opts.source);
    if (!state) throw new Error(`Unknown source ${opts.source}`);
    const retries = opts.retries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await acquire(state);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
      try {
        const res = await fetch(url, { ...opts.init, signal: ctrl.signal });
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** (attempt + 1));
          if (res.status === 429) state.health.rateLimitedUntil = Date.now() + backoff;
          throw new HttpError(res.status, res.status === 429 ? 'Rate limited' : `Upstream error ${res.status}`);
        }
        if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
        const text = await res.text();
        let data: T;
        try {
          data = JSON.parse(text) as T;
        } catch {
          throw new HttpError(res.status, 'Invalid JSON response');
        }
        state.health = { ok: true, lastOk: Date.now(), lastError: null, rateLimitedUntil: null };
        if (ttl > 0) cache.set(key, { expires: Date.now() + ttl, value: data });
        return data;
      } catch (err) {
        lastErr = err;
        const status = err instanceof HttpError ? err.status : 0;
        state.health = {
          ...state.health,
          ok: false,
          lastError: err instanceof Error ? (err.name === 'AbortError' ? 'Timeout' : err.message) : 'Network error',
        };
        // Only retry transient failures.
        const transient = status === 0 || status === 429 || status >= 500;
        if (!transient || attempt === retries) break;
        if (status !== 429) await sleep(400 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Request failed');
  })();

  if (ttl > 0) {
    inflight.set(key, run);
    run.finally(() => inflight.delete(key)).catch(() => undefined);
  }
  return run;
}

/** Evicts expired cache entries (called periodically by the market service). */
export function pruneCache() {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
}
