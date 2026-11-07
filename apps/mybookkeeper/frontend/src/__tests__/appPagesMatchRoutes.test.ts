import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "../../e2e/fixtures/app-pages";

const APP_SOURCE = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

// Shell routes that are not pages a user lands on, so the phone guards skip them.
const NOT_PAGES = new Set(["/forbidden"]);

function quotedPaths(source: string): string[] {
  return [...source.matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1]);
}

function sections(): { shell: string; admin: string } {
  const shellStart = APP_SOURCE.indexOf('path="/"');
  const adminStart = APP_SOURCE.indexOf('path="/admin"');
  expect(shellStart).toBeGreaterThan(-1);
  expect(adminStart).toBeGreaterThan(shellStart);
  return { shell: APP_SOURCE.slice(shellStart, adminStart), admin: APP_SOURCE.slice(adminStart) };
}

function staticPages(): string[] {
  const { shell, admin } = sections();
  const shellPages = quotedPaths(shell).slice(1).map((p) => `/${p}`);
  const adminPages = quotedPaths(admin).slice(1).map((p) => `/admin/${p}`);
  return ["/", ...shellPages, "/admin", ...adminPages].filter(
    (p) => !p.includes(":") && !p.includes("*") && !NOT_PAGES.has(p),
  );
}

describe("APP_PAGES", () => {
  it("reads App.tsx the way it is laid out", () => {
    const { shell, admin } = sections();
    expect(APP_SOURCE).not.toMatch(/\bpath=\{/);
    expect(quotedPaths(shell)).toEqual(expect.arrayContaining(["forbidden", "*"]));
    expect(quotedPaths(admin).length).toBeGreaterThan(1);
  });

  it("lists every static page route in App.tsx", () => {
    expect([...APP_PAGES].sort()).toEqual(staticPages().sort());
  });
});
