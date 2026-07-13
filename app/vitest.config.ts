import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(import.meta.dirname, 'src/renderer'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@built-in': resolve(import.meta.dirname, 'src/built-in'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
