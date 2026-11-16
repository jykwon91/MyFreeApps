import { describe, it, expect } from "vitest";
import { formatSalaryRange, SALARY_PERIOD_LABELS } from "../utils/salaryRange";

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

  it("keeps cents when the amount is not whole", () => {
    expect(formatSalaryRange("50000.99", null, "USD", "annual")).toBe(
      "$50,000.99+ / year",
    );
  });

  it("keeps cents on hourly ranges instead of rounding to whole dollars", () => {
    expect(formatSalaryRange("17.50", "22.50", "USD", "hourly")).toBe(
      "$17.50 – $22.50 / hour",
    );
  });

  it("renders both ends with cents when only one end is fractional", () => {
    expect(formatSalaryRange("17.50", "22", "USD", "hourly")).toBe(
      "$17.50 – $22.00 / hour",
    );
  });

  it("does not add .00 to whole amounts, including decimal-string wholes", () => {
    expect(formatSalaryRange("120000.00", "150000", "USD", "annual")).toBe(
      "$120,000 – $150,000 / year",
    );
    expect(formatSalaryRange("20", null, "USD", "hourly")).toBe("$20+ / hour");
  });

  describe("invalid currency code", () => {
    it("does not throw and shows the number with the raw code", () => {
      expect(formatSalaryRange("17.50", "22.50", "CA$", "hourly")).toBe(
        "17.50 CA$ – 22.50 CA$ / hour",
      );
    });

    it("handles whole amounts and an empty code", () => {
      expect(formatSalaryRange("120000", null, "CA$", "annual")).toBe(
        "120,000 CA$+ / year",
      );
      expect(formatSalaryRange("50", "80", "", "hourly")).toBe("50 – 80 / hour");
    });
  });

  describe("SALARY_PERIOD_LABELS", () => {
    it("exposes the canonical period → label map", () => {
      expect(SALARY_PERIOD_LABELS.annual).toBe("/ year");
      expect(SALARY_PERIOD_LABELS.hourly).toBe("/ hour");
      expect(SALARY_PERIOD_LABELS.monthly).toBe("/ month");
    });
  });
});
