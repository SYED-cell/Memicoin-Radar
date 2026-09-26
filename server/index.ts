import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { config } from './env.ts';
import { startMaintenance } from './maintenance.ts';
import { db, run } from './db.ts';
import { applyCors, clientIp, HttpError, parseCookies, readJson, securityHeaders, sendJson, type Ctx } from './lib/http.ts';
import { log } from './lib/log.ts';
import { monitor } from './pipeline/monitor.ts';
import { router } from './routes.ts';
import { startAlerts, stopAlerts } from './services/alerts.ts';
import { startSse, stopSse } from './services/sse.ts';
import { startTelegram, stopTelegram } from './services/telegram.ts';
import { startTrading, stopTrading } from './services/trading.ts';
import { startVerification, stopVerification } from './services/verification.ts';
import { refreshPinned } from './services/userData.ts';

const DIST = resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(pathname: string, res: import('node:http').ServerResponse): boolean {
  if (!existsSync(DIST)) return false;
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // SPA fallback
  if (!existsSync(file)) return false;
  res.statusCode = 200;
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  res.setHeader('cache-control', file.includes(`${DIST}\\assets`) || file.includes(`${DIST}/assets`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(file).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
      throw new HttpError(404, 'Not found', 'not_found');
    }
    if (!applyCors(req, res)) throw new HttpError(403, 'Cross-origin request blocked', 'forbidden');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    const match = router.match(req.method ?? 'GET', url.pathname);
    if (!match) throw new HttpError(404, 'Not found', 'not_found');
    let bodyCache: Promise<unknown> | null = null;
    const ctx: Ctx = {
      req,
      res,
      url,
      params: match.params,
      ip: clientIp(req),
      cookies: parseCookies(req.headers.cookie),
      body: () => (bodyCache ??= readJson(req)),
    };
    let result: unknown;
    for (const h of match.route.handlers) result = await h(ctx);
    if (!res.headersSent && result !== undefined) sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message, code: err.code, fields: err.details });
    } else {
      log.error('http', `${req.method} ${url.pathname} failed`, err);
      sendJson(res, 500, { error: 'Internal server error', code: 'internal' });
    }
  }
});

server.requestTimeout = 60_000;
server.headersTimeout = 30_000;

async function main() {
  if (config.ephemeralSecrets) log.warn('config', 'JWT_SECRET / ENCRYPTION_KEY not set — using ephemeral dev secrets (sessions reset on restart).');
  if (!config.dedicatedRpc) log.warn('config', 'SOLANA_RPC_URL not set — using public RPC (holder lists may be rate limited).');
  if (!config.pumpPortalKey) log.info('config', 'PUMPPORTAL_API_KEY not set — launch & migration stream only (no per-trade stream).');
  if (!config.resendApiKey) log.warn('config', 'RESEND_API_KEY not set — verification/reset links are printed to this console (dev only).');
  await monitor.start();
  startSse();
  startAlerts();
  startTrading();
  startVerification();
  refreshPinned();
  stopMaintenance = startMaintenance((sql, ...p) => run(sql, ...p), (msg) => log.warn('db', msg));
  await startTelegram();
  server.listen(config.port, config.host, () => log.info('server', `API listening on http://${config.host}:${config.port} (${config.isProd ? 'production' : 'development'})`));
}

let stopMaintenance: (() => void) | null = null;

function shutdown(signal: string) {
  log.info('server', `${signal} received — shutting down`);
  stopSse();
  stopAlerts();
  stopTrading();
  stopVerification();
  stopTelegram();
  stopMaintenance?.();
  monitor.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => log.error('process', 'unhandled rejection', err));

void main();
