import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  return {
    // Serve admin at /admin on the same domain as customer site.
    // This prevents asset path conflicts when customer app is at /.
    base: isProd ? '/admin/' : '/',
    plugins: [react()],
    server: {
      port: 7231,
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
  }
})
