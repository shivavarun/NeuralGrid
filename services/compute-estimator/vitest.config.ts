import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      // Req 22.5: block deploy on <90% line coverage of the estimation module.
      // Per-file threshold keeps the gate scoped to the core calculation module
      // without failing on unrelated glue code.
      thresholds: {
        'src/estimator.ts': {
          lines: 90,
        },
      },
    },
  },
});
