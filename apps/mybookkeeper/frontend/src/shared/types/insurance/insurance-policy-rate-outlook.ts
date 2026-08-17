import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/** What the dwelling filings say about one policy's next renewal. */
export interface InsurancePolicyRateOutlook {
  policy_id: string;
  policy_name: string;
  property_name: string | null;
  carrier: string | null;
  expiration_date: string | null;
  /** Annualised, so a monthly policy is comparable to the projection. */
  current_premium_cents: number | null;
  filings: InsuranceRateFiling[];
  /**
   * Null means nothing in force applied — which is not 0.0%. Zero means the
   * carrier filed and held its rates flat, and that is worth showing.
   */
  projected_change_pct: number | null;
  projected_premium_cents: number | null;
  /** Why no outlook could be produced. Shown instead of an empty list. */
  unavailable_reason: string | null;
}
