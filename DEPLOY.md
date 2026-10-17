# Deploying MemicoinRadar

The app is one container: it serves the UI, runs the API, holds the live pump.fun monitor open,
and runs the alert, trading and Telegram workers. That shape rules out serverless hosts — Vercel,
Netlify, Cloudflare Workers and friends cannot keep a WebSocket open between requests, which is
the whole product.

What it needs:

| Requirement | Why |
|---|---|
| A long-running process | The monitor holds a WebSocket to pump.fun and polls bonding curves every second |
| Docker | The server runs on Node 26's native TypeScript, which the Dockerfile pins |
| A writable path | `node:sqlite`, at `DATABASE_PATH` |
| Outbound HTTPS + WSS | pump.fun, Jupiter, Solana RPC, Telegram, TronGrid |

No inbound ports beyond the one web port, and no managed database — the whole state is one SQLite
file.

---

## Option A — Render (no card, but it sleeps)

`render.yaml` in this repo is a complete blueprint. The service is named **memicoinradar**, so the
URL is `https://memicoinradar.onrender.com`.

1. Push this repo to GitHub (already at `SYED-cell/Memicoin-Radar`).
2. [render.com](https://render.com) → **New** → **Blueprint** → connect GitHub → pick the repo.
3. Render reads `render.yaml`, builds the Dockerfile and deploys. First build takes ~5 minutes.
4. Add the secrets below under **Environment**, then **Manual Deploy → Clear build cache & deploy**.

**The catch:** free web services spin down after ~15 minutes without traffic and take 30–60s to
wake. While it sleeps nothing is monitored and no Telegram alerts go out. There is also no
persistent disk on free, so every deploy or restart empties the database — accounts, watchlists,
paper trades and payment records all go.

That makes free Render a **shareable demo**, not a radar. $7/month removes the sleep; a disk
mounted at `/data` (then `DATABASE_PATH=/data/radar.db`) keeps the data.

## Option B — Northflank (always on, card verification at signup)

Northflank's free Sandbox tier does not sleep, which is what this app actually wants. There is no
blueprint file here because the setup is a short form:

1. [northflank.com](https://northflank.com) → new project → **Service** → **Build from Git**.
2. Point it at the repo, build type **Dockerfile**, path `./Dockerfile`.
3. Port **8787**, protocol HTTP, public.
4. Name the service **memicoinradar**.
5. Add the environment variables below.
6. For data that survives restarts, attach a volume at `/data` and set `DATABASE_PATH=/data/radar.db`.

Signup asks for a card to verify you are a person. It is not charged on the free tier.

## Option C — any VPS you already pay for

The Dockerfile runs anywhere Docker does:

```bash
docker build -t memicoinradar . && docker run -d --name memicoinradar \
  -p 80:8787 -v /srv/radar:/data \
  -e NODE_ENV=production -e DATABASE_PATH=/data/radar.db \
  -e APP_URL=https://your-domain \
  -e JWT_SECRET="$(openssl rand -hex 32)" -e ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  memicoinradar
```

This is the only option that is always on, keeps its data, and costs a known amount.

---

## Environment variables

Required in production — the server refuses to start without them:

| Variable | Notes |
|---|---|
| `JWT_SECRET` | 32+ random bytes. Changing it signs everyone out. |
| `ENCRYPTION_KEY` | 32+ random bytes. Changing it orphans stored Telegram links. |

Worth setting:

| Variable | Why |
|---|---|
| `APP_URL` | The public URL. Used in verification/reset emails and Telegram links. |
| `DATABASE_PATH` | Point at a mounted volume, or lose the data on restart. |
| `PRO_EMAILS` | Your own email, so Pro features are visible without paying your own wallet. |
| `TELEGRAM_BOT_TOKEN` | Buy signals. Without it the Telegram page says the bot is unconfigured. |
| `SOLANA_RPC_URL` | A dedicated RPC. Without one, holder and creator checks stay `INSUFFICIENT DATA`. |
| `USDT_TRC20_ADDRESS` | Pro payments. Without it the Pro page shows "payments not configured". |
| `TRONGRID_API_KEY` | Confirms those payments on chain. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` unless `RESEND_API_KEY` is set, or signup throws. |

`.env.example` documents the rest.

## After deploying

1. Open `/api/health` — it should return `{"ok":true,...}` with a token count above zero within a
   minute or two.
2. Sign up, then check the dashboard fills with coins.
3. If market caps look wrong, the monitor could not reach pump.fun; check the logs for
   `Degraded` or `Polling fallback`.
