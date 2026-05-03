import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merge the shared vite.config.ts so vitest inherits resolve.dedupe and the
// @vitejs/plugin-react plugin. Without this, the JSX transform uses React 19
// (local devDep) while @testing-library/react uses React 18 (root), causing
// "Objects are not valid as a React child" on every render.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/__tests__/setup.ts"],
    },
  }),
);
