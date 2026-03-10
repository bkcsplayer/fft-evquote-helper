import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep a single `.env` at repo root (see `.env.example`).
  // Vite only exposes variables prefixed with `VITE_` to the client.
  envDir: '..',
  server: {
    port: 7230,
    proxy: {
      '/api': {
        target: 'http://localhost:7222',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:7222',
        changeOrigin: true,
      },
    },
  },
})
