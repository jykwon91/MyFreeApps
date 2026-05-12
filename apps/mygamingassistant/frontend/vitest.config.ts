import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Vitest config — mirrors apps/myjobhunter/frontend/vitest.config.ts.
 *
 * Key divergences from MJH:
 * - No React alias override needed (MGA already uses React 19 like shared-frontend)
 * - No test-setup.ts yet (add when the first unit test needs jest-dom matchers)
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      // Exclude Playwright E2E specs — those run via npx playwright test.
      exclude: ["e2e/**", "**/node_modules/**"],
    },
  }),
);
