import { describe, expect, it } from "vitest";
import { reconciliationTaxYears } from "../utils/reconciliationTaxYears";

describe("reconciliationTaxYears", () => {
  it("offers last year and the two before it", () => {
    expect(reconciliationTaxYears(new Date(2026, 0, 1))).toEqual([2025, 2024, 2023]);
    expect(reconciliationTaxYears(new Date(2026, 11, 31))).toEqual([2025, 2024, 2023]);
  });
});
