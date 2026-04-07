import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Proxy สำหรับ dev mode (npm run dev)
  server: {
    proxy: {
      '/api': 'http://localhost:5050',
      '/auth': 'http://localhost:5050',
      '/uploads': 'http://localhost:5050',
      '/webhook': 'http://localhost:5050',
      '/liff': 'http://localhost:5050',
    },
  },
})
