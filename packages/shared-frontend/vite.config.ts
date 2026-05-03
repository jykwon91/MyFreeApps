import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Shared vite config for both production builds and vitest.
// The dedupe directive forces all react/react-dom imports to resolve to the
// workspace-root copy (React 18), preventing the "two copies of React" error
// when vitest renders components against @testing-library/react.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@/shared": path.resolve(__dirname, "src"),
    },
  },
});
