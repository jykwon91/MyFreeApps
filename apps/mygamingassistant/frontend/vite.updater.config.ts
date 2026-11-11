import { defineConfig } from "vite";
import viteConfig from "./vite.config";

/**
 * Builds the MGA Prices updater into one Node file, `dist-updater/mga-prices-updater.mjs`,
 * with the recipe data and the Data.lua writer bundled in (no repo needed to run it).
 * See updater/README.md.
 */
export default defineConfig({
  resolve: viteConfig.resolve,
  publicDir: false,
  build: {
    ssr: "updater/updatePricesAddon.ts",
    outDir: "dist-updater",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: { entryFileNames: "mga-prices-updater.mjs", inlineDynamicImports: true },
    },
  },
  ssr: { noExternal: true },
});
