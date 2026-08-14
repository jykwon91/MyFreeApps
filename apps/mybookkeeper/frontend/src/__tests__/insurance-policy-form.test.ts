/**
 * Unit tests for the insurance-policy form ↔ API conversion.
 *
 * The blank-field cases matter most: `Number("")` is 0, so a naive conversion
 * posts a real zero premium ("free") or zero deductible ("first-dollar
 * coverage") for a field the operator never filled in.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_POLICY_FORM,
  dollarsToCents,
  policyToFormValues,
  toPolicyPayload,
} from "@/shared/lib/insurance-policy-form";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";

const POLICY: InsurancePolicyDetail = {
  id: "policy-abc",
  user_id: "user-1",
  organization_id: "org-1",
  property_id: "property-1",
  property_name: "6734 Peerless St",
  source_document_id: null,
  policy_name: "Landlord Insurance",
  carrier: "State Farm",
  policy_number: "POL-12345",
  effective_date: "2025-01-01",
  expiration_date: "2026-01-01",
  coverage_amount_cents: 50000000,
  premium_cents: 11200,
  premium_frequency: "monthly",
  fees_and_taxes_cents: 30000,
  deductible_cents: 250000,
  wind_hail_deductible_pct: "2.00",
  annual_premium_cents: 134400,
  annual_total_cents: 164400,
  notes: "Annual renewal reminder set.",
  attachments: [],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("dollarsToCents", () => {
  it("converts whole dollars", () => {
    expect(dollarsToCents("1240")).toBe(124000);
  });

  it("converts a decimal amount without float drift", () => {
    expect(dollarsToCents("125.50")).toBe(12550);
    expect(dollarsToCents("0.07")).toBe(7);
  });

  it("returns null for a blank field rather than zero", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
  });

  it("returns null for an unparseable value", () => {
    expect(dollarsToCents("abc")).toBeNull();
  });

  it("keeps a typed zero, which is a real claim", () => {
    expect(dollarsToCents("0")).toBe(0);
  });
});

describe("toPolicyPayload", () => {
  it("posts nulls for every optional field left blank", () => {
    const payload = toPolicyPayload({ ...EMPTY_POLICY_FORM, policyName: "Policy" });
    expect(payload).toEqual({
      policy_name: "Policy",
      carrier: null,
      policy_number: null,
      effective_date: null,
      expiration_date: null,
      coverage_amount_cents: null,
      premium_cents: null,
      premium_frequency: null,
      fees_and_taxes_cents: null,
      deductible_cents: null,
      wind_hail_deductible_pct: null,
      notes: null,
    });
  });

  it("posts a complete premium pair", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      premiumDollars: "112",
      premiumFrequency: "monthly",
    });
    expect(payload.premium_cents).toBe(11200);
    expect(payload.premium_frequency).toBe("monthly");
  });

  it("drops a frequency chosen without an amount", () => {
    // The backend rejects a half-set pair; a user who picked a period but never
    // typed a number did not record a premium.
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      premiumFrequency: "annual",
    });
    expect(payload.premium_cents).toBeNull();
    expect(payload.premium_frequency).toBeNull();
  });

  it("drops an amount typed without a frequency", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      premiumDollars: "1240",
    });
    expect(payload.premium_cents).toBeNull();
    expect(payload.premium_frequency).toBeNull();
  });

  it("drops a zero premium — the backend requires a positive amount", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      premiumDollars: "0",
      premiumFrequency: "annual",
    });
    expect(payload.premium_cents).toBeNull();
    expect(payload.premium_frequency).toBeNull();
  });

  it("posts fees and taxes apart from the premium", () => {
    // The real 6732 Peerless renewal. Typed as one $2,985.17 figure these
    // become a premium 15% over what the coverage is actually priced at, and
    // the overpaying comparison has no way to tell.
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Lloyd's Certificate TDP 3",
      premiumDollars: "2591",
      premiumFrequency: "annual",
      feesAndTaxesDollars: "394.17",
    });

    expect(payload.premium_cents).toBe(259100);
    expect(payload.fees_and_taxes_cents).toBe(39417);
    expect(payload.premium_cents! + payload.fees_and_taxes_cents!).toBe(298517);
  });

  it("keeps zero fees, which is what an admitted carrier charges", () => {
    // Distinct from a blank field: one says "none", the other "not recorded".
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      feesAndTaxesDollars: "0",
    });

    expect(payload.fees_and_taxes_cents).toBe(0);
  });

  it("keeps a zero deductible, which is a real policy term", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      deductibleDollars: "0",
    });
    expect(payload.deductible_cents).toBe(0);
  });

  it("trims surrounding whitespace from text fields", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "  Policy  ",
      carrier: "  State Farm  ",
    });
    expect(payload.policy_name).toBe("Policy");
    expect(payload.carrier).toBe("State Farm");
  });

  it("posts the wind/hail percentage as a string, matching the Numeric column", () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      policyName: "Policy",
      windHailPct: "2",
    });
    expect(payload.wind_hail_deductible_pct).toBe("2");
  });
});

describe("policyToFormValues", () => {
  it("seeds every field from the stored policy", () => {
    expect(policyToFormValues(POLICY)).toEqual({
      policyName: "Landlord Insurance",
      carrier: "State Farm",
      policyNumber: "POL-12345",
      effectiveDate: "2025-01-01",
      expirationDate: "2026-01-01",
      coverageDollars: "500000",
      premiumDollars: "112",
      premiumFrequency: "monthly",
      feesAndTaxesDollars: "300",
      deductibleDollars: "2500",
      windHailPct: "2.00",
      notes: "Annual renewal reminder set.",
    });
  });

  it("maps unrecorded fields to blank inputs, not to zeros", () => {
    const values = policyToFormValues({
      ...POLICY,
      carrier: null,
      policy_number: null,
      effective_date: null,
      expiration_date: null,
      coverage_amount_cents: null,
      premium_cents: null,
      premium_frequency: null,
      fees_and_taxes_cents: null,
      deductible_cents: null,
      wind_hail_deductible_pct: null,
      notes: null,
    });
    expect(values).toEqual({
      ...EMPTY_POLICY_FORM,
      policyName: "Landlord Insurance",
    });
  });

  it("round-trips a policy through the form back to the same payload", () => {
    const payload = toPolicyPayload(policyToFormValues(POLICY));
    expect(payload.premium_cents).toBe(POLICY.premium_cents);
    expect(payload.premium_frequency).toBe(POLICY.premium_frequency);
    expect(payload.deductible_cents).toBe(POLICY.deductible_cents);
    expect(payload.coverage_amount_cents).toBe(POLICY.coverage_amount_cents);
    expect(payload.wind_hail_deductible_pct).toBe(POLICY.wind_hail_deductible_pct);
  });
});
