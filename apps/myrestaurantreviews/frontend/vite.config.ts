import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@platform/ui": path.resolve(
        __dirname,
        "../../../packages/shared-frontend/src"
      ),
      "@/shared": path.resolve(
        __dirname,
        "../../../packages/shared-frontend/src"
      ),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
