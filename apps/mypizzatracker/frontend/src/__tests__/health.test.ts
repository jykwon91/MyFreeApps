import { describe, expect, it } from "vitest";

import {
  HEALTH_LABELS,
  HEALTH_TONES,
  formatMoney,
} from "@/features/financials/health";

describe("health label/tone tables", () => {
  it("covers every DropHealth value with a label and tone", () => {
    for (const h of ["green", "amber", "red"] as const) {
      expect(typeof HEALTH_LABELS[h]).toBe("string");
      expect(HEALTH_LABELS[h].length).toBeGreaterThan(0);
      expect(typeof HEALTH_TONES[h]).toBe("string");
    }
  });
});

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
});
