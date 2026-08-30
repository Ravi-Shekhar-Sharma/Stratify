import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Was src/engine only; broadened for src/trustMetrics.ts's derived
    // numbers (e.g. sensorLift) — a judge-visible calculation living
    // outside src/engine (it reads a UI-facing artifact, not simulation
    // state), which still needs the same test-first discipline.
    include: ['src/**/*.test.ts'],
  },
});
