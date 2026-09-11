import { defineConfig, devices } from "@playwright/test";

// Portfolio screenshot capture (myfreeapps.org/jason/). NOT part of CI — it
// drives locally running apps seeded with fake demo data. See capture/README.md.
//
//   seed     — *.setup.ts: idempotently create the demo account + fake data in
//              each local app through its public HTTP API.
//   capture  — capture.spec.ts: log in as the demo account and write the
//              screenshots into public/jason/img/.
export default defineConfig({
  testDir: "./",
  fullyParallel: false,
  workers: 1,
  timeout: 10 * 60_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  projects: [
    { name: "seed", testMatch: "**/*.setup.ts" },
    { name: "capture", testMatch: "**/capture.spec.ts", dependencies: ["seed"] },
  ],
});
