import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap workers at 50% of available CPUs
  workers: "50%",
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5174",
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
    command: "npm run dev",
    url: process.env.BASE_URL ?? "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
