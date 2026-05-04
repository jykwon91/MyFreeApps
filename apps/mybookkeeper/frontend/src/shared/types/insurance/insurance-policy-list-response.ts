import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";

/**
 * Paginated list response for insurance policies.
 *
 * Mirrors ``schemas/insurance/insurance_policy_list_response.py``.
 */
export interface InsurancePolicyListResponse {
  items: InsurancePolicySummary[];
  total: number;
  has_more: boolean;
}
