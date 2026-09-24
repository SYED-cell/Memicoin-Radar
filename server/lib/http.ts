import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../env.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;
  constructor(status: number, message: string, code = 'error', details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  ip: string;
  cookies: Record<string, string>;
  userId?: string;
  body: () => Promise<unknown>;
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handlers: Handler[];
}

export class Router {
  private routes: Route[] = [];
  add(method: Method, path: string, ...handlers: Handler[]) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\/:([a-zA-Z]+)/g, (_, k: string) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, pattern, keys, handlers });
  }
  get = (p: string, ...h: Handler[]) => this.add('GET', p, ...h);
  post = (p: string, ...h: Handler[]) => this.add('POST', p, ...h);
  put = (p: string, ...h: Handler[]) => this.add('PUT', p, ...h);
  patch = (p: string, ...h: Handler[]) => this.add('PATCH', p, ...h);
  delete = (p: string, ...h: Handler[]) => this.add('DELETE', p, ...h);

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = pathname.match(r.pattern);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    if (pathMatched) throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
    return null;
  }
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

export function setCookie(res: ServerResponse, name: string, value: string, opts: { maxAge: number; path?: string }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? '/'}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (config.isProd) parts.push('Secure');
  const existing = res.getHeader('set-cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader('set-cookie', [...list, parts.join('; ')]);
}

export function clearCookie(res: ServerResponse, name: string, path = '/') {
  setCookie(res, name, '', { maxAge: 0, path });
}

export function readJson(req: IncomingMessage, limit = 32_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] ?? '';
    if (!type.includes('application/json')) {
      reject(new HttpError(415, 'Expected application/json', 'unsupported_media_type'));
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large', 'payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new HttpError(400, 'Malformed JSON', 'bad_json'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function clientIp(req: IncomingMessage): string {
  // Only trust X-Forwarded-For when explicitly running behind a proxy.
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  if (config.isProd) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

/** CORS allowlist + CSRF defence: state-changing requests must come from an allowed origin. */
export function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,x-requested-with');
  }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const sameOrigin = !origin || config.corsOrigins.includes(origin) || origin === `http://${req.headers.host}`;
    const hasHeader = req.headers['x-requested-with'] === 'radar';
    if (!sameOrigin || !hasHeader) return false;
  }
  return true;
}
