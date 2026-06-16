import { describe, it, expect } from "vitest";
import { deriveBreakEven, breakEvenStatusLine } from "../components/widgets/breakEven";

describe("deriveBreakEven", () => {
  it("returns 0% / warning when there are no donations", () => {
    const s = deriveBreakEven(0, 8200);
    expect(s.pct).toBe(0);
    expect(s.tone).toBe("warning");
    expect(s.goalMet).toBe(false);
    expect(s.noDonations).toBe(true);
  });

  it("uses the warning tone below 50%", () => {
    const s = deriveBreakEven(2000, 8200); // ~24%
    expect(Math.round(s.pct)).toBe(24);
    expect(s.tone).toBe("warning");
    expect(s.noDonations).toBe(false);
  });

  it("uses the primary tone from 50% up to break-even", () => {
    const s = deriveBreakEven(4700, 8200); // ~57%
    expect(s.tone).toBe("primary");
    expect(s.goalMet).toBe(false);
  });

  it("flags goalMet with the success tone when donations equal costs", () => {
    const s = deriveBreakEven(8200, 8200);
    expect(s.goalMet).toBe(true);
    expect(s.tone).toBe("success");
  });

  it("flags goalMet when donations exceed costs (pct can exceed 100)", () => {
    const s = deriveBreakEven(11000, 8200);
    expect(s.goalMet).toBe(true);
    expect(s.pct).toBeGreaterThan(100);
  });

  it("treats unconfigured (zero) costs as 0% and not goalMet", () => {
    const s = deriveBreakEven(0, 0);
    expect(s.pct).toBe(0);
    expect(s.goalMet).toBe(false);
    expect(s.noDonations).toBe(true);
  });
});

describe("breakEvenStatusLine", () => {
  it("thanks the donor when the goal is met", () => {
    expect(breakEvenStatusLine(deriveBreakEven(9000, 8200))).toMatch(/thank you/i);
  });

  it("invites the first donation when there are none", () => {
    expect(breakEvenStatusLine(deriveBreakEven(0, 8200))).toMatch(/be the first/i);
  });

  it("reports the percentage covered otherwise", () => {
    expect(breakEvenStatusLine(deriveBreakEven(4700, 8200))).toMatch(/57% of this month/i);
  });
});
