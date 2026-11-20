import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, el proxy imita el enrutamiento de Traefik hacia cada API.
const api = (puerto: number) => ({ target: `http://127.0.0.1:${puerto}`, changeOrigin: false });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Sin scripts inline: compatible con la CSP estricta (script-src 'self').
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1/auth': api(8081),
      '/api/v1/cuentas': api(8082),
      '/api/v1/transferencias': api(8083),
      '/api/v1/beneficiarios': api(8083),
    },
  },
});
