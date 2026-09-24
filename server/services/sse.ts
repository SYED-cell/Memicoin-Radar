import type { ServerResponse } from 'node:http';
import type { Alert, Token } from '../../shared/types.ts';
import { compactToken } from '../../shared/tokenService.ts';
import { monitor } from '../pipeline/monitor.ts';

/**
 * Server-Sent Events hub. Token updates are batched once per second and broadcast to every
 * connected client; alerts and portfolio changes are delivered only to their owner.
 */
interface Client {
  userId: string;
  res: ServerResponse;
}

const clients = new Set<Client>();

/** Summary payload for list views (charts on the detail page fetch full history via REST). */
export function summarize(t: Token): Token {
  const c = compactToken(t);
  return { ...c, history: c.history.slice(-60), trades: [], scoreHistory: c.scoreHistory.slice(-30) };
}

function write(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function addClient(userId: string, res: ServerResponse) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client: Client = { userId, res };
  clients.add(client);
  write(res, 'snapshot', { tokens: monitor.list().map(summarize), health: monitor.getHealth(), solPrice: monitor.solUsd, t: Date.now() });
  res.on('close', () => clients.delete(client));
}

export function sendToUser(userId: string, event: 'alert' | 'portfolio' | 'telegram', data: unknown) {
  for (const c of clients) if (c.userId === userId) write(c.res, event, data);
}

export function pushAlerts(userId: string, alerts: Alert[]) {
  if (alerts.length) sendToUser(userId, 'alert', alerts);
}

export function connectedUsers(): Set<string> {
  return new Set([...clients].map((c) => c.userId));
}

let timers: ReturnType<typeof setInterval>[] = [];

export function startSse() {
  timers = [
    setInterval(() => {
      const { changed, removed } = monitor.drainChanges();
      if (!clients.size || (!changed.length && !removed.length)) return;
      const payload = { tokens: changed.map(summarize), removed, health: monitor.getHealth(), solPrice: monitor.solUsd, t: Date.now() };
      for (const c of clients) write(c.res, 'update', payload);
    }, 1000),
    // Heartbeat keeps proxies from closing idle connections and carries connection health.
    setInterval(() => {
      const health = monitor.getHealth();
      for (const c of clients) write(c.res, 'health', { health, t: Date.now() });
    }, 15_000),
  ];
}

export function stopSse() {
  timers.forEach(clearInterval);
  for (const c of clients) c.res.end();
  clients.clear();
}
