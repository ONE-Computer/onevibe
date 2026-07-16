import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.ONEVIBE_API_PORT ?? '4311'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
