import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const sharedFrontend = path.resolve(
  __dirname,
  "../../../packages/shared-frontend/src"
);

export default defineConfig({
  // npm-workspaces resolves @vitejs/plugin-react against the app-local vite 8
  // copy while vitest/config pulls vite 7 from the workspace root, producing
  // two distinct (but structurally compatible) Plugin type instances. Cast via
  // unknown to paper over the dual-instance mismatch without weakening typing
  // anywhere else in the config.
  plugins: [react() as unknown as Plugin],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["e2e/**", "**/node_modules/**"],
  },
  resolve: {
    alias: [
      // More specific aliases must come before the generic "@" catch-all.
      {
        find: "@/shared",
        replacement: sharedFrontend,
      },
      {
        find: "@platform/ui",
        replacement: sharedFrontend,
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
});
