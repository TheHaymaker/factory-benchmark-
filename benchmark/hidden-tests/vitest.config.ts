import { defineConfig } from 'vitest/config';

// Vitest overwrites process.env.BASE_URL with Vite's base path ('/'), so pass the
// target URL through under another name.
const target = process.env.BASE_URL ?? 'http://localhost:3100';

// All files share one running server, so run them one at a time.
export default defineConfig({
  test: {
    env: { HIDDEN_TARGET_URL: target },
    include: ['http/**/*.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 15_000,
    reporters: ['default', ['json', { outputFile: 'results/http.json' }]],
  },
});
