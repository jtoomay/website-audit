import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, /api/* goes to the local Node scanner so there are no CORS issues.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true, timeout: 180_000, proxyTimeout: 180_000 },
    },
  },
});
