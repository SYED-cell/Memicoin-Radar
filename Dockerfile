# MemeCoin Radar — one container that serves the UI and runs the API, the live monitor,
# the alert/trading workers and the Telegram bot.

# ── Build stage: type-check and bundle the React app ────────────────────────
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────────
# The server imports nothing outside Node's built-ins, so no node_modules are shipped.
FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./

# Writable location for the SQLite database. Runs as root so a volume mounted
# at /data by the platform stays writable.
RUN mkdir -p /data

EXPOSE 8787
CMD ["node", "server/index.ts"]
