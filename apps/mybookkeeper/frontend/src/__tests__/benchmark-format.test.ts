/**
 * Unit tests for the shared market-gap helper.
 *
 * Shared by the utility rate card and the insurance premium card, so a change
 * here moves both — which is the point: two cards disagreeing about whether
 * ``-0.04`` is "below market" or "level" would be a bug the reader could only
 * catch by putting them side by side.
 */
import { describe, it, expect } from "vitest";
import { formatBenchmarkGap } from "@/shared/lib/benchmark-format";

describe("formatBenchmarkGap", () => {
  it("spells out the direction so a negative does not read as bad news", () => {
    expect(formatBenchmarkGap("35.7")).toBe("35.7% above market");
    expect(formatBenchmarkGap("-12.0")).toBe("12% below market");
  });

  it("names an exact tie rather than showing 0%", () => {
    expect(formatBenchmarkGap("0")).toBe("level with market");
  });

  it("does not claim a direction on a difference rounding erased", () => {
    // -0.04 rounds to 0 for display; calling it "0% below market" would assert
    // a direction the reader cannot see in the number shown.
    expect(formatBenchmarkGap("-0.04")).toBe("level with market");
  });

  it("falls back to a dash for missing or invalid input", () => {
    expect(formatBenchmarkGap(null)).toBe("—");
    expect(formatBenchmarkGap("")).toBe("—");
    expect(formatBenchmarkGap("garbage")).toBe("—");
  });
});
