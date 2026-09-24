# MemeCoin Radar

A real-time Solana meme-coin terminal. It watches new token launches as they happen, scores each one for opportunity and risk, and explains every score. Alerts are delivered in the app, as browser notifications, and through a Telegram bot. The Telegram bot only sends tokens that pass a strict 14-point check. The app also includes paper trading with virtual funds.

Scores, probabilities and targets are produced by a model from live data. **They are not predictions and not financial advice.**

## Run

```bash
npm install
npm run dev        # API on :8787 + web on http://localhost:5173
npm test           # checks the strict-filter logic
npm run test:api   # end-to-end API test (needs the server running)
npm run build      # type-check + production build
npm start          # production: one Node process serves the API and dist/
```

Node 24 or newer is required. The backend has **no runtime dependencies**. It uses Node's built-in SQLite, crypto, fetch and WebSocket.

Configuration lives in `.env.local`; see `.env.example`. All secrets are read by the server only and never reach the browser.

## Deploy

The app is one always-on Node process: it holds a WebSocket to the launch feed, streams updates to
browsers, runs the alert/trading workers and polls Telegram. It therefore needs a host that runs a
container continuously with a persistent disk — Railway, Render, Fly.io or any VPS. **Serverless
platforms (Vercel, Netlify Functions, Cloudflare Workers) cannot run it**: they have no long-lived
process and no writable disk, so live detection, sessions and Telegram alerts would all fail.

`Dockerfile` builds the UI and ships a runtime image with no npm dependencies (the server uses only
Node built-ins). `railway.json` sets the health check and restart policy.

**Railway:** New Project → Deploy from GitHub repo → add a Volume mounted at `/data` → set the
variables below → deploy → Settings → Networking → Generate Domain. Keep it at **one replica**: two
instances would open two launch streams and two Telegram pollers.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 96 random hex chars |
| `ENCRYPTION_KEY` | 96 random hex chars |
| `DATABASE_PATH` | `/data/radar.db` |
| `APP_URL` | the deployed URL, e.g. `https://your-app.up.railway.app` |
| `TELEGRAM_BOT_TOKEN` | bot token from @BotFather |
| `REQUIRE_EMAIL_VERIFICATION` | `false` unless `RESEND_API_KEY` is set |
| `SOLANA_RPC_URL` | optional dedicated RPC; without it holder lists are rate limited |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`PORT` is injected by the host and picked up automatically. After the first deploy, check
`https://your-app/api/health` — it reports the data mode, stream state and token count.

## Architecture

```
PumpPortal WebSocket ─┐                        ┌─ SSE ─► browser (live feed, alerts)
Jupiter (poll/batch) ─┼─► monitor ─► engines ─► SQLite
Solana RPC (failover)─┘   (server/pipeline)     └─ job queue ─► Telegram bot (verified only)
```

- `shared/`: code used by both server and browser:
  - opportunity engine and 13-signal risk engine
  - AI explanations
  - alert rules
  - **strict verification filter** (`verification.ts`)
- `server/`: the backend:
  - authentication: scrypt password hashing, JWT access tokens and rotating refresh sessions in httpOnly cookies, email verification and password reset
  - rate limiting, input validation, origin/CSRF checks
  - background workers and the Telegram bot
  - server-enforced paper trading with stop-loss / take-profit
- `src/`: the React interface (Vite, Tailwind v4, Recharts).

## Strict verified-coin filter

A token is sent to Telegram only when **all 14 checks pass**:

1. The on-chain mint account and market data are fresh.
2. The token's metadata is valid.
3. Liquidity is sufficient.
4. Liquidity is stable (no major pool withdrawal).
5. Volume and transaction activity are healthy.
6. Holder growth looks organic.
7. The top holders don't own too much of the supply.
8. The creator wallet's risk is below the threshold.
9. There is no mint, freeze or restrictive-extension warning.
10. There is no sign of wash trading or manipulation.
11. There is no abnormal insider dumping.
12. Momentum is positive.
13. There is enough evidence from comparable past setups.
14. The risk/reward ratio meets the minimum.

Each check records its evidence, the requirement, the data source and a timestamp.

**Status rules:**
- **AVOID**: any critical check failed.
- **INSUFFICIENT DATA**: any evidence is missing.
- **WATCH**: only non-critical checks failed.
- **TRADEABLE**: all 14 checks passed.

**Where the probabilities and targets come from:** the server records every setup that passes checks 1–12. After 60 minutes it stores what actually happened to that token. The bull/base/bear probabilities, entry zone, stop and TP1–TP3 levels are computed **only** from these recorded outcomes of similar setups, and 20 comparable outcomes are required.

Until that evidence exists, the filter reports INSUFFICIENT DATA and sends nothing. The thresholds are defined in `STRICT` in `shared/verification.ts`.
