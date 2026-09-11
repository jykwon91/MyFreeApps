import { defineConfig, devices } from "@playwright/test";

// No webServer: landing.spec.ts fulfils every request itself from public/,
// attaching the response headers of the production myfreeapps.org block in
// infra/Caddyfile — so the page is exercised under the real CSP without
// running Caddy.
export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
