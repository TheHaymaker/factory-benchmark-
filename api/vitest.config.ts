import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/repositories/**', 'src/lib/**'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        'src/services/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
});
