import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// PWA / vite-plugin-pwa was removed 2026-05-01 because the service worker's
// precache aggressively held stale frontend bundles across deploys, leaving
// users on months-old code (login broken, document viewer broken). For a
// bookkeeping app that is online-first, the offline / installable benefits
// did not justify the deployment-confidence cost. Browsers now respect the
// Cache-Control headers Caddy sends (no-cache for HTML, immutable for
// content-hashed assets), so deploys are picked up on the next page load
// with no service-worker indirection.

const sharedFrontend = path.resolve(
  __dirname,
  "../../../packages/shared-frontend/src"
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single React instance across the workspace. MBK + shared-frontend
    // are both on React 19; dedupe ensures `@platform/ui` components and MBK
    // components resolve to the same physical react module. Without dedupe the
    // reconciler / element-creator mismatch surfaces as "Objects are not valid
    // as a React child" at runtime (the 2026-05-01 incident captured in
    // project_mbk_platform_ui_migration_blocked.md).
    dedupe: ["react", "react-dom"],
    alias: [
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
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
