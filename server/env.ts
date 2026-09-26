/**
 * Server configuration. All secrets come from environment variables (or .env / .env.local in
 * development) and never leave the server process.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ignore malformed env file */
    }
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function secret(name: string, bytes = 32): Buffer {
  const v = env[name];
  if (v) {
    const buf = /^[0-9a-f]+$/i.test(v) && v.length >= 64 ? Buffer.from(v, 'hex') : Buffer.from(v, 'utf8');
    if (buf.length < 32) throw new Error(`${name} must be at least 32 bytes`);
    return buf;
  }
  if (isProd) throw new Error(`${name} is required in production`);
  // Development only: ephemeral secret (sessions reset on restart). A warning is printed at startup.
  return randomBytes(bytes);
}

const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export const config = {
  isProd,
  port: Number(env.API_PORT ?? env.PORT ?? 8787),
  // Containers (Railway, Render, Fly, Docker) must bind every interface; locally stay on loopback.
  host: env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: list(env.CORS_ORIGINS).length ? list(env.CORS_ORIGINS) : [env.APP_URL ?? 'http://localhost:5173', 'http://localhost:4173'],
  dbPath: env.DATABASE_PATH ?? 'data/radar.db',

  jwtSecret: secret('JWT_SECRET'),
  encryptionKey: secret('ENCRYPTION_KEY'),
  ephemeralSecrets: !env.JWT_SECRET || !env.ENCRYPTION_KEY,
  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 3600,
  requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION !== 'false',

  dataMode: (env.DATA_MODE === 'mock' ? 'mock' : 'live') as 'live' | 'mock',
  rpcUrls: [...list(env.SOLANA_RPC_URL), ...list(env.SOLANA_RPC_FALLBACK_URLS), 'https://api.mainnet-beta.solana.com'].filter(
    (v, i, a) => a.indexOf(v) === i,
  ),
  dedicatedRpc: Boolean(env.SOLANA_RPC_URL),
  pumpPortalKey: env.PUMPPORTAL_API_KEY ?? '',
  jupiterApi: (env.JUPITER_API ?? 'https://lite-api.jup.ag').replace(/\/$/, ''),
  ipfsGateway: env.IPFS_GATEWAY ?? 'https://4everland.io/ipfs/',

  telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? '',

  resendApiKey: env.RESEND_API_KEY ?? '',
  mailFrom: env.MAIL_FROM ?? 'MemeCoin Radar <onboarding@resend.dev>',

  monitor: {
    pollIntervalMs: 3500,
    batchSize: 20,
    maxTokens: 300,
    activeWindowMs: 20 * 60_000,
    tractionMcapUsd: 12_000,
    securityScanPerMinute: 30,
    // On-chain pricing: one getMultipleAccounts call per tick (100 accounts max per Solana RPC).
    curveIntervalMs: 6000,
    curveBatchSize: 100,
  },
};

export type ServerConfig = typeof config;
