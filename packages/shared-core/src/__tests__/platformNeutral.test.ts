/**
 * @platform/core has to load on web and on React Native. `tsc --noEmit` (no DOM in
 * `lib`) rejects browser globals; this rejects what that can't see: imports of
 * platform packages, and a tsconfig that quietly lets the DOM back in.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = join(SRC, "..");

const IMPORT_SPECIFIER = /(?:from\s+|import\s+|import\(\s*|require\(\s*)["']([^"']+)["']/g;
const FORBIDDEN_IMPORT = /^(react-dom|react-native|expo|@react-native|@expo|@platform\/ui)(\/|-|$)|^node:/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

function importsOf(path: string): string[] {
  return [...readFileSync(path, "utf8").matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

describe("@platform/core stays platform-neutral", () => {
  it("has source files to check", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(10);
  });

  it("imports no platform-specific package", () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      importsOf(path)
        .filter((specifier) => FORBIDDEN_IMPORT.test(specifier))
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("typechecks without the DOM library", () => {
    const { compilerOptions } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "tsconfig.json"), "utf8"));
    expect(compilerOptions.lib.map((lib: string) => lib.toLowerCase())).toEqual(["es2020"]);
    expect(compilerOptions.types).toEqual([]);
  });

  it("loads with no window", async () => {
    expect("window" in globalThis).toBe(false);
    await expect(import("../index")).resolves.toHaveProperty("configurePlatform");
  });
});
