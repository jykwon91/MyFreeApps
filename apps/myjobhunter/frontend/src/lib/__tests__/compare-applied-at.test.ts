import { describe, it, expect } from "vitest";
import { compareAppliedAt } from "@/lib/compare-applied-at";

describe("compareAppliedAt", () => {
  it("orders by the instant, not by how the date reads", () => {
    const dates = ["2026-10-02T00:00:00Z", "2026-09-30T00:00:00Z", "2025-12-01T00:00:00Z"];
    expect([...dates].sort(compareAppliedAt)).toEqual([
      "2025-12-01T00:00:00Z",
      "2026-09-30T00:00:00Z",
      "2026-10-02T00:00:00Z",
    ]);
  });

  it("puts applications not sent yet after the ones that were", () => {
    expect(compareAppliedAt(null, "2026-01-01T00:00:00Z")).toBeGreaterThan(0);
    expect(compareAppliedAt("2026-01-01T00:00:00Z", null)).toBeLessThan(0);
    expect(compareAppliedAt(null, null)).toBe(0);
  });
});

describe("compareAppliedAt with blank values", () => {
  it("treats a blank timestamp as not applied, like formatAppliedDate", () => {
    expect(compareAppliedAt("", "2026-01-01T00:00:00Z")).toBeGreaterThan(0);
    expect(compareAppliedAt("2026-01-01T00:00:00Z", "")).toBeLessThan(0);
    expect(compareAppliedAt("", null)).toBe(0);
    expect(compareAppliedAt(undefined, "")).toBe(0);
  });
});
