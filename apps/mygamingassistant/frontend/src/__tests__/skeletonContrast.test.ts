/**
 * Guard: loading skeletons must be painted `bg-muted`, never `bg-muted/<n>`.
 *
 * A translucent muted fill (e.g. 40%) over a white card is ~98% lightness in
 * light mode, so the skeleton is effectively invisible. Hover/selected tints
 * (`hover:bg-muted/40`) are intentional and allowed.
 */
import { describe, expect, it } from "vitest";

// Every source file except tests, as raw text, keyed by path relative to this file.
const SOURCES = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../__tests__/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});
// A `bg-muted/<n>` utility that is not behind a variant prefix (hover:, focus:, ...).
const TRANSLUCENT_MUTED = /(^|[\s"'`])bg-muted\/\d+/;

function findViolations(): string[] {
  return Object.entries(SOURCES).flatMap(([path, source]) => {
    const isSkeletonFile = /Skeleton/.test(path.split("/").pop() ?? "");
    return source
      .split("\n")
      .flatMap((line, i) =>
        TRANSLUCENT_MUTED.test(line) && (isSkeletonFile || line.includes("animate-pulse"))
          ? [`${path}:${i + 1}: ${line.trim()}`]
          : [],
      );
  });
}

describe("skeleton contrast", () => {
  it("paints skeleton placeholders bg-muted, not a translucent bg-muted/<n>", () => {
    expect(findViolations()).toEqual([]);
  });
});
