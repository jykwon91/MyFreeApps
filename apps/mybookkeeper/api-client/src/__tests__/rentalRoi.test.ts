import { describe, expect, it } from "vitest";
import { describeGap, formatRatioPct, formatSignedMoneyCents, parseTargetReturnPct, rentalRoiHeadline } from "../utils/rentalRoi";

describe("parseTargetReturnPct", () => {
  it("reads a number, including a fraction", () => {
    expect(parseTargetReturnPct("10")).toBe(10);
    expect(parseTargetReturnPct("6.5")).toBe(6.5);
  });

  it("clamps to 0–100", () => {
    expect(parseTargetReturnPct("-5")).toBe(0);
    expect(parseTargetReturnPct("250")).toBe(100);
  });

  it("falls back to 8 for blank, missing or junk", () => {
    expect(parseTargetReturnPct(null)).toBe(8);
    expect(parseTargetReturnPct("")).toBe(8);
    expect(parseTargetReturnPct("abc")).toBe(8);
    expect(parseTargetReturnPct("Infinity")).toBe(8);
  });
});

describe("formatSignedMoneyCents", () => {
  it("signs both directions and leaves zero unsigned", () => {
    expect(formatSignedMoneyCents(30000)).toBe("+$300");
    expect(formatSignedMoneyCents(-42000)).toBe("-$420");
    expect(formatSignedMoneyCents(0)).toBe("$0");
    expect(formatSignedMoneyCents(20)).toBe("$0");
  });
});

describe("describeGap", () => {
  it("says short, ahead or even", () => {
    expect(describeGap(-42000)).toBe("$420 short");
    expect(describeGap(30000)).toBe("$300 ahead");
    expect(describeGap(-30)).toBe("Even");
  });
});

describe("formatRatioPct", () => {
  it("shows one decimal, or a dash when unknown", () => {
    expect(formatRatioPct("11.52")).toBe("11.5%");
    expect(formatRatioPct(null)).toBe("—");
  });
});

describe("rentalRoiHeadline", () => {
  const base = {
    property_count: 3,
    properties_with_target: 3,
    total_break_even_monthly_cents: 300000,
    total_target_monthly_cents: 420000,
    total_actual_revenue_monthly_cents: 400000,
    total_gap_monthly_cents: -20000,
    gap_basis: "target" as const,
  };

  it("headlines the target when every property has one", () => {
    expect(rentalRoiHeadline(base)).toEqual({ title: "You need $4,200/mo to hit your target", coverage: null });
  });

  it("headlines break-even and counts targets when only some have one", () => {
    expect(rentalRoiHeadline({ ...base, properties_with_target: 1, gap_basis: "break_even" })).toEqual({
      title: "Break-even: $3,000/mo",
      coverage: "target for 1 of 3 properties",
    });
  });

  it("asks for a purchase price when no property has a target", () => {
    expect(rentalRoiHeadline({ ...base, properties_with_target: 0, gap_basis: "break_even" }).coverage).toBe(
      "add a purchase price to see a target",
    );
  });
});
