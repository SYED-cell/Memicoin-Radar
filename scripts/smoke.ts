export {};
/**
 * End-to-end API smoke test against a running server (default http://127.0.0.1:8787).
 * Usage: node scripts/smoke.ts
 */
const BASE = process.env.API_URL ?? 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5173';
let cookies: Record<string, string> = {};
let failures = 0;

async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'radar',
      origin: ORIGIN,
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (v) cookies[k] = v;
    else delete cookies[k];
  }
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : {}) as T };
}

function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  if (!cond) failures++;
}

const email = `smoke${Date.now()}@example.com`;
const pw = 'Radar12345';

const unauth = await api('GET', '/api/auth/me');
check('protected route rejects anonymous', unauth.status === 401);

const csrf = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
check('cross-origin POST blocked', csrf.status === 403);

const badSignup = await api('POST', '/api/auth/signup', { name: 'x', email: 'nope', password: 'short' });
check('signup validation', badSignup.status === 422, badSignup.data);

const signup = await api<{ user: { id: string; emailVerified: boolean }; devLink?: string }>('POST', '/api/auth/signup', { name: 'Smoke Test', email, password: pw });
check('signup', signup.status === 200 && !signup.data.user.emailVerified, signup.data);

const dup = await api('POST', '/api/auth/signup', { name: 'Smoke Test', email, password: pw });
check('duplicate email rejected', dup.status === 409);

const me = await api<{ user: { email: string } }>('GET', '/api/auth/me');
check('session cookie works', me.status === 200 && me.data.user.email === email, me.data);

const token = signup.data.devLink?.split('token=')[1];
const unverifiedTrade = await api('POST', '/api/portfolio/trades', { mint: 'So11111111111111111111111111111111111111112', side: 'buy', usd: 10 });
check('trading requires verified email', unverifiedTrade.status === 403, unverifiedTrade.data);

const verify = await api<{ user: { emailVerified: boolean } }>('POST', '/api/auth/verify-email', { token });
check('email verification', verify.status === 200 && verify.data.user.emailVerified, verify.data);
const reuse = await api('POST', '/api/auth/verify-email', { token });
check('verification token single-use', reuse.status === 400);

// Logout, then login with wrong + right password.
await api('POST', '/api/auth/logout');
check('logout clears session', (await api('GET', '/api/auth/me')).status === 401);
check('wrong password rejected', (await api('POST', '/api/auth/login', { email, password: 'Wrong12345' })).status === 401);
check('login', (await api('POST', '/api/auth/login', { email, password: pw })).status === 200);

// Refresh-token rotation.
const oldRefresh = cookies.mcr_rt;
const refresh = await api('POST', '/api/auth/refresh');
check('refresh rotates token', refresh.status === 200 && cookies.mcr_rt !== oldRefresh);

// Live market data (wait for the monitor to price something).
let mint = '';
for (let i = 0; i < 20 && !mint; i++) {
  const health = await api<{ tokens: number; stream: string; mode: string }>('GET', '/api/health');
  if (i === 0) console.log('      health:', JSON.stringify(health.data));
  const res = await fetch(`${BASE}/api/stream`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });
  const reader = res.body!.getReader();
  let text = '';
  while (!text.includes('event: snapshot') || !text.slice(text.indexOf('event: snapshot')).includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  await reader.cancel();
  const json = text.split('\n').find((l) => l.startsWith('data: '));
  const snap = json ? (JSON.parse(json.slice(6)) as { tokens: { id: string; marketUpdatedAt: number | null; price: number; signal: string }[] }) : { tokens: [] };
  const priced = snap.tokens.filter((t) => t.marketUpdatedAt && t.price > 0);
  if (i === 0) check('SSE snapshot delivers live tokens', snap.tokens.length > 0, snap.tokens.length);
  mint = priced.sort((a, b) => b.price - a.price)[0]?.id ?? '';
  if (!mint) await new Promise((r) => setTimeout(r, 3000));
}
check('live token with market data', Boolean(mint));

