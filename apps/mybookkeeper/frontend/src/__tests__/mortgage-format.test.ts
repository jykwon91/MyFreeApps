/**
 * Unit tests for the loan display helpers.
 *
 * Two rules here are load-bearing rather than cosmetic: a rate keeps the
 * trailing zeros the backend sent (so the page agrees with the statement in the
 * operator's hand), and a missing breakeven reads as "never" rather than as a
 * long wait.
 */
import { describe, it, expect } from "vitest";
import {
  formatBreakeven,
  formatLoanDate,
  formatMoneyBand,
  formatMoneyCents,
  formatMonths,
  formatRateBand,
  formatRatePct,
} from "@/shared/lib/mortgage-format";

describe("formatMoneyCents", () => {
  it("renders cents as whole dollars with separators", () => {
    expect(formatMoneyCents(33613735)).toBe("$336,137");
  });

  it("rounds to the nearest dollar", () => {
    expect(formatMoneyCents(229738)).toBe("$2,297");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatMoneyCents(null)).toBe("—");
  });

  it("renders a real zero as $0, not as unrecorded", () => {
    // A paid-ahead loan genuinely bills $0 this month — 6732 Peerless does.
    expect(formatMoneyCents(0)).toBe("$0");
  });
});

describe("formatRatePct", () => {
  it("keeps the trailing zero the note was written to", () => {
    // Chase's statement says 2.990%. Trimming to 2.99% would disagree with
    // the document the operator is holding.
    expect(formatRatePct("2.990")).toBe("2.990%");
  });

  it("renders an eighth-of-a-point rate unchanged", () => {
    expect(formatRatePct("7.125")).toBe("7.125%");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatRatePct(null)).toBe("—");
  });

  it("renders an em dash for a blank string", () => {
    expect(formatRatePct("  ")).toBe("—");
  });

  it("renders an em dash for an unparseable value", () => {
    expect(formatRatePct("abc")).toBe("—");
  });
});

describe("formatRateBand", () => {
  it("renders the two ends of the comparable band", () => {
    expect(formatRateBand("7.07", "7.52")).toBe("7.07% – 7.52%");
  });

  it("collapses to one figure when the band has no width", () => {
    expect(formatRateBand("6.67", "6.67")).toBe("6.67%");
  });

  it("renders an em dash when either end is missing", () => {
    expect(formatRateBand("7.07", null)).toBe("—");
    expect(formatRateBand(null, "7.52")).toBe("—");
  });
});

describe("formatMoneyBand", () => {
  it("renders the closing-cost range", () => {
    expect(formatMoneyBand(672275, 1680687)).toBe("$6,723 – $16,807");
  });

  it("collapses to one figure when both ends match", () => {
    expect(formatMoneyBand(5238, 5238)).toBe("$52");
  });

  it("renders an em dash when either end is missing", () => {
    expect(formatMoneyBand(null, 1680687)).toBe("—");
  });
});

describe("formatMonths", () => {
  it("spells a remaining term out in years and months", () => {
    // 343 months is what 6734 Peerless's payment implies.
    expect(formatMonths(343)).toBe("28 years, 7 months");
  });

  it("omits the months when the term lands on a whole year", () => {
    expect(formatMonths(360)).toBe("30 years");
  });

  it("omits the years when under one", () => {
    expect(formatMonths(7)).toBe("7 months");
  });

  it("singularises one of each", () => {
    expect(formatMonths(13)).toBe("1 year, 1 month");
  });

  it("renders zero as a real count, not as unrecorded", () => {
    expect(formatMonths(0)).toBe("0 months");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatMonths(null)).toBe("—");
  });
});

describe("formatBreakeven", () => {
  it("renders the range when the costs earn back at both ends", () => {
    expect(formatBreakeven(24, 48)).toBe("2 years to 4 years");
  });

  it("collapses to one figure when both ends match", () => {
    expect(formatBreakeven(30, 30)).toBe("2 years, 6 months");
  });

  it("says the loan may never repay when only the best case does", () => {
    // The pessimistic end has no breakeven because the payment does not fall
    // there at all. Rendering that as a long wait would invent a payback.
    expect(formatBreakeven(36, null)).toBe(
      "3 years at best, and possibly never",
    );
  });

  it("says it never repays when even the best case does not", () => {
    expect(formatBreakeven(null, null)).toBe("longer than the loan has left");
    expect(formatBreakeven(null, 120)).toBe("longer than the loan has left");
  });
});

describe("formatLoanDate", () => {
  it("renders a date-only value without a timezone shift", () => {
    // The survey date is the one figure the page cites as evidence; sliding
    // it a day earlier in a western timezone would misdate the benchmark.
    expect(formatLoanDate("2026-08-13")).toBe("Aug 13, 2026");
  });

  it("renders an em dash when unrecorded", () => {
    expect(formatLoanDate(null)).toBe("—");
    expect(formatLoanDate("")).toBe("—");
  });
});
