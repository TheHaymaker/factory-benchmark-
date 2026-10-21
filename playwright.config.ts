import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serves the built API + web app on one port with dev routes enabled.
  // Run `npm run build` first (`npm run e2e` does this for you).
  webServer: {
    command: 'node api/dist/index.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATABASE_PATH: path.join(os.tmpdir(), `clinic-e2e-${PORT}.db`),
      ENABLE_DEV_ROUTES: '1',
    },
  },
});
