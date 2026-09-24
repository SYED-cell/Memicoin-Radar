import { HttpError, type Ctx } from './http.ts';

interface Bucket {
  tokens: number;
  updated: number;
}

/** In-memory token-bucket limiter keyed by IP (and user when authenticated). */
export function rateLimit(name: string, capacity: number, refillPerMinute: number) {
  const buckets = new Map<string, Bucket>();
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of buckets) if (b.updated < cutoff) buckets.delete(k);
  }, 60_000).unref();

  return (ctx: Ctx) => {
    const key = `${name}:${ctx.userId ?? ctx.ip}`;
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: capacity, updated: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 60_000) * refillPerMinute);
    b.updated = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      const retry = Math.ceil(((1 - b.tokens) / refillPerMinute) * 60);
      ctx.res.setHeader('retry-after', String(retry));
      throw new HttpError(429, `Too many requests — try again in ${retry}s`, 'rate_limited');
    }
    b.tokens -= 1;
    buckets.set(key, b);
  };
}
