import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(rootDir, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
