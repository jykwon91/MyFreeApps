import { defineMockedConfig } from "@platform/ui/test-support/mockedPlaywrightConfig";

// The serve-only site's no-backend specs. VITE_SERVE_ONLY is read when the dev server
// starts, so they need a dev server of their own: on 5185, off the full-auth dev
// server's 5176, the backend serve-only suite's 5177 and the mocked suite's 5184.
export default defineMockedConfig({
  port: "5185",
  suite: "mocked-serve-only",
  env: { VITE_SERVE_ONLY: "true" },
});
