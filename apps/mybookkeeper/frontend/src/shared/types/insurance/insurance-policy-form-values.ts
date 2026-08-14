/**
 * Raw text state behind the insurance-policy add / edit form.
 *
 * Every field is a string because that is what an ``<input>`` holds; the
 * conversion to the API's cents-and-nulls shape happens in one place,
 * ``shared/lib/insurance-policy-form.ts``.
 */
export interface InsurancePolicyFormValues {
  policyName: string;
  carrier: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  coverageDollars: string;
  premiumDollars: string;
  /** "" until a premium is entered — the pair is required together. */
  premiumFrequency: string;
  /** Fees, surcharges and taxes for the policy term — not per billing period. */
  feesAndTaxesDollars: string;
  deductibleDollars: string;
  windHailPct: string;
  notes: string;
}
