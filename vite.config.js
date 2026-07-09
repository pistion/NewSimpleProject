import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend is served by Express on one port (see server/src/server.js).
// Leave VITE_API_BASE_URL empty so the browser calls same-origin /api/*
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
  },
})
