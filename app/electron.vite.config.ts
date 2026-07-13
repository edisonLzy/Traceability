import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(import.meta.dirname, 'src/renderer'),
        '@shared': resolve(import.meta.dirname, 'src/shared'),
      },
    },
  },
})
