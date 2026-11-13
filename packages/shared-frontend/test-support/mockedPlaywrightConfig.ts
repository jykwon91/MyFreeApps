/**
 * The Playwright config for an app's no-backend suite. For E2E tests only.
 * No global setup and no backend: it runs e2e/mocked/ (or the `suite` folder
 * given), whose specs answer every API call themselves via page.route(),
 * against the app's own dev server.
 */
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { DEFAULT_MOCKED_SUITE } from "./constants/defaultMockedSuite";
import type { MockedConfigOptions } from "./types/MockedConfigOptions";

export function defineMockedConfig({ port, suite = DEFAULT_MOCKED_SUITE, env }: MockedConfigOptions): PlaywrightTestConfig {
  const frontendPort = process.env.PW_PORT ?? port;
  const frontendURL = `http://localhost:${frontendPort}`;
  return defineConfig({
    testDir: `./e2e/${suite}`,
    outputDir: `./e2e/test-results-${suite}`,
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
    // A suite that needs its own build-time env (e.g. VITE_SERVE_ONLY) must
    // never run against a dev server someone else started without it.
    webServer: {
      command: `npm run dev -- --port ${frontendPort}${env ? " --strictPort" : ""}`,
      url: frontendURL,
      reuseExistingServer: !env && !process.env.CI,
      timeout: 30000,
      env,
    },
  });
}
