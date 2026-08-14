import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";
import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Full insurance policy with attachments.
 *
 * Mirrors ``schemas/insurance/insurance_policy_response.py``.
 */
export interface InsurancePolicyDetail {
  id: string;
  user_id: string;
  organization_id: string;
  property_id: string;
  property_name: string | null;
  /** The document this policy's numbers were read from, when it was read. */
  source_document_id: string | null;
  policy_name: string;
  carrier: string | null;
  policy_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  coverage_amount_cents: number | null;
  premium_cents: number | null;
  premium_frequency: InsurancePremiumFrequency | null;
  /** Fees, surcharges and taxes for the policy term, not per billing period. */
  fees_and_taxes_cents: number | null;
  deductible_cents: number | null;
  wind_hail_deductible_pct: string | null;
  /**
   * Derived server-side from premium + frequency; never sent on write.
   * The premium ALONE — this is the half comparable to a benchmark.
   */
  annual_premium_cents: number | null;
  /** A year of premium plus the term's fees and taxes — what is paid. */
  annual_total_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  attachments: InsurancePolicyAttachment[];
}
