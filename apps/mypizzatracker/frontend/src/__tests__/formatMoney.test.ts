import { describe, expect, it } from "vitest";

import { formatMoney } from "@/lib/formatMoney";

describe("formatMoney", () => {
  it("renders integer Decimals to two places", () => {
    expect(formatMoney("17")).toBe("17.00");
  });
  it("rounds two-decimal Decimals", () => {
    expect(formatMoney("17.5")).toBe("17.50");
  });
  it("preserves negative values", () => {
    expect(formatMoney("-5.25")).toBe("-5.25");
  });
  it("returns input verbatim for NaN", () => {
    expect(formatMoney("abc")).toBe("abc");
  });
  it("formats numbers too", () => {
    expect(formatMoney(3)).toBe("3.00");
  });
});
