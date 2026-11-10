import { defineConfig } from "vitest/config";

// Node, not jsdom: with no `window` to fall back on, a browser API reaching this
// package fails here instead of passing by accident.
export default defineConfig({
  test: {
    environment: "node",
  },
});
