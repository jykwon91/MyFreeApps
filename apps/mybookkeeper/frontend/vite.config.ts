import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "MyBookkeeper",
        short_name: "MyBookkeeper",
        description: "AI-powered bookkeeping assistant",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/manifest-icon-192.maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/manifest-icon-512.maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // skipWaiting + clientsClaim: when a new service worker is installed,
        // activate it immediately and take over open tabs instead of leaving
        // the old SW serving stale precached assets until the user closes all
        // tabs of the site. Without these, users can be stuck on a months-old
        // bundle even after dozens of deploys (this is exactly what happened
        // 2026-05-01 — the deployed `auth.ts` was so old it still posted to
        // `/auth/jwt/login` instead of `/auth/totp/login`).
        skipWaiting: true,
        clientsClaim: true,
        // Remove precaches from previous SW versions so old hashed bundles
        // don't accumulate in the SW cache forever.
        cleanupOutdatedCaches: true,
        // Exclude index.html from precache. The HTML must always be fetched
        // fresh so it points at the latest hashed asset bundles. Hashed
        // assets are immutable (their content determines their filename) so
        // they're safe to precache aggressively.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxAgeSeconds: 300 },
            },
          },
          {
            // Always fetch index.html (and any document navigation) from the
            // network so a fresh deploy is picked up on the next page load
            // without requiring any client-side cache clear.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxAgeSeconds: 0 },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
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
