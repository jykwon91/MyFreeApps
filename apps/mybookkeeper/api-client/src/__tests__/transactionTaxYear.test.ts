import { describe, expect, it } from "vitest";
import { isAllowedTaxYear, otherTaxYear, taxYearOf } from "../utils/transactionTaxYear";

describe("transaction tax years", () => {
  it("reads the year from the date without time zones", () => {
    expect(taxYearOf("2025-12-31")).toBe(2025);
    expect(taxYearOf("2026-01-01")).toBe(2026);
  });

  it("allows the years a tax return can cover", () => {
    expect(isAllowedTaxYear(2020)).toBe(true);
    expect(isAllowedTaxYear(2099)).toBe(true);
    expect(isAllowedTaxYear(2019)).toBe(false);
    expect(isAllowedTaxYear(2100)).toBe(false);
    expect(isAllowedTaxYear(2025.5)).toBe(false);
    expect(isAllowedTaxYear(Number.NaN)).toBe(false);
  });

  it("only asks when the date's year isn't the one it's filed under", () => {
    expect(otherTaxYear("2026-12-31", { tax_year: 2026 })).toBeNull();
    expect(otherTaxYear("2027-01-01", { tax_year: 2026 })).toBe(2027);
    expect(otherTaxYear("2026-01-02", { tax_year: 2025 })).toBe(2026);
  });
});
