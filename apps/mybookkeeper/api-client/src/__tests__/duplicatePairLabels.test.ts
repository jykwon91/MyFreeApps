import { describe, expect, it } from "vitest";
import { duplicateConfidenceLabel, duplicateHeadline, duplicateSourceLabel } from "../utils/duplicatePairLabels";

describe("duplicateSourceLabel", () => {
  const side = { source_file_name: null, is_manual: false };

  it("names where a transaction came from", () => {
    expect(duplicateSourceLabel({ ...side, source_file_name: "inv.PDF" } as never)).toBe("Invoice/PDF");
    expect(duplicateSourceLabel({ ...side, source_file_name: "jan.csv" } as never)).toBe("Bank import");
    expect(duplicateSourceLabel({ ...side, is_manual: true } as never)).toBe("Manual entry");
    expect(duplicateSourceLabel(side as never)).toBe("Document");
  });
});

describe("duplicateHeadline", () => {
  it("says how far apart the dates are", () => {
    expect(duplicateHeadline({ date_diff_days: 0 })).toBe("Same amount, same date");
    expect(duplicateHeadline({ date_diff_days: 1 })).toBe("Same amount, 1 day apart");
    expect(duplicateHeadline({ date_diff_days: 4 })).toBe("Same amount, 4 days apart");
  });
});

describe("duplicateConfidenceLabel", () => {
  it("treats anything but high and medium as low", () => {
    expect(duplicateConfidenceLabel("high")).toBe("High confidence");
    expect(duplicateConfidenceLabel("medium")).toBe("Medium confidence");
    expect(duplicateConfidenceLabel("low")).toBe("Low confidence");
    expect(duplicateConfidenceLabel("odd")).toBe("Low confidence");
  });
});
