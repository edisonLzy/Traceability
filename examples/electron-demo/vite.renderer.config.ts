import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  // Relative base so the built index.html loads its assets via file:// when
  // Electron loadFile() opens it (an absolute '/assets/...' href resolves to
  // the filesystem root under file:// and the bundle never loads).
  base: './',
  root: './renderer',
  resolve: {
    alias: {
      '@traceability/core': resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: false,
  },
})
