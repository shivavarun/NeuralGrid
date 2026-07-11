import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      // Req 22.5: block deploy on <90% line coverage of the node scoring module.
      thresholds: {
        'src/scoring.ts': {
          lines: 90,
        },
      },
    },
  },
});
