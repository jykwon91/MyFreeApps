/**
 * The Playwright config for an app's no-backend suite. For E2E tests only.
 * No global setup and no backend: it runs e2e/mocked/, whose specs answer every
 * API call themselves via page.route(), against the app's own dev server.
 */
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import type { MockedConfigOptions } from "./types/MockedConfigOptions";

export function defineMockedConfig({ port }: MockedConfigOptions): PlaywrightTestConfig {
  const frontendPort = process.env.PW_PORT ?? port;
  const frontendURL = `http://localhost:${frontendPort}`;
  return defineConfig({
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
}
