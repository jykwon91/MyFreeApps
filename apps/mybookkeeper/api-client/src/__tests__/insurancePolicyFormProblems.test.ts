import { describe, expect, it } from "vitest";
import { insurancePolicyProblemMessages } from "../constants/insurancePolicyProblemMessages";
import { EMPTY_POLICY_FORM } from "../utils/insurancePolicyForm";
import { insurancePolicyFormProblems } from "../utils/insurancePolicyFormProblems";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import type { InsurancePolicyFormValues } from "../types/insurance/insurance-policy-form-values";

const VALID: InsurancePolicyFormValues = { ...EMPTY_POLICY_FORM, policyName: "Landlord policy" };

function problems(change: Partial<InsurancePolicyFormValues>, decimalSeparator: DecimalSeparator = ".") {
  return insurancePolicyFormProblems({ ...VALID, ...change }, decimalSeparator);
}

describe("insurancePolicyFormProblems", () => {
  it("finds nothing wrong with a name alone, or with every optional field blank", () => {
    expect(problems({})).toEqual({});
  });

  it("finds nothing wrong with a fully filled valid form", () => {
    expect(
      problems({
        carrier: "State Farm",
        policyNumber: "P-1",
        effectiveDate: "2026-01-01",
        expirationDate: "2027-01-01",
        coverageDollars: "500000",
        premiumDollars: "1240.50",
        premiumFrequency: "annual",
        feesAndTaxesDollars: "0",
        deductibleDollars: "0",
        windHailPct: "2.5",
        notes: "ok",
      }),
    ).toEqual({});
  });

  describe("policy name (1 to 255)", () => {
    it("rejects blank or whitespace", () => {
      expect(problems({ policyName: "" }).policyName).toBe("name_required");
      expect(problems({ policyName: "   " }).policyName).toBe("name_required");
    });
    it("accepts 255 and rejects 256", () => {
      expect(problems({ policyName: "a".repeat(255) })).toEqual({});
      expect(problems({ policyName: "a".repeat(256) }).policyName).toBe("too_long");
    });
  });

  describe("other text limits", () => {
    it("caps carrier, policy number and notes", () => {
      expect(problems({ carrier: "a".repeat(256) }).carrier).toBe("too_long");
      expect(problems({ policyNumber: "a".repeat(256) }).policyNumber).toBe("too_long");
      expect(problems({ notes: "a".repeat(5001) }).notes).toBe("too_long");
      expect(problems({ notes: "a".repeat(5000) })).toEqual({});
    });
  });

  describe("premium (above zero)", () => {
    it.each(["0", "0.00"])("rejects %s, which is zero cents", (premiumDollars) => {
      expect(problems({ premiumDollars, premiumFrequency: "annual" }).premiumDollars).toBe("must_be_positive");
    });
    it("rejects a negative premium", () => {
      expect(problems({ premiumDollars: "-5", premiumFrequency: "annual" }).premiumDollars).toBe("must_be_positive");
    });
    it("accepts one cent, and refuses a fraction of a cent", () => {
      expect(problems({ premiumDollars: "0.01", premiumFrequency: "monthly" })).toEqual({});
      expect(problems({ premiumDollars: "0.005", premiumFrequency: "monthly" }).premiumDollars).toBe("not_a_number");
    });
    it("rejects text", () => {
      expect(problems({ premiumDollars: "abc", premiumFrequency: "annual" }).premiumDollars).toBe("not_a_number");
    });
    it("asks how often it is billed when a premium has no period", () => {
      expect(problems({ premiumDollars: "1200" }).premiumFrequency).toBe("billed_required");
    });
    it("accepts a billing period with no premium", () => {
      expect(problems({ premiumFrequency: "monthly" })).toEqual({});
    });
  });

  describe.each(["coverageDollars", "feesAndTaxesDollars", "deductibleDollars"] as const)("%s (zero or more)", (field) => {
    it("accepts zero", () => {
      expect(problems({ [field]: "0" })).toEqual({});
    });
    it("rejects a negative amount and text", () => {
      expect(problems({ [field]: "-1" })[field]).toBe("negative");
      expect(problems({ [field]: "abc" })[field]).toBe("not_a_number");
    });
  });

  describe("decimal separators", () => {
    it.each([["1250,50"], ["1.250,50"], ["$1.250,50"], ["1 250,5"]])("reads %s on a comma keypad", (amount) => {
      expect(problems({ premiumDollars: amount, premiumFrequency: "annual", coverageDollars: amount }, ",")).toEqual({});
    });
    it.each([["1250.50"], ["1,250.50"], ["$1,250"], ["$ 1,250.5"]])("reads %s on a dot keypad", (amount) => {
      expect(problems({ premiumDollars: amount, premiumFrequency: "annual", deductibleDollars: amount }, ".")).toEqual({});
    });
    it("won't guess whether 1,234 is cents or thousands on a comma keypad", () => {
      expect(problems({ coverageDollars: "1,234" }, ",").coverageDollars).toBe("not_a_number");
      expect(problems({ premiumDollars: "1,234", premiumFrequency: "annual" }, ",").premiumDollars).toBe("not_a_number");
    });
    it.each([["-5"], ["-5,50"], ["-$5"], ["- 1.250,50"]])("keeps saying %s is negative on a comma keypad", (amount) => {
      expect(problems({ deductibleDollars: amount }, ",").deductibleDollars).toBe("negative");
      expect(problems({ premiumDollars: amount, premiumFrequency: "annual" }, ",").premiumDollars).toBe("must_be_positive");
    });
    it("takes a blank optional amount", () => {
      expect(problems({ coverageDollars: "  ", deductibleDollars: "" }, ",")).toEqual({});
    });
    it("calls a minus sign with nothing readable after it text", () => {
      expect(problems({ deductibleDollars: "-" }, ",").deductibleDollars).toBe("not_a_number");
    });
  });

  describe("wind and hail deductible (above 0, up to 100, two decimals)", () => {
    it.each(["0", "0.00", "-1", "100.5", "101"])("rejects %s", (windHailPct) => {
      expect(problems({ windHailPct }).windHailPct).toBe("wind_hail_out_of_range");
    });
    it.each(["0.001", "2.555", "99.999"])("rejects %s for having 3 decimals", (windHailPct) => {
      expect(problems({ windHailPct }).windHailPct).toBe("wind_hail_decimals");
    });
    it.each(["0.01", "2", "2.5", "2.50", "2.500", "100", "100.00"])("accepts %s", (windHailPct) => {
      expect(problems({ windHailPct })).toEqual({});
    });
    it("rejects text", () => {
      expect(problems({ windHailPct: "abc" }).windHailPct).toBe("not_a_number");
    });
    it.each(["2,5", "2,50", "2.5", "100,00", " 0,01 "])("accepts %s on a decimal-comma phone", (windHailPct) => {
      expect(problems({ windHailPct }, ",")).toEqual({});
    });
    it("checks a decimal-comma percentage by the same rules", () => {
      expect(problems({ windHailPct: "2,555" }, ",").windHailPct).toBe("wind_hail_decimals");
      expect(problems({ windHailPct: "100,5" }, ",").windHailPct).toBe("wind_hail_out_of_range");
      expect(problems({ windHailPct: "-2,5" }, ",").windHailPct).toBe("wind_hail_out_of_range");
      expect(problems({ windHailPct: "2,5,0" }, ",").windHailPct).toBe("not_a_number");
    });
    it("never reads a comma as the decimal mark on a \".\" phone, where it groups thousands", () => {
      expect(problems({ windHailPct: "2,5" }, ".").windHailPct).toBe("not_a_number");
    });
  });

  describe("dates", () => {
    it("rejects an end before the start, and allows the same day", () => {
      expect(problems({ effectiveDate: "2026-02-01", expirationDate: "2026-01-01" }).expirationDate).toBe("dates_order");
      expect(problems({ effectiveDate: "2026-01-01", expirationDate: "2026-01-01" })).toEqual({});
    });
  });

  it("shows the decimal example in the person's decimal mark", () => {
    expect(insurancePolicyProblemMessages(",").wind_hail_decimals).toContain("2,5");
    expect(insurancePolicyProblemMessages(".").wind_hail_decimals).toContain("2.5");
  });

  it("has plain wording for every problem", () => {
    expect(Object.keys(insurancePolicyProblemMessages(".")).sort()).toEqual([
      "billed_required",
      "dates_order",
      "must_be_positive",
      "name_required",
      "negative",
      "not_a_number",
      "too_long",
      "wind_hail_decimals",
      "wind_hail_out_of_range",
    ]);
  });
});
