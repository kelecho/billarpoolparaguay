import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: './tests',
  testMatch: 'remote.spec.ts',
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build:remote && node server.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/api/state`,
    reuseExistingServer: false,
    env: { DB_PATH: ':memory:', ADMIN_EMAIL: 'admin@pool.test', ADMIN_PASSWORD: 'clave-e2e-remota' },
  },
});
