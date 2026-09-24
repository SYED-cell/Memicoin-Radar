/** Runs the API server (with --watch) and the Vite dev server together. */
import { spawn } from 'node:child_process';

const env = { ...process.env, API_PORT: process.env.API_PORT ?? '8787' };
const procs = [
  spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit', env }),
  spawn('npx vite', { stdio: 'inherit', shell: true, env }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && console.error(`[dev] process exited with code ${code}`)));
