import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

export interface SignedLeaseListArgs {
  applicant_id?: string;
  listing_id?: string;
  status?: SignedLeaseStatus;
  limit?: number;
  offset?: number;
}
