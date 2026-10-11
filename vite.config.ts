import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative assets work on GitHub Pages root sites AND /repository/ URLs.
// Set VITE_BASE_PATH explicitly only when your deployment requires an absolute path.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    base: env.VITE_BASE_PATH || './',
  };
});
