/**
 * Unit tests for the insurance-policy display helpers.
 *
 * These are the only place `wind_hail_deductible_pct` — a JSON string, because
 * the backend column is Numeric — gets parsed, so the string handling is
 * covered explicitly.
 */
import { describe, it, expect } from "vitest";
import {
  FREQUENCY_LABEL,
  formatAnnualPremium,
  formatBilledPremium,
  formatCoverageRate,
  formatPolicyMoney,
  formatWindHailDeductible,
} from "@/shared/lib/insurance-policy-format";

describe("formatPolicyMoney", () => {
  it("renders cents as whole dollars", () => {
    expect(formatPolicyMoney(124000)).toBe("$1,240");
  });

  it("rounds to whole dollars — premiums are never quoted finer", () => {
    expect(formatPolicyMoney(12550)).toBe("$126");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatPolicyMoney(null)).toBe("—");
  });

  it("renders a real zero as $0, not as unrecorded", () => {
    expect(formatPolicyMoney(0)).toBe("$0");
  });
});

describe("formatBilledPremium", () => {
  it.each([
    ["annual" as const, "$1,240/yr"],
    ["semiannual" as const, "$1,240/6mo"],
    ["quarterly" as const, "$1,240/qtr"],
    ["monthly" as const, "$1,240/mo"],
  ])("suffixes a %s premium", (frequency, expected) => {
    expect(formatBilledPremium(124000, frequency)).toBe(expected);
  });

  it("renders an em dash when the amount is missing", () => {
    expect(formatBilledPremium(null, "monthly")).toBe("—");
  });

  it("renders an em dash when the frequency is missing", () => {
    // Without a period the amount is not interpretable — $112 could be a
    // monthly bill or a yearly one, and the two differ by 12x.
    expect(formatBilledPremium(11200, null)).toBe("—");
  });
});

describe("formatAnnualPremium", () => {
  it("always labels the figure as yearly", () => {
    expect(formatAnnualPremium(134400)).toBe("$1,344/yr");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatAnnualPremium(null)).toBe("—");
  });
});

describe("formatWindHailDeductible", () => {
  it("prices the percentage against the coverage amount", () => {
    // 2% of $500,000 = $10,000.
    expect(formatWindHailDeductible("2.00", 50000000)).toBe(
      "2% of coverage ($10,000.00)",
    );
  });

  it("keeps a fractional percentage", () => {
    expect(formatWindHailDeductible("1.50", 50000000)).toBe(
      "1.5% of coverage ($7,500.00)",
    );
  });

  it("omits the dollar figure when the coverage amount is unknown", () => {
    expect(formatWindHailDeductible("2.00", null)).toBe("2% of coverage");
  });

  it("omits the dollar figure when coverage is zero rather than dividing into it", () => {
    expect(formatWindHailDeductible("2.00", 0)).toBe("2% of coverage");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatWindHailDeductible(null, 50000000)).toBe("—");
  });

  it("renders an em dash for a blank string", () => {
    expect(formatWindHailDeductible("  ", 50000000)).toBe("—");
  });

  it("renders an em dash for an unparseable value", () => {
    expect(formatWindHailDeductible("abc", 50000000)).toBe("—");
  });
});

describe("formatCoverageRate", () => {
  it("renders the comparison unit from a Decimal string of cents", () => {
    expect(formatCoverageRate("300.00")).toBe("$3.00 per $1,000");
  });

  it("keeps the cents, since the gap between two rates lives there", () => {
    // $2.69 and $3.00 per $1,000 is a 12% difference — rounding to whole
    // dollars would erase most of what the comparison is measuring.
    expect(formatCoverageRate("268.80")).toBe("$2.69 per $1,000");
  });

  it("renders an em dash when the rate could not be derived", () => {
    expect(formatCoverageRate(null)).toBe("—");
  });

  it("renders an em dash for a blank string", () => {
    expect(formatCoverageRate("  ")).toBe("—");
  });

  it("renders an em dash for an unparseable value", () => {
    expect(formatCoverageRate("abc")).toBe("—");
  });
});

describe("FREQUENCY_LABEL", () => {
  it("labels every frequency the backend accepts", () => {
    expect(Object.keys(FREQUENCY_LABEL).sort()).toEqual([
      "annual",
      "monthly",
      "quarterly",
      "semiannual",
    ]);
  });
});
