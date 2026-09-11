import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Deduplicate Strudel packages to prevent multiple instances
    dedupe: [
      '@strudel/core',
      '@strudel/mini',
      '@strudel/tonal',
      '@strudel/webaudio',
      '@strudel/draw',
      '@strudel/transpiler',
    ],
  },
  optimizeDeps: {
    // Pre-bundle Strudel packages
    include: [
      '@strudel/codemirror',
    ],
  },
})
