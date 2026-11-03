// @ts-check
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', ...devices['Desktop Chrome'], viewport: { width: 1300, height: 850 }, trace: 'retain-on-failure' },
  webServer: { command: 'python3 -m http.server 4173 >/dev/null 2>&1', url: 'http://localhost:4173/index.html', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
