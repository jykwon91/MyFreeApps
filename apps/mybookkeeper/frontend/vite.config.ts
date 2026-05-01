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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
