import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Vitest config — mirrors apps/myjobhunter/frontend/vitest.config.ts.
 *
 * Key divergences from MJH:
 * - No React alias override needed (scaffold uses React 19 like shared-frontend)
 * - setupFiles registers jest-dom matchers (PR 7, when DesktopBadge.test.tsx
 *   started using toBeInTheDocument / toBeEmptyDOMElement).
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      // Exclude Playwright E2E specs — those run via npx playwright test.
      exclude: ["e2e/**", "**/node_modules/**"],
    },
  }),
);
