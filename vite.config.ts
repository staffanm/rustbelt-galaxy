import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
} as any);
