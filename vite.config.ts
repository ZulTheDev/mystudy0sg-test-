import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages paths stay relative. Tailscale Serve forwards to localhost.
const TAILSCALE_HOST = 'system32.tail39684d.ts.net';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    base: env.VITE_BASE_PATH || './',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      allowedHosts: [TAILSCALE_HOST],
    },
    preview: {
      host: '127.0.0.1',
      allowedHosts: [TAILSCALE_HOST],
    },
  };
});
