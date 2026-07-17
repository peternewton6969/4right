import { defineConfig, devices } from '@playwright/test';

// Mobile smoke tests. These drive the real app in WebKit — the engine Safari uses
// on iOS — at an iPhone viewport, so touch-only regressions (which the jsdom-free
// Vitest suite cannot see) get caught before deploy. Run with: npm run test:mobile
const PORT = 5199;

export default defineConfig({
  testDir: './tests/mobile',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-webkit',
      // iPhone 12: 390×844, WebKit, isMobile + hasTouch — the exact environment
      // the Character Notes tap bug reproduced in.
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
