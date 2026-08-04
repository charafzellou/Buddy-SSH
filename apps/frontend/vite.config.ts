import { URL, fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@buddy-ssh/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy WebSocket + HTTP to the Go backend during dev (ADR-0009).
      '/ws': {
        target: 'ws://localhost:8443',
        ws: true,
      },
      '/healthz': {
        target: 'http://localhost:8443',
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
