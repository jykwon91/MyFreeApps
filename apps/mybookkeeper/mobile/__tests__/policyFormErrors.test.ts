import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { policyFormErrors } from "../src/features/insurance/policyFormErrors";

const VALID: InsurancePolicyFormValues = {
  policyName: "Landlord policy",
  carrier: "",
  policyNumber: "",
  effectiveDate: "",
  expirationDate: "",
  coverageDollars: "",
  premiumDollars: "",
  premiumFrequency: "",
  feesAndTaxesDollars: "",
  deductibleDollars: "",
  windHailPct: "",
  notes: "",
};

describe("policyFormErrors", () => {
  it("passes a form with only a name", () => {
    expect(policyFormErrors(VALID, "pr1")).toEqual({});
  });

  it("needs a property only when one is being chosen", () => {
    expect(policyFormErrors(VALID, "")).toHaveProperty("propertyId");
    expect(policyFormErrors(VALID, null)).toEqual({});
  });

  it("needs a name that isn't just spaces", () => {
    expect(policyFormErrors({ ...VALID, policyName: "   " }, "pr1")).toHaveProperty("policyName");
  });

  it.each(["coverageDollars", "premiumDollars", "feesAndTaxesDollars", "deductibleDollars"] as const)("rejects a negative or unreadable %s", (field) => {
    expect(policyFormErrors({ ...VALID, [field]: "-1" }, "pr1")).toHaveProperty(field);
    expect(policyFormErrors({ ...VALID, [field]: "abc" }, "pr1")).toHaveProperty(field);
    expect(policyFormErrors({ ...VALID, [field]: "0" }, "pr1")).toEqual({});
  });

  it("keeps wind and hail between 0 and 100", () => {
    expect(policyFormErrors({ ...VALID, windHailPct: "100" }, "pr1")).toEqual({});
    expect(policyFormErrors({ ...VALID, windHailPct: "100.5" }, "pr1")).toHaveProperty("windHailPct");
    expect(policyFormErrors({ ...VALID, windHailPct: "-1" }, "pr1")).toHaveProperty("windHailPct");
  });

  it("flags a premium with no billing period, and clears it once one is chosen", () => {
    expect(policyFormErrors({ ...VALID, premiumDollars: "1200" }, "pr1")).toHaveProperty("premiumFrequency");
    expect(policyFormErrors({ ...VALID, premiumDollars: "1200", premiumFrequency: "monthly" }, "pr1")).toEqual({});
    expect(policyFormErrors({ ...VALID, premiumFrequency: "monthly" }, "pr1")).toEqual({});
  });

  it("flags an end date before the start date, but not equal dates", () => {
    expect(policyFormErrors({ ...VALID, effectiveDate: "2026-02-01", expirationDate: "2026-01-01" }, "pr1")).toHaveProperty("expirationDate");
    expect(policyFormErrors({ ...VALID, effectiveDate: "2026-01-01", expirationDate: "2026-01-01" }, "pr1")).toEqual({});
  });
});
