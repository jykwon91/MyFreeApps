import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.PW_PORT ?? "5173";
const frontendURL = `http://localhost:${frontendPort}`;

// No global setup and no backend: runs e2e/mocked/, whose specs answer every
// API call themselves via page.route().
export default defineConfig({
  testDir: "./e2e/mocked",
  outputDir: "./e2e/test-results-mocked",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "list",
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
