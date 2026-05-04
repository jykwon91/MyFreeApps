import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";

/**
 * Full insurance policy with attachments.
 *
 * Mirrors ``schemas/insurance/insurance_policy_response.py``.
 */
export interface InsurancePolicyDetail {
  id: string;
  user_id: string;
  organization_id: string;
  listing_id: string;
  policy_name: string;
  carrier: string | null;
  policy_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  coverage_amount_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  attachments: InsurancePolicyAttachment[];
}
