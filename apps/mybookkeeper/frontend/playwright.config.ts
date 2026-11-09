import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.PW_PORT ?? "5173";
const frontendURL = `http://localhost:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  // Mocked specs run under playwright.layout.config.ts, without a backend.
  // A regex, because Playwright matches globs anywhere in the absolute path.
  testIgnore: /[\\/]e2e[\\/]mocked[\\/]/,
  outputDir: "./e2e/test-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two everywhere: the full real-stack suite (760+ specs) passes at two
  // locally, and one worker takes over 45 minutes on a GitHub runner.
  workers: 2,
  // Ends a CI run cleanly, with its HTML report, before the workflow step's
  // 55-minute timeout kills it.
  globalTimeout: process.env.CI ? 50 * 60_000 : 0,
  reporter: "html",
  use: {
    baseURL: frontendURL,
    // Tracing every attempt ("retain-on-failure") made the CI suite ~30% slower
    // and pushed it past globalTimeout, so only retries are traced.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${frontendPort}`,
    url: frontendURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
