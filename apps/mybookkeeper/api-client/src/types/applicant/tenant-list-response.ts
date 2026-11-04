import type { ApplicantSummary } from "./applicant-summary";

/**
 * Mirrors backend TenantListResponse — paginated applicants at stage=lease_signed.
 */
export interface TenantListResponse {
  items: ApplicantSummary[];
  total: number;
  has_more: boolean;
}
