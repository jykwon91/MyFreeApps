import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const sharedFrontend = path.resolve(
  __dirname,
  "../../../packages/shared-frontend/src"
);

export default defineConfig({
  plugins: [react()],
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
