/**
 * Unit tests for overlaying a read declarations page onto the policy form.
 *
 * The rule these pin: a draft only ever *fills* the form. Someone who typed the
 * policy number from memory before reaching for the dec page must not lose it
 * because the scan was too dark to read that line.
 *
 * The other half is what must NOT be pre-filled. Every value here ends up in a
 * saved policy that drives an expiration badge and an are-you-overpaying
 * comparison, and a wrong number that looks confident is worse than a blank
 * field the operator knows to fill.
 */
import { describe, it, expect } from "vitest";
import { applyDraftToForm } from "@/shared/lib/insurance-policy-draft";
import { EMPTY_POLICY_FORM } from "@/shared/lib/insurance-policy-form";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import type { InsurancePolicyFormValues } from "@/shared/types/insurance/insurance-policy-form-values";

const EMPTY_DRAFT: InsurancePolicyDraft = {
  source_document_id: "doc-1",
  policy_name: null,
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
  confidence: "low",
  warnings: [],
  unrepresented: [],
};

function draft(overrides: Partial<InsurancePolicyDraft> = {}): InsurancePolicyDraft {
  return { ...EMPTY_DRAFT, ...overrides };
}

function form(
  overrides: Partial<InsurancePolicyFormValues> = {},
): InsurancePolicyFormValues {
  return { ...EMPTY_POLICY_FORM, ...overrides };
}

describe("applyDraftToForm — filling the form from a dec page", () => {
  it("fills every field the document stated", () => {
    const values = applyDraftToForm(
      form(),
      draft({
        policy_name: "Landlord Protection — 6734 Peerless St",
        carrier: "Texas Mutual",
        policy_number: "TXM-4471902",
        effective_date: "2026-03-01",
        expiration_date: "2027-03-01",
        coverage_amount_cents: 40_000_000,
        premium_cents: 240_000,
        premium_frequency: "annual",
        deductible_cents: 100_000,
        wind_hail_deductible_pct: "2.00",
      }),
    );

    expect(values).toMatchObject({
      policyName: "Landlord Protection — 6734 Peerless St",
      carrier: "Texas Mutual",
      policyNumber: "TXM-4471902",
      effectiveDate: "2026-03-01",
      expirationDate: "2027-03-01",
      coverageDollars: "400000",
      premiumDollars: "2400",
      premiumFrequency: "annual",
      deductibleDollars: "1000",
      windHailPct: "2",
    });
  });

  it("leaves what the operator already typed alone", () => {
    // The reported shape of this bug elsewhere: a read wiped a hand-typed
    // field because the document didn't happen to state it.
    const values = applyDraftToForm(
      form({ policyNumber: "TXM-4471902", notes: "Bound through Jenkins Agency" }),
      draft({ carrier: "Texas Mutual" }),
    );

    expect(values.policyNumber).toBe("TXM-4471902");
    expect(values.notes).toBe("Bound through Jenkins Agency");
    expect(values.carrier).toBe("Texas Mutual");
  });

  it("overwrites a field the document does state", () => {
    // Filling from a document is a deliberate act — the newer reading wins.
    const values = applyDraftToForm(
      form({ carrier: "Foremost" }),
      draft({ carrier: "Texas Mutual" }),
    );

    expect(values.carrier).toBe("Texas Mutual");
  });

  it("changes nothing at all when the document stated nothing", () => {
    const before = form({ policyName: "Landlord Protection" });

    expect(applyDraftToForm(before, draft())).toEqual(before);
  });

  it("keeps a stated zero deductible rather than reading it as unrecorded", () => {
    // First-dollar coverage is a real product. Dropping the zero would show a
    // blank field, and a blank field posts null — a different claim.
    const values = applyDraftToForm(form(), draft({ deductible_cents: 0 }));

    expect(values.deductibleDollars).toBe("0");
  });

  it("trims a padded percentage the way a saved policy seeds the same input", () => {
    // "1.50" and "1.5" are the same number, but the padded form makes an
    // untouched field look edited.
    const values = applyDraftToForm(form(), draft({ wind_hail_deductible_pct: "1.50" }));

    expect(values.windHailPct).toBe("1.5");
  });

  it("carries cents that do not divide evenly into dollars", () => {
    const values = applyDraftToForm(form(), draft({ premium_cents: 240_050 }));

    expect(values.premiumDollars).toBe("2400.5");
  });

  it("ignores a frequency outside the four the picker offers", () => {
    // Pre-selecting "yearly" would leave the picker showing nothing while the
    // operator believes it was filled in.
    const values = applyDraftToForm(
      form(),
      draft({ premium_cents: 240_000, premium_frequency: "yearly" }),
    );

    expect(values.premiumFrequency).toBe("");
    expect(values.premiumDollars).toBe("2400");
  });

  it("does not fill notes from the document", () => {
    // Notes is where the operator keeps their own record of the policy;
    // replacing it with a model's summary costs them something they wrote.
    const values = applyDraftToForm(form(), draft({ notes: "Wind/hail excluded" }));

    expect(values.notes).toBe("");
  });
});
