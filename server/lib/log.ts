/** Structured, secret-free logging. */
type Level = 'info' | 'warn' | 'error';

function write(level: Level, scope: string, msg: string, extra?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) out(line, extra instanceof Error ? extra.message : extra);
  else out(line);
}

export const log = {
  info: (scope: string, msg: string, extra?: unknown) => write('info', scope, msg, extra),
  warn: (scope: string, msg: string, extra?: unknown) => write('warn', scope, msg, extra),
  error: (scope: string, msg: string, extra?: unknown) => write('error', scope, msg, extra),
};
