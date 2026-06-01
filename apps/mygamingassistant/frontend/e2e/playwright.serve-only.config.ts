import { defineConfig, devices } from "@playwright/test";

/**
 * Serve-only E2E config.
 *
 * VITE_SERVE_ONLY is a BUILD/dev-time flag (Vite inlines `import.meta.env.
 * VITE_SERVE_ONLY` from the process env when the dev server starts), so the
 * serve-only frontend must run as its OWN dev server with the flag set — the
 * default full-auth config can't exercise it. This config boots a dedicated
 * Vite dev server on port 5177 (NOT the default 5176, so it never reuses or
 * collides with a full-auth dev server already running) with
 * VITE_SERVE_ONLY=true, and runs ONLY the serve-only spec.
 *
 * Run: npm run test:e2e:serve-only
 *
 * No backend auth is needed (serve-only mounts no auth routes), but the public
 * read endpoints still require the backend on :8004 with fixtures loaded — the
 * same prerequisite as the public-browse assertions in smoke.spec.ts.
 */
const SERVE_ONLY_PORT = 5177;
const BASE_URL = process.env.SERVE_ONLY_BASE_URL ?? `http://localhost:${SERVE_ONLY_PORT}`;

export default defineConfig({
  testDir: "./",
  testMatch: "**/serve-only.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: { cookies: [], origins: [] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${SERVE_ONLY_PORT} --strictPort`,
    url: BASE_URL,
    // Never reuse an existing server — this server MUST carry VITE_SERVE_ONLY.
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      VITE_SERVE_ONLY: "true",
    },
  },
});
