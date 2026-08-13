/**
 * Unit tests for the utility-plan display helpers.
 *
 * These parse the rate strings the backend sends (``Numeric`` serializes as a
 * JSON string, not a number). Getting that wrong is silent: a mis-parse shows
 * a plausible-looking price that is simply not the contracted rate.
 */
import { describe, it, expect } from "vitest";
import {
  formatCents,
  formatCentsPerKwh,
  formatComparisonFigure,
  formatPlanDate,
  formatRenewalCountdown,
} from "@/shared/lib/utility-plan-format";

describe("formatCentsPerKwh", () => {
  it("keeps sub-cent precision", () => {
    // A TDU charge rounded to 5.35 would misprice every comparison.
    expect(formatCentsPerKwh("5.3509")).toBe("5.3509¢/kWh");
  });

  it("drops the trailing zeros the backend pads to four places", () => {
    expect(formatCentsPerKwh("13.9000")).toBe("13.9¢/kWh");
  });

  it("renders a whole-number rate without a decimal point", () => {
    expect(formatCentsPerKwh("12.0000")).toBe("12¢/kWh");
  });

  it("falls back to a dash for missing or unparseable values", () => {
    expect(formatCentsPerKwh(null)).toBe("—");
    expect(formatCentsPerKwh("")).toBe("—");
    expect(formatCentsPerKwh("not-a-number")).toBe("—");
  });
});

describe("formatCents", () => {
  it("renders integer cents as dollars", () => {
    expect(formatCents(439)).toBe("$4.39");
    expect(formatCents(15000)).toBe("$150.00");
  });

  it("renders a genuine zero rather than a dash", () => {
    // The Constellation EFL states a minimum-usage fee of 0.00000 — zero is a
    // recorded fact, not a missing value, and must not read as "unknown".
    expect(formatCents(0)).toBe("$0.00");
  });

  it("falls back to a dash when unset", () => {
    expect(formatCents(null)).toBe("—");
  });
});

describe("formatRenewalCountdown", () => {
  it("reports a lapsed term in the past tense", () => {
    expect(formatRenewalCountdown(-196)).toBe("Lapsed 196 days ago");
    expect(formatRenewalCountdown(-1)).toBe("Lapsed 1 day ago");
  });

  it("calls out the day the term ends", () => {
    expect(formatRenewalCountdown(0)).toBe("Ends today");
  });

  it("counts down to a future end date", () => {
    expect(formatRenewalCountdown(1)).toBe("Ends in 1 day");
    expect(formatRenewalCountdown(45)).toBe("Ends in 45 days");
  });

  it("says so when no term end is recorded", () => {
    expect(formatRenewalCountdown(null)).toBe("No term end recorded");
  });
});

describe("formatPlanDate", () => {
  it("formats an ISO date in the viewer's local timezone", () => {
    // Parsed as local midnight, not UTC — otherwise a US viewer sees Jan 22
    // for a term that ended Jan 23.
    expect(formatPlanDate("2026-01-23")).toBe("Jan 23, 2026");
  });

  it("falls back to a dash for missing or invalid input", () => {
    expect(formatPlanDate(null)).toBe("—");
    expect(formatPlanDate("garbage")).toBe("—");
  });
});

describe("formatComparisonFigure", () => {
  it("quotes metered service per kWh", () => {
    expect(formatComparisonFigure("15.0600", "electricity")).toBe("15.06¢/kWh");
    expect(formatComparisonFigure("0.9500", "natural_gas")).toBe("0.95¢/kWh");
  });

  it("quotes internet as a monthly amount, parsing the Decimal string", () => {
    // Sending 9000 as "9000" must not become $9,000.00 or 9000¢/kWh.
    expect(formatComparisonFigure("9000", "internet")).toBe("$90.00/mo");
  });

  it("falls back to a dash for missing or invalid input", () => {
    expect(formatComparisonFigure(null, "internet")).toBe("—");
    expect(formatComparisonFigure("garbage", "internet")).toBe("—");
    expect(formatComparisonFigure(null, "electricity")).toBe("—");
  });
});
