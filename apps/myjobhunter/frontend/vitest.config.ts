import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import viteConfig from "./vite.config";

// Resolve react + react-dom to the workspace root node_modules so that
// packages/shared-frontend's own nested copies (React 19) don't collide with
// MJH's React 18 when vi.mock importOriginal loads @platform/ui.
const workspaceRoot = path.resolve(__dirname, "../../../");

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "react",
          replacement: path.resolve(workspaceRoot, "node_modules/react"),
        },
        {
          find: "react-dom",
          replacement: path.resolve(workspaceRoot, "node_modules/react-dom"),
        },
      ],
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
      exclude: ["e2e/**", "**/node_modules/**"],
    },
  }),
);
