import { describe, it, expect } from "vitest";
import { formatSalaryRange, SALARY_PERIOD_LABELS } from "../utils/salary-range";

describe("formatSalaryRange", () => {
  it("returns em-dash when both min and max are null", () => {
    expect(formatSalaryRange(null, null, "USD", "annual")).toBe("—");
  });

  it("returns em-dash when both min and max are undefined", () => {
    expect(formatSalaryRange(undefined, undefined, "USD", "annual")).toBe("—");
  });

  it("formats both min and max with en-dash and period label", () => {
    expect(formatSalaryRange("50000", "80000", "USD", "annual")).toBe(
      "$50,000 – $80,000 / year",
    );
  });

  it("formats min-only with plus suffix", () => {
    expect(formatSalaryRange("50000", null, "USD", "annual")).toBe(
      "$50,000+ / year",
    );
  });

  it("formats max-only with 'up to' prefix", () => {
    expect(formatSalaryRange(null, "80000", "USD", "annual")).toBe(
      "up to $80,000 / year",
    );
  });

  it("supports hourly period", () => {
    expect(formatSalaryRange("50", "80", "USD", "hourly")).toBe("$50 – $80 / hour");
  });

  it("supports monthly period", () => {
    expect(formatSalaryRange("4000", "6000", "USD", "monthly")).toBe(
      "$4,000 – $6,000 / month",
    );
  });

  it("omits period suffix when period is null", () => {
    expect(formatSalaryRange("50000", "80000", "USD", null)).toBe("$50,000 – $80,000");
  });

  it("omits period suffix when period is unknown", () => {
    expect(formatSalaryRange("50000", "80000", "USD", "weekly")).toBe(
      "$50,000 – $80,000",
    );
  });

  it("formats non-USD currencies via Intl.NumberFormat", () => {
    expect(formatSalaryRange("50000", "80000", "EUR", "annual")).toBe(
      "€50,000 – €80,000 / year",
    );
  });

  it("drops cents — whole-dollar amounts only", () => {
    expect(formatSalaryRange("50000.99", null, "USD", "annual")).toBe(
      "$50,001+ / year",
    );
  });

  describe("SALARY_PERIOD_LABELS", () => {
    it("exposes the canonical period → label map", () => {
      expect(SALARY_PERIOD_LABELS.annual).toBe("/ year");
      expect(SALARY_PERIOD_LABELS.hourly).toBe("/ hour");
      expect(SALARY_PERIOD_LABELS.monthly).toBe("/ month");
    });
  });
});
