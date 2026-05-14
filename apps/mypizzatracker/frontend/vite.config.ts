import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const sharedFrontend = path.resolve(
  __dirname,
  "../../../packages/shared-frontend/src"
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single React instance across the workspace.
    // Mirrors apps/myjobhunter/frontend/vite.config.ts.
    dedupe: ["react", "react-dom"],
    alias: [
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
  server: {
    port: 5178,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8006",
        changeOrigin: true,
      },
    },
  },
});
