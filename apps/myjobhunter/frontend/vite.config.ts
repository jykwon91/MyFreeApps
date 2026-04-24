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
