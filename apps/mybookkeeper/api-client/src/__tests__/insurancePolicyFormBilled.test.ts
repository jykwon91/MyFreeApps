import { describe, expect, it } from "vitest";
import { EMPTY_POLICY_FORM, isPremiumBilledMissing } from "../utils/insurancePolicyForm";

describe("isPremiumBilledMissing", () => {
  it("is true for a premium with no billing period", () => {
    expect(isPremiumBilledMissing({ ...EMPTY_POLICY_FORM, premiumDollars: "1200" })).toBe(true);
  });

  it.each(["annual", "semiannual", "quarterly", "monthly"])("is false once the period is %s", (premiumFrequency) => {
    expect(isPremiumBilledMissing({ ...EMPTY_POLICY_FORM, premiumDollars: "1200", premiumFrequency })).toBe(false);
  });

  it.each(["", "  ", "0", "abc"])("is false when there is no usable premium (%j)", (premiumDollars) => {
    expect(isPremiumBilledMissing({ ...EMPTY_POLICY_FORM, premiumDollars })).toBe(false);
  });
});
