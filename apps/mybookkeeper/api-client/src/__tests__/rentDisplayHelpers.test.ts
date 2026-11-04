import { describe, expect, it } from "vitest";
import type { RentPeriodSummary } from "../types/rent/rent-period-summary";
import { periodDateRange } from "../utils/rentPeriodDates";
import { proratedNote } from "../utils/rentProratedNote";

function aPeriod(overrides: Partial<RentPeriodSummary> = {}): RentPeriodSummary {
  return { charge_id: "c1", label: "August 2026", period_start: "2026-08-01", period_end: "2026-08-31", amount: "1500.00", full_amount: null, allocated: "0.00", remaining: "1500.00", status: "open", ...overrides };
}

describe("proratedNote", () => {
  it("explains a partial period with the undivided amount", () => {
    expect(proratedNote("1500.00")).toBe("Prorated from $1,500.00 for a partial period");
  });

  it("says nothing about a whole period", () => {
    expect(proratedNote(null)).toBeNull();
  });
});

describe("periodDateRange", () => {
  it("adds the dates to a label that doesn't state them", () => {
    expect(periodDateRange(aPeriod())).toBe("Aug 1 – Aug 31");
  });

  it("doesn't repeat dates the label already leads with", () => {
    expect(periodDateRange(aPeriod({ label: "Aug 15 – Aug 31, 2026", period_start: "2026-08-15" }))).toBeNull();
  });
});
