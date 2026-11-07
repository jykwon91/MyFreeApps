import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = resolve(__dirname, "../..");

// Shell routes that are not pages a user lands on, so the phone guards skip them.
const NOT_PAGES = new Set(["/forbidden"]);

function quotedPaths(source: string): string[] {
  return [...source.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

function staticPages(): string[] {
  const app = readFileSync(resolve(FRONTEND, "src/App.tsx"), "utf8");
  const shellStart = app.indexOf('path="/"');
  const adminStart = app.indexOf('path="/admin"');
  expect(shellStart).toBeGreaterThan(-1);
  expect(adminStart).toBeGreaterThan(shellStart);

  const shell = quotedPaths(app.slice(shellStart, adminStart)).slice(1).map((p) => `/${p}`);
  const admin = quotedPaths(app.slice(adminStart)).slice(1).map((p) => `/admin/${p}`);
  return ["/", ...shell, "/admin", ...admin].filter(
    (p) => !p.includes(":") && !p.includes("*") && !NOT_PAGES.has(p),
  );
}

describe("APP_PAGES", () => {
  it("lists every static page route in App.tsx", () => {
    const fixture = readFileSync(resolve(FRONTEND, "e2e/fixtures/app-pages.ts"), "utf8");
    const listed = [...fixture.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual(staticPages().sort());
  });
});