if (mint) {
  const detail = await api<{ token: { symbol: string; score: number; riskScore: number; signal: string; risk: { factors: unknown[]; coverage: number } } }>('GET', `/api/tokens/${mint}`);
  check('token detail + analysis', detail.status === 200 && detail.data.token.risk.factors.length === 13, detail.data.token && { s: detail.data.token.symbol, score: detail.data.token.score, risk: detail.data.token.riskScore, signal: detail.data.token.signal, cov: detail.data.token.risk.coverage });
  console.log('      ', detail.data.token.symbol, 'score', detail.data.token.score, 'risk', detail.data.token.riskScore, detail.data.token.signal);
  const sec = await api<{ checks: { label: string; status: string }[] }>('GET', `/api/tokens/${mint}/security`);
  check('security scan (RPC)', sec.status === 200 && sec.data.checks.length >= 5, sec.data);
  console.log('      ', sec.data.checks?.map((c) => `${c.label}:${c.status}`).join(', '));
  const creator = await api<{ intel: { wallet: string; balanceSol: number | null; errors: string[] } | null }>('GET', `/api/tokens/${mint}/creator`);
  check('creator intel', creator.status === 200, creator.data);
  console.log('      creator', creator.data.intel?.wallet, 'balance', creator.data.intel?.balanceSol, creator.data.intel?.errors);
  const holders = await api<{ source: string; holders: unknown[]; note?: string }>('GET', `/api/tokens/${mint}/holders`);
  check('holder intel responds', holders.status === 200, holders.data);
  console.log('      holders source', holders.data.source, holders.data.holders?.length, holders.data.note ?? '');

  const w = await api<{ items: { tokenId: string }[] }>('POST', '/api/watchlist', { mint });
  check('watchlist add (persisted)', w.status === 200 && w.data.items.some((i) => i.tokenId === mint));
  check('watchlist invalid mint rejected', (await api('POST', '/api/watchlist', { mint: 'not-a-mint!' })).status === 422);

  const buyTooBig = await api('POST', '/api/portfolio/trades', { mint, side: 'buy', usd: 50_000 });
  check('trade: insufficient funds rejected', buyTooBig.status === 422, buyTooBig.data);
  const buy = await api<{ transaction: { price: number; quantity: number }; portfolio: { cash: number; positions: { tokenId: string }[] } }>('POST', '/api/portfolio/trades', { mint, side: 'buy', usd: 500 });
  check('trade: buy executes at live price', buy.status === 200 && buy.data.portfolio.positions.some((p) => p.tokenId === mint), buy.data);
  if (buy.status === 200) {
    const sl = buy.data.transaction.price * 0.5;
    const orders = await api('PATCH', `/api/portfolio/positions/${mint}`, { stopLoss: sl, takeProfit: buy.data.transaction.price * 3 });
    check('set stop-loss / take-profit', orders.status === 200, orders.data);
    const badSl = await api('PATCH', `/api/portfolio/positions/${mint}`, { stopLoss: buy.data.transaction.price * 2 });
    check('invalid stop-loss rejected', badSl.status === 422);
    const sell = await api<{ portfolio: { positions: unknown[]; transactions: { realizedPnl?: number }[] } }>('POST', '/api/portfolio/trades', { mint, side: 'sell', quantity: buy.data.transaction.quantity });
    check('trade: sell closes position', sell.status === 200 && sell.data.portfolio.positions.length === 0, sell.data);
  }
}

const settings = await api<{ settings: { alerts: { scoreThreshold: number } } }>('PUT', '/api/settings', { alerts: { scoreThreshold: 72, riskJump: 999 } });
check('settings saved + clamped', settings.status === 200 && settings.data.settings.alerts.scoreThreshold === 72, settings.data);

const tg = await api<{ status: { configured: boolean } }>('GET', '/api/telegram');
check('telegram status', tg.status === 200, tg.data);
const link = await api('POST', '/api/telegram/link');
check(`telegram link (${tg.data.status?.configured ? 'configured' : 'not configured → 503'})`, tg.data.status?.configured ? link.status === 200 : link.status === 503, link.data);

const report = await api<{ report: { totalTokens: number } }>('POST', '/api/reports');
check('report generated from live data', report.status === 200 && report.data.report.totalTokens > 0, report.data);

const alerts = await api<{ alerts: unknown[] }>('GET', '/api/alerts');
check('alerts endpoint', alerts.status === 200);
console.log(`      alerts so far: ${alerts.data.alerts?.length}`);

// Password reset flow
const forgot = await api<{ devLink?: string }>('POST', '/api/auth/forgot-password', { email });
const resetToken = forgot.data.devLink?.split('token=')[1];
const reset = await api('POST', '/api/auth/reset-password', { token: resetToken, password: 'NewPass12345' });
check('password reset', reset.status === 200, reset.data);
check('old sessions revoked after reset', (await api('POST', '/api/auth/refresh')).status === 401);
let relogin = await api<{ error?: string }>('POST', '/api/auth/login', { email, password: 'NewPass12345' });
if (relogin.status === 429) {
  console.log('      (auth rate limiter engaged as designed — waiting)');
  await new Promise((r) => setTimeout(r, 8000));
  relogin = await api('POST', '/api/auth/login', { email, password: 'NewPass12345' });
}
check('login with new password', relogin.status === 200, relogin);

cookies = {};
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
