import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only ever talks to same-origin /api/* — Vite forwards it to the API server in dev.
// No secrets are read or embedded here; they live in the server process environment.
const api = { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8787}`, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },
});
