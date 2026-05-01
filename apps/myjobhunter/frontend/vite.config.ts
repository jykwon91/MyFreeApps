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
    // Force a single React instance across the workspace. Without this, MJH's
    // own node_modules has React 19 AND shared-frontend's nested node_modules
    // also has its own copy, producing the "Invalid hook call / two copies of
    // React" runtime error when MJH renders a component that imports from
    // @platform/ui (which itself uses hooks). Dedupe makes Vite resolve all
    // `react` / `react-dom` imports to the same physical module.
    dedupe: ["react", "react-dom"],
    alias: [
      // More specific aliases must come before the generic "@" catch-all.
      // "@/shared" must resolve before "@" or Vite will expand it to src/shared/.
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
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8002",
        changeOrigin: true,
      },
    },
  },
});
