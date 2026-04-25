import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.PW_PORT ?? "5173";
const frontendURL = `http://localhost:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL: frontendURL,
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
